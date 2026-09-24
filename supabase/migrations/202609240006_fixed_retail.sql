-- Retain historical market rows; public application accepts only verified fixed retail offers.
alter table public.offers drop constraint active_offer_region;
alter table public.offers add constraint active_offer_region check (
 not active or coalesce(
   (payload->>'offerKind'='retail' and payload->>'purchaseType'='fixed'
    and payload->>'market' in ('US','EU') and length(payload->>'warehouseCountry')=2
    and jsonb_typeof(payload->'sizePrices')='array' and jsonb_array_length(payload->'sizePrices')>0
    and payload->'originalPrice'='null'::jsonb and payload->'originalKzt'='null'::jsonb and (payload->>'discount')::numeric=0)
   or (payload->>'offerKind'='market' and payload->>'market'='US' and payload->>'currency'='USD'
    and payload->'originalPrice'='null'::jsonb and payload->'originalKzt'='null'::jsonb
    and (payload->>'discount')::numeric=0 and length(payload->>'sourceUpdatedAt')>0)
   or (payload #>> '{delivery,country}'='KZ'
    and payload #>> '{delivery,basis}' in ('merchant-feed','ebay-filter')
    and length(payload #>> '{delivery,checkedAt}')>0
    and payload #>> '{delivery,policyUrl}' like 'https://%'), false)
);
