-- Market prices have no invented previous price or delivery claim.
alter table public.offers drop constraint active_offer_delivery_kz;
alter table public.offers add constraint active_offer_region check (
 not active or coalesce(
   (payload->>'offerKind'='market' and payload->>'market'='US' and payload->>'currency'='USD'
    and payload->'originalPrice'='null'::jsonb and payload->'originalKzt'='null'::jsonb
    and (payload->>'discount')::numeric=0 and length(payload->>'sourceUpdatedAt')>0)
   or (payload #>> '{delivery,country}'='KZ'
    and payload #>> '{delivery,basis}' in ('merchant-feed','ebay-filter')
    and length(payload #>> '{delivery,checkedAt}')>0
    and payload #>> '{delivery,policyUrl}' like 'https://%'), false)
);

create or replace function public.offer_visible(p jsonb,max_age_hours integer default 36) returns boolean
language plpgsql stable set search_path=public,pg_temp as $$
declare checked timestamptz;
begin
 checked := (p->>'updatedAt')::timestamptz;
 if p ? 'sourceUpdatedAt' and (p->>'sourceUpdatedAt')::timestamptz < now()-make_interval(hours=>greatest(1,least(max_age_hours,168))) then return false; end if;
 if checked is null or checked > now()+interval '1 hour' then return false; end if;
 if p ? 'saleStartsAt' and (p->>'saleStartsAt')::timestamptz > now() then return false; end if;
 if p ? 'saleEndsAt' and (p->>'saleEndsAt')::timestamptz <= now() then return false; end if;
 return coalesce(checked >= now()-make_interval(hours=>greatest(1,least(max_age_hours,168)))
   or public.promotion_deadline(p)>now(),false);
exception when others then return false;
end $$;
