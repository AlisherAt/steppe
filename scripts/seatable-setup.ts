import { loadEnvFile } from 'node:process';
import { seaClient } from '../src/lib/server/seatable-client';
import { seaStore } from '../src/lib/server/seatable-store';
import { getAdapters } from '../src/lib/server/sources';
import { safeCode } from '../src/lib/server/http';
try {
  loadEnvFile('.env.local');
} catch {
  /* Vercel/CI provide env directly. */
}
async function main() {
  const base = await seaClient.authenticate();
  const tables = await seaClient.ensureSchema(process.argv.includes('--create'));
  if (process.argv.includes('--create')) await seaStore.ensureSources(getAdapters());
  const state = await seaStore.sourceStatuses();
  if (process.argv.includes('--verify-write')) {
    const run = await seaStore.start('__connection_check');
    try {
      await seaStore.failure(run, 'CONNECTION_CHECK');
      if (
        !(await seaStore.runs()).some(
          (r) => r.id === run.id && r.status === 'error' && r.error === 'CONNECTION_CHECK',
        )
      )
        throw new Error('write verification');
    } finally {
      await seaClient.remove('STEPPE_Runs', [run._id]);
    }
  }
  console.log(
    JSON.stringify({
      ok: true,
      base: base.dtable_name,
      workspace: base.workspace_id,
      tables,
      sources: state.length,
    }),
  );
}
main().catch((e) => {
  console.error(JSON.stringify({ ok: false, code: safeCode(e) }));
  process.exitCode = 1;
});
