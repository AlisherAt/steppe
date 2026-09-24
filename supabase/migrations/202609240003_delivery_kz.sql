-- Прежние предложения без подтверждения региона сохраняются, но скрываются.
update public.offers set active=false
where active and coalesce(payload #>> '{delivery,country}', '') <> 'KZ';

alter table public.offers add constraint active_offer_delivery_kz check (
  not active or coalesce(
    payload #>> '{delivery,country}' = 'KZ'
    and payload #>> '{delivery,basis}' in ('merchant-feed','ebay-filter')
    and length(payload #>> '{delivery,checkedAt}') > 0
    and payload #>> '{delivery,policyUrl}' like 'https://%', false)
);
insert into public.sources(id,name) values
 ('farfetch','FARFETCH'), ('yoox','YOOX'), ('tennisnuts','Tennisnuts')
on conflict(id) do nothing;
update public.sources s set offer_count=(select count(*) from public.offers o where o.source_id=s.id and o.active);
