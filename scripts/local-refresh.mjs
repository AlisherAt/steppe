import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, appendFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { acquireLock, directScraperEnv } from './local-refresh-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const nikeOnly = process.argv.includes('--nike');
const directory = resolve(
  root,
  nikeOnly ? 'artifacts/local-nike-refresh' : 'artifacts/local-refresh',
);

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
    if (nikeOnly) {
      // Ручной сбор и задача Планировщика используют один файл результатов.
      // Если ручной сбор уже идёт, плановый запуск спокойно пропускается.
      await mkdir(resolve(root, 'artifacts/nike-live'), { recursive: true });
      const slot = await acquireLock(resolve(root, 'artifacts/nike-live/collector.lock'));
      if (!slot) {
        state.status = 'skipped';
        state.reason = 'nike_collector_running';
        await log({ event: 'skipped', reason: state.reason });
        return;
      }
      await slot();
    }
    process.loadEnvFile(resolve(root, '.env.scheduler.local'));
    for (const key of Object.keys(process.env)) {
      if (/^(https?|all|no)_proxy$/i.test(key)) delete process.env[key];
    }
    delete process.env.NODE_USE_ENV_PROXY;
    // Отдельный кэш создаётся от имени пользователя Планировщика, а не среды разработки.
    process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'artifacts/local-browsers');
    const permissions = JSON.parse(process.env.SCRAPER_PERMISSIONS_JSON || '{}');
    if (!Object.keys(permissions).length) throw Error('SCRAPER_PERMISSIONS_MISSING');
    // Только публичный сборщик получает отдельное окружение без ключей сайта.
    // Системный VPN этот код не отключает.
    const env = directScraperEnv(process.env);
    delete env.SCRAPER_SOURCE_IDS;
    state.stage = 'browser_setup';
    await save();
    await log({
      event: 'started',
      connection: 'direct',
      sources: nikeOnly ? ['nike'] : ['puma', 'reebok'],
    });
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
    if (!nikeOnly)
      await runChild(
        [
          '-e',
          "require('node:child_process').execFileSync(process.env.PYTHON_EXECUTABLE || 'python', ['-c', 'import bs4, soupsieve'], {stdio:'inherit'})",
        ],
        20000,
      );
    state.stage = 'scraping';
    await save();
    await runChild(
      [nikeOnly ? 'scripts/scrape-nike.mjs' : 'scripts/scrape-sales.mjs'],
      115 * 60_000,
    );
    const raw = await readFile(
      resolve(root, nikeOnly ? 'artifacts/nike-report.json' : 'artifacts/scraper.json'),
      'utf8',
    );
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
    state.stage = 'github_publication';
    await save();
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const publicationDirectory = resolve(directory, `${stamp}.catalog`);
    const execute = async (args) => {
      const { stdout } = await promisify(execFile)(process.execPath, args, {
        cwd: root,
        windowsHide: true,
        timeout: 320000,
        env: process.env,
      });
      await appendFile(logPath, stdout);
      process.stdout.write(stdout);
    };
    await execute([
      'node_modules/tsx/dist/cli.mjs',
      'scripts/build-catalog.ts',
      resolve(directory, `${stamp}.scrape.json`),
      '--out',
      publicationDirectory,
    ]);
    await execute(['scripts/publish-catalog.mjs', publicationDirectory]);
    state.uploaded = true;
    state.refresh = { updated: report.reports.filter((r) => r.count > 0).length };
    state.status = report.reports.some((r) => ['error', 'time_limit', 'partial'].includes(r.status))
      ? 'partial'
      : 'success';
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
