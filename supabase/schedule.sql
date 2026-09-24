-- Выполнить ПОСЛЕ миграции и деплоя Vercel. Включите pg_cron, pg_net и Vault в Supabase.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Создайте в Supabase Vault два секрета через Dashboard:
-- steppe_site_url = https://ваш-домен.vercel.app (без / в конце)
-- steppe_cron_secret = то же значение, что CRON_SECRET в Vercel
do $$ begin
 if not exists(select 1 from vault.decrypted_secrets where name='steppe_site_url') or
    not exists(select 1 from vault.decrypted_secrets where name='steppe_cron_secret') then
   raise exception 'Сначала добавьте steppe_site_url и steppe_cron_secret в Vault';
 end if;
end $$;
-- Один именованный job; повторное выполнение обновляет расписание.
select cron.schedule('steppe-refresh-twice-daily','0 1,13 * * *',$job$
 select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='steppe_site_url') || '/api/cron/refresh',
   headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='steppe_cron_secret')),
   body := '{}'::jsonb, timeout_milliseconds := 305000
 );
$job$);
-- 01:00 / 13:00 UTC = 06:00 / 18:00 Алматы.
-- Контроль HTTP-результатов: select status_code,content,error_msg,created from net._http_response order by created desc limit 20;
-- Контроль обновлений: select * from public.refresh_runs order by finished_at desc limit 20;
-- Остановить: select cron.unschedule('steppe-refresh-twice-daily');
