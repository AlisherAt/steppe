import { open, readFile, unlink } from 'node:fs/promises';

export function directScraperEnv(env) {
  const result = { ...env, PYTHON_SALE_PARSERS: '1' };
  for (const key of Object.keys(result)) {
    if (
      /^(https?|all|no)_proxy$/i.test(key) ||
      /^SCRAPER_PROXY_/.test(key) ||
      /^(CRON_SECRET|SEATABLE_|SUPABASE_|KICKS_API_KEY|GITHUB_TOKEN)/.test(key)
    )
      delete result[key];
  }
  delete result.NODE_USE_ENV_PROXY;
  return result;
}

export async function acquireLock(path) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      );
      await handle.close();
      return async () => {
        await unlink(path).catch(() => {});
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner;
      try {
        owner = JSON.parse(await readFile(path, 'utf8'));
      } catch {
        return null;
      }
      if (!Number.isInteger(owner.pid) || owner.pid <= 0) return null;
      try {
        process.kill(owner.pid, 0);
        return null;
      } catch (error) {
        if (error.code !== 'ESRCH') return null;
        await unlink(path).catch(() => {});
      }
    }
  }
  return null;
}

export function summarizeRefresh(status, body) {
  if (![200, 502].includes(status) || !Array.isArray(body?.results))
    throw Error(`REFRESH_HTTP_${status}`);
  const results = body.results.map((row) => ({
    source: String(row.source).slice(0, 80),
    status: String(row.status).slice(0, 40),
    ...(Number.isInteger(row.count) ? { count: row.count } : {}),
    ...(typeof row.code === 'string' ? { code: row.code.slice(0, 100) } : {}),
  }));
  return {
    results,
    updated: results.filter((row) => row.status === 'success').length,
    failed: results.filter((row) => row.status === 'error').length,
  };
}
