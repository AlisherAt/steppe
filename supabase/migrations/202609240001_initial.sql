-- Выполнить в Supabase SQL Editor или через supabase db push.
create table public.sources (
  id text primary key, name text not null, paused boolean not null default false,
  last_success_at timestamptz, last_attempt_at timestamptz, last_error text,
  offer_count integer not null default 0 check (offer_count >= 0)
);
insert into public.sources(id,name) values ('nike','Nike'),('adidas','Adidas');

create table public.offers (
  id text primary key,
  source_id text not null references public.sources(id),
  external_id text not null,
  payload jsonb not null check (payload->>'demo' = 'false'),
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id, external_id)
);
create index offers_active_source on public.offers(source_id,updated_at desc) where active;
create table public.exchange_rates (
  id bigint generated always as identity primary key,
  currency text not null check (length(currency)=3), rate numeric(24,12) not null check (rate>0),
  source text not null, as_of timestamptz not null, fetched_at timestamptz not null,
  unique(currency,source,as_of,rate)
);
create table public.refresh_runs (
  id bigint generated always as identity primary key,
  source_id text not null references public.sources(id), started_at timestamptz not null,
  finished_at timestamptz not null default now(), status text not null check(status in ('success','error')),
  product_count integer, error_code text
);
create index refresh_runs_source_time on public.refresh_runs(source_id,finished_at desc);
create table public.refresh_locks (name text primary key, owner uuid not null, expires_at timestamptz not null);

alter table public.sources enable row level security;
alter table public.offers enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.refresh_runs enable row level security;
alter table public.refresh_locks enable row level security;
-- Клиент не обращается к БД напрямую. Чтение — через ограниченные API Next.js.
revoke all on public.sources,public.offers,public.exchange_rates,public.refresh_runs,public.refresh_locks from anon,authenticated;
grant all on public.sources,public.offers,public.exchange_rates,public.refresh_runs,public.refresh_locks to service_role;
grant usage,select on all sequences in schema public to service_role;

create function public.acquire_refresh_lock(owner_id uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare acquired boolean;
begin
  insert into refresh_locks(name,owner,expires_at) values ('catalog',owner_id,now()+interval '120 seconds')
  on conflict(name) do update set owner=excluded.owner,expires_at=excluded.expires_at where refresh_locks.expires_at < now()
  returning true into acquired;
  return coalesce(acquired,false);
end $$;
create function public.release_refresh_lock(owner_id uuid) returns void
language sql set search_path = public, pg_temp as $$ delete from refresh_locks where name='catalog' and owner=owner_id $$;

create function public.commit_source_refresh(source_id text,items jsonb,started_at timestamptz,rate_records jsonb,lock_owner uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
declare p jsonb; r jsonb;
begin
  if not exists(select 1 from refresh_locks where name='catalog' and owner=lock_owner and expires_at>now()) then raise exception 'LOCK_EXPIRED'; end if;
  if not exists(select 1 from sources s where s.id=source_id and not s.paused for update) then raise exception 'SOURCE_PAUSED'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)>1000 then raise exception 'INVALID_BATCH'; end if;
  for p in select value from jsonb_array_elements(items) loop
    if p->>'sourceId' <> source_id or p->>'demo' <> 'false' or (p->>'saleKzt')::numeric<=0 or (p->>'saleKzt')::numeric>(p->>'originalKzt')::numeric then raise exception 'INVALID_PRODUCT'; end if;
    insert into offers(id,source_id,external_id,payload,active,updated_at)
    values(p->>'id',source_id,p->>'externalId',jsonb_set(p,'{firstSeenAt}',to_jsonb(now())),true,now())
    on conflict(id) do update set payload=jsonb_set(excluded.payload,'{firstSeenAt}',to_jsonb(offers.first_seen_at)),active=true,updated_at=now();
  end loop;
  update offers o set active=false where o.source_id=commit_source_refresh.source_id and not exists(select 1 from jsonb_array_elements(items) as incoming(value) where incoming.value->>'id'=o.id);
  for r in select value from jsonb_array_elements(rate_records) loop
    insert into exchange_rates(currency,rate,source,as_of,fetched_at) values(r->>'currency',(r->>'value')::numeric,r->>'source',(r->>'asOf')::timestamptz,(r->>'fetchedAt')::timestamptz) on conflict do nothing;
  end loop;
  update sources s set last_success_at=now(),last_attempt_at=started_at,last_error=null,offer_count=jsonb_array_length(items) where s.id=source_id;
  insert into refresh_runs(source_id,started_at,status,product_count) values(source_id,started_at,'success',jsonb_array_length(items));
end $$;

create function public.record_refresh_failure(source_id text,started_at timestamptz,error_code text,lock_owner uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from refresh_locks where name='catalog' and owner=lock_owner and expires_at>now()) then raise exception 'LOCK_EXPIRED'; end if;
  update sources s set last_attempt_at=started_at,last_error=error_code where s.id=source_id;
  insert into refresh_runs(source_id,started_at,status,error_code) values(source_id,started_at,'error',error_code);
end $$;

create function public.search_catalog(filters jsonb,page_size integer default 12,max_age_hours integer default 36) returns jsonb
language sql stable set search_path = public, pg_temp as $$
with available as (
 select o.payload as p,o.id,o.first_seen_at from offers o join sources s on s.id=o.source_id
 where o.active and not s.paused and o.updated_at>now()-make_interval(hours=>greatest(1,least(max_age_hours,168)))
), matched as (
 select * from available where
 (coalesce(filters->>'q','')='' or strpos(lower((p->>'brand')||' '||(p->>'name')),lower(filters->>'q'))>0)
 and (coalesce(jsonb_array_length(filters->'brands'),0)=0 or (filters->'brands') ? (p->>'brand'))
 and (coalesce(jsonb_array_length(filters->'sources'),0)=0 or (filters->'sources') ? (p->>'sourceId'))
 and (coalesce(jsonb_array_length(filters->'sizes'),0)=0 or exists(select 1 from jsonb_array_elements_text(filters->'sizes') s where (p->'sizes') ? s))
 and (coalesce(filters->>'gender','')='' or p->>'gender'=filters->>'gender')
 and (coalesce(filters->>'category','')='' or p->>'category'=filters->>'category')
 and (p->>'saleKzt')::numeric>=coalesce((filters->>'minPrice')::numeric,0)
 and (p->>'saleKzt')::numeric<=coalesce((filters->>'maxPrice')::numeric,1000000)
 and (p->>'discount')::integer>=coalesce((filters->>'minDiscount')::integer,0)
), paged as (
 select p from matched order by
 case when filters->>'sort'='discount' then (p->>'discount')::numeric end desc,
 case when filters->>'sort'='price_asc' then (p->>'saleKzt')::numeric end asc,
 case when filters->>'sort'='price_desc' then (p->>'saleKzt')::numeric end desc,
 case when coalesce(filters->>'sort','newest')='newest' then first_seen_at end desc,id asc
 limit greatest(1,least(page_size,48)) offset (greatest(1,coalesce((filters->>'page')::integer,1))-1)*greatest(1,least(page_size,48))
)
select jsonb_build_object(
 'products',coalesce((select jsonb_agg(p) from paged),'[]'::jsonb),
 'total',(select count(*) from matched),
 'facets',jsonb_build_object(
   'brands',coalesce((select jsonb_agg(b order by b) from (select distinct p->>'brand' b from available) t),'[]'::jsonb),
   'sizes',coalesce((select jsonb_agg(s order by s) from (select distinct jsonb_array_elements_text(p->'sizes') s from available) t),'[]'::jsonb),
   'categories',coalesce((select jsonb_agg(c order by c) from (select distinct p->>'category' c from available) t),'[]'::jsonb),
   'sources',coalesce((select jsonb_agg(s) from (select distinct jsonb_build_object('id',p->>'sourceId','name',p->>'sourceName')::jsonb s from available) t),'[]'::jsonb)
 ))
$$;

revoke execute on function public.acquire_refresh_lock(uuid),public.release_refresh_lock(uuid),public.commit_source_refresh(text,jsonb,timestamptz,jsonb,uuid),public.record_refresh_failure(text,timestamptz,text,uuid),public.search_catalog(jsonb,integer,integer) from public,anon,authenticated;
grant execute on function public.acquire_refresh_lock(uuid),public.release_refresh_lock(uuid),public.commit_source_refresh(text,jsonb,timestamptz,jsonb,uuid),public.record_refresh_failure(text,timestamptz,text,uuid),public.search_catalog(jsonb,integer,integer) to service_role;
