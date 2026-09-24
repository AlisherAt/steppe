insert into public.sources(id,name) values
 ('admitad','Магазин через Admitad'),('awin','Магазин через Awin'),
 ('gdeslon','Магазин через «Где Слон?»'),('retailer','Партнёрский магазин'),
 ('google-feed','Магазин с Google-фидом'),('ebay','eBay')
on conflict(id) do nothing;

-- 300 секунд на группу источников; lease дольше maxDuration.
create or replace function public.acquire_refresh_lock(owner_id uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare acquired boolean;
begin
 insert into refresh_locks(name,owner,expires_at) values ('catalog',owner_id,now()+interval '360 seconds')
 on conflict(name) do update set owner=excluded.owner,expires_at=excluded.expires_at where refresh_locks.expires_at<now()
 returning true into acquired;
 return coalesce(acquired,false);
end $$;
revoke execute on function public.acquire_refresh_lock(uuid) from public,anon,authenticated;
grant execute on function public.acquire_refresh_lock(uuid) to service_role;
