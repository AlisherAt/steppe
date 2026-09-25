import { loadEnvFile } from 'node:process';
import { seaClient } from '../src/lib/server/seatable-client';
try {
  loadEnvFile('.env.local');
} catch {
  /* Окружение может быть задано отдельно. */
}
async function main() {
  const username = process.argv[2]?.trim().toLowerCase();
  if (!username || !/^[a-z0-9_]{3,32}$/.test(username))
    throw Error('Укажите логин: npx tsx scripts/admin-grant.ts username');
  await seaClient.ensureSchema(true);
  const users = (await seaClient.rows('STEPPE_Users')).filter((r) => r.username === username);
  if (users.length !== 1) throw Error('Нужен один уже зарегистрированный аккаунт с этим логином.');
  const admins = await seaClient.rows('STEPPE_Admins');
  if (!admins.some((r) => r.user_id === users[0].id))
    await seaClient.append('STEPPE_Admins', [
      { user_id: users[0].id, created_at: new Date().toISOString() },
    ]);
  console.log('Права администратора назначены аккаунту ' + username);
}
main().catch((e) => {
  console.error(
    e.message?.startsWith('Укажите') || e.message?.startsWith('Нужен')
      ? e.message
      : 'Не удалось назначить администратора. Проверьте подключение SeaTable.',
  );
  process.exitCode = 1;
});
