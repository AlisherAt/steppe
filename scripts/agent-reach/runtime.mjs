import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { access, mkdir } from 'node:fs/promises';

const exec = promisify(execFile);
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const venv = resolve(root, 'artifacts/agent-reach-venv');
export const python = resolve(
  venv,
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

// Публичный reader не получает CRON_SECRET, токены SeaTable и другие секреты проекта.
/** @param {Record<string, string | undefined>} env */
export function readerEnvironment(env = process.env) {
  const result = { PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
  for (const [key, value] of Object.entries(env)) {
    if (
      /^(path|systemroot|windir|temp|tmp|userprofile|home|localappdata|appdata|ssl_cert_file|ssl_cert_dir|requests_ca_bundle)$/i.test(
        key,
      ) &&
      value
    )
      result[key] = value;
  }
  return result;
}

export async function readWithAgentReach(url) {
  await access(python).catch(() => {
    throw Error('AGENT_REACH_NOT_INSTALLED');
  });
  let stdout;
  try {
    ({ stdout } = await exec(python, [resolve(root, 'scripts/agent-reach/reader.py'), url], {
      cwd: root,
      env: readerEnvironment(),
      windowsHide: true,
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    }));
  } catch {
    throw Error('AGENT_REACH_PROCESS_FAILED');
  }
  const result = JSON.parse(stdout);
  if (result.error) throw Error(result.error);
  return result;
}

async function main() {
  const command = process.argv[2];
  if (command === 'install') {
    await mkdir(resolve(root, 'artifacts'), { recursive: true });
    try {
      await access(python);
    } catch {
      await exec(process.env.PYTHON_EXECUTABLE || 'python', ['-m', 'venv', venv], {
        cwd: root,
        windowsHide: true,
        timeout: 120_000,
        env: readerEnvironment(),
      });
    }
    console.log('Установка Agent Reach в отдельное окружение проекта…');
    await exec(
      python,
      ['-m', 'pip', 'install', '-r', resolve(root, 'scripts/agent-reach/requirements.txt')],
      {
        cwd: root,
        env: readerEnvironment(),
        windowsHide: true,
        timeout: 600_000,
        maxBuffer: 4_000_000,
      },
    );
    await exec(python, ['-m', 'pip', 'check'], { windowsHide: true, env: readerEnvironment() });
  } else if (command !== 'doctor') throw Error('USE_INSTALL_OR_DOCTOR');
  console.log(JSON.stringify(await readWithAgentReach('doctor'), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
