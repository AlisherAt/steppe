-- Сроки акций из фида, без дополнительных запросов к магазину.
alter table public.sources add column next_refresh_at timestamptz;
create function public.promotion_deadline(p jsonb) returns timestamptz
language plpgsql immutable set search_path=public,pg_temp as $$
declare finish timestamptz; checked timestamptz;
begin
 finish := (p->>'saleEndsAt')::timestamptz; checked := (p->>'updatedAt')::timestamptz;
 if finish > checked then return least(finish,checked+interval '31 days'); end if;
 return null;
exception when others then return null;
end $$;
create function public.offer_visible(p jsonb,max_age_hours integer default 36) returns boolean
language plpgsql stable set search_path=public,pg_temp as $$
declare checked timestamptz;
begin
 checked := (p->>'updatedAt')::timestamptz;
 if checked is null or checked > now()+interval '1 hour' then return false; end if;
 if p ? 'saleStartsAt' and (p->>'saleStartsAt')::timestamptz > now() then return false; end if;
 if p ? 'saleEndsAt' and (p->>'saleEndsAt')::timestamptz <= now() then return false; end if;
 return coalesce(checked >= now()-make_interval(hours=>greatest(1,least(max_age_hours,168)))
   or public.promotion_deadline(p)>now(),false);
exception when others then return false;
end $$;
create or replace function public.commit_source_refresh(source_id text,items jsonb,started_at timestamptz,rate_records jsonb,lock_owner uuid) returns void
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
  update sources s set last_success_at=now(),last_attempt_at=started_at,last_error=null,offer_count=jsonb_array_length(items),
    next_refresh_at=(select case when count(*) > 0 and count(public.promotion_deadline(value))=count(*)
      then min(public.promotion_deadline(value)) else null end from jsonb_array_elements(items)) where s.id=source_id;
  insert into refresh_runs(source_id,started_at,status,product_count) values(source_id,started_at,'success',jsonb_array_length(items));
end $$;

create or replace function public.search_catalog(filters jsonb,page_size integer default 12,max_age_hours integer default 36) returns jsonb
language sql stable set search_path = public, pg_temp as $$
with available as (
 select o.payload as p,o.id,o.first_seen_at from offers o join sources s on s.id=o.source_id
 where o.active and not s.paused and public.offer_visible(jsonb_set(o.payload,'{updatedAt}',to_jsonb(o.updated_at)), max_age_hours)
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

revoke execute on function public.promotion_deadline(jsonb),public.offer_visible(jsonb,integer) from public,anon,authenticated;
grant execute on function public.promotion_deadline(jsonb),public.offer_visible(jsonb,integer) to service_role;
