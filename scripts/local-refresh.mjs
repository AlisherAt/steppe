import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, appendFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { acquireLock, directScraperEnv, summarizeRefresh } from './local-refresh-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const directory = resolve(root, 'artifacts/local-refresh');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  await mkdir(directory, { recursive: true });
  const release = await acquireLock(resolve(directory, 'running.lock'));
  if (!release) {
    console.log('LOCAL_REFRESH_ALREADY_RUNNING');
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = resolve(directory, `${stamp}.log`);
  const state = { startedAt: new Date().toISOString(), status: 'running', stage: 'configuration' };
  const save = async () => {
    await writeFile(resolve(directory, 'latest.tmp.json'), JSON.stringify(state, null, 2));
    await rename(resolve(directory, 'latest.tmp.json'), resolve(directory, 'latest.json'));
  };
  const log = async (entry) => {
    const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
    await appendFile(logPath, line + '\n');
    console.log(line);
  };
  try {
    process.loadEnvFile(resolve(root, '.env.scheduler.local'));
    for (const key of Object.keys(process.env)) {
      if (/^(https?|all|no)_proxy$/i.test(key)) delete process.env[key];
    }
    delete process.env.NODE_USE_ENV_PROXY;
    // Отдельный кэш создаётся от имени пользователя Планировщика, а не среды разработки.
    process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'artifacts/local-browsers');
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 32) throw Error('CRON_SECRET_MISSING');
    const site = new URL(process.env.STEPPE_SITE_URL || 'https://steppe-gray.vercel.app');
    if (site.protocol !== 'https:' || site.username || site.password)
      throw Error('INVALID_SITE_URL');
    const permissions = JSON.parse(process.env.SCRAPER_PERMISSIONS_JSON || '{}');
    if (!Object.keys(permissions).length) throw Error('SCRAPER_PERMISSIONS_MISSING');
    // Только публичный сборщик получает отдельное окружение без ключей сайта.
    // Системный VPN этот код не отключает.
    const env = directScraperEnv(process.env);
    delete env.SCRAPER_SOURCE_IDS;
    state.stage = 'browser_setup';
    await save();
    await log({ event: 'started', connection: 'direct', sources: ['puma', 'reebok'] });
    const runChild = (args, timeoutMs) =>
      new Promise((resolveRun, reject) => {
        const child = spawn(process.execPath, args, {
          cwd: root,
          env,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let writes = Promise.resolve();
        const output = (chunk) => {
          const text = chunk.toString();
          writes = writes.then(() => appendFile(logPath, text));
          // Ошибки записи обрабатываются после завершения дочернего процесса.
          writes.catch(() => {});
          process.stdout.write(text);
        };
        child.stdout.on('data', output);
        child.stderr.on('data', output);
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, timeoutMs);
        child.on('error', () => {
          clearTimeout(timer);
          reject(Error('SCRAPER_START_FAILED'));
        });
        child.on('close', async (code) => {
          clearTimeout(timer);
          try {
            await writes;
            if (timedOut || code !== 0)
              throw Error(timedOut ? 'SCRAPER_TIMEOUT' : 'SCRAPER_FAILED');
            resolveRun();
          } catch (error) {
            reject(error);
          }
        });
      });
    const { chromium } = await import('@playwright/test');
    const browserReady = await access(chromium.executablePath()).then(
      () => true,
      () => false,
    );
    if (!browserReady) {
      await log({ event: 'installing_local_browser' });
      await runChild(['node_modules/playwright/cli.js', 'install', 'chromium'], 10 * 60_000);
    }
    // Если браузер недоступен, старый/пустой отчёт на сайт не отправляется.
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    await runChild(
      [
        '-e',
        "require('node:child_process').execFileSync(process.env.PYTHON_EXECUTABLE || 'python', ['-c', 'import bs4, soupsieve'], {stdio:'inherit'})",
      ],
      20000,
    );
    state.stage = 'scraping';
    await save();
    await runChild(['scripts/scrape-sales.mjs'], 115 * 60_000);
    const raw = await readFile(resolve(root, 'artifacts/scraper.json'), 'utf8');
    const report = JSON.parse(raw);
    if (
      Date.parse(report.checkedAt) < Date.parse(state.startedAt) ||
      !Array.isArray(report.products)
    )
      throw Error('STALE_SCRAPE_REPORT');
    state.runId = report.runId;
    state.collected = report.products.length;
    state.verified = report.products.filter((p) => p.size_price_verified).length;
    state.sources = report.reports;
    await writeFile(resolve(directory, `${stamp}.scrape.json`), raw);
    state.stage = 'upload';
    await save();
    const post = (path, body, timeout) =>
      fetch(new URL(path, site), {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(timeout),
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        ...(body ? { body } : {}),
      });
    // Повторная отправка того же runId идемпотентна. Магазины повторно не опрашиваются.
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await post('/api/cron/scrape-report', raw, 65000);
        if (!response.ok) throw Error(`UPLOAD_HTTP_${response.status}`);
        if ((await response.json()).stored !== true) throw Error('UPLOAD_NOT_CONFIRMED');
        state.uploaded = true;
        break;
      } catch (error) {
        if (attempt === 3 || /UPLOAD_HTTP_4/.test(error.message)) throw error;
        await log({ event: 'upload_retry', attempt });
        await wait(5000 * attempt);
      }
    }
    state.stage = 'refresh';
    await save();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await post('/api/cron/refresh', undefined, 310000);
      const body = await response.json();
      if (body.skipped && body.reason === 'already_running' && attempt < 3) {
        await wait(10000);
        continue;
      }
      state.refresh = summarizeRefresh(response.status, body);
      break;
    }
    state.status =
      state.refresh.failed ||
      report.reports.some((r) => r.status === 'error' || r.status === 'time_limit')
        ? 'partial'
        : 'success';
    if (state.status === 'partial' && !state.refresh.updated) {
      state.status = 'error';
      state.error = 'NO_SOURCES_UPDATED';
      process.exitCode = 1;
    }
    state.stage = 'finished';
    await log({
      event: 'finished',
      status: state.status,
      collected: state.collected,
      verified: state.verified,
      updatedSources: state.refresh.updated,
    });
  } catch (error) {
    state.status = 'error';
    state.error = /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : 'LOCAL_REFRESH_FAILED';
    await log({ event: 'failed', stage: state.stage, code: state.error });
    process.exitCode = 1;
  } finally {
    state.finishedAt = new Date().toISOString();
    try {
      await save();
    } finally {
      await release();
    }
  }
}
main()
  .then(() => process.exit(process.exitCode || 0))
  .catch(() => {
    console.error('LOCAL_RUNNER_FAILED');
    process.exit(1);
  });
