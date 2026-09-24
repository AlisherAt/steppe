import { loadRates } from '../src/lib/server/rates';
async function main() {
  const rates = await loadRates();
  for (const rate of rates.filter((r) => ['USD', 'EUR', 'RUB', 'KZT'].includes(r.currency)))
    console.log(JSON.stringify(rate));
}
main().catch((error) => {
  console.error(
    'Проверка курса не удалась:',
    error instanceof Error ? error.message : 'неизвестная ошибка',
  );
  process.exitCode = 1;
});
