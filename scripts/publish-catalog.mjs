import { procurementArchive } from './procurement-archive.mjs';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Публикуем только снимки магазинов: рабочая папка и её незавершённые изменения не затрагиваются.
// GitHub Actions использует GITHUB_TOKEN; локальный планировщик — Git Credential Manager.
const repo = 'AlisherAt/steppe';
const directory = process.argv[2];
if (!directory) throw Error('CATALOG_DIRECTORY_REQUIRED');
let token = process.env.STEPPE_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
if (!token) {
  const credential = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  token = credential
    .split('\n')
    .find((line) => line.startsWith('password='))
    ?.slice(9)
    .trim();
}
if (!token) throw Error('GITHUB_CREDENTIAL_REQUIRED');
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    method,
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw Error(`GITHUB_HTTP_${response.status}`);
  return response.json();
}
const candidates = [];
for (const name of await readdir(directory)) {
  const clothing = /^clothing-(?:(?:nike|puma|reebok)-us|uniqlo-(?:jp|kr))\.json$/.test(name);
  if (!clothing && !/^(nike|puma|reebok)-us\.json$/.test(name)) continue;
  const content = await readFile(resolve(directory, name), 'utf8');
  const snapshot = JSON.parse(content);
  if (
    snapshot.version !== 1 ||
    `${clothing ? 'clothing-' : ''}${snapshot.sourceId}.json` !== name ||
    !Array.isArray(snapshot.products) ||
    (!snapshot.products.length && !(clothing && snapshot.complete === true)) ||
    snapshot.products.some(
      (p) =>
        p.demo ||
        p.sourceId !== snapshot.sourceId ||
        (clothing && !['sportswear', 'casual'].includes(p.department)),
    ) ||
    !Number.isFinite(Date.parse(snapshot.checkedAt)) ||
    Date.now() - Date.parse(snapshot.checkedAt) > 36 * 3600000 ||
    Date.parse(snapshot.checkedAt) > Date.now() + 60000
  )
    throw Error('INVALID_CATALOG_SNAPSHOT');
  if (name === 'nike-us.json' && snapshot.products.length > 500) throw Error('NIKE_LIMIT_EXCEEDED');
  candidates.push({ path: `data/catalog/${name}`, content, snapshot });
}
if (!candidates.length) throw Error('NO_CATALOG_SNAPSHOTS');
for (let attempt = 0; attempt < 5; attempt++) {
  const ref = await api('git/ref/heads/main');
  const parent = await api(`git/commits/${ref.object.sha}`);
  const base = await api(`git/trees/${parent.tree.sha}?recursive=1`);
  if (base.truncated) throw Error('GITHUB_TREE_TRUNCATED');
  const changed = [];
  for (const candidate of candidates) {
    const entry = base.tree.find((e) => e.path === candidate.path);
    if (entry) {
      const blob = await api(`git/blobs/${entry.sha}`);
      const existing = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'));
      candidate.snapshot.archivedProducts = procurementArchive(
        existing,
        candidate.snapshot.products,
      );
      candidate.content = JSON.stringify(candidate.snapshot) + '\n';
      // Поздно завершившийся сбор не заменяет более свежие наблюдения.
      if (Date.parse(existing.checkedAt) > Date.parse(candidate.snapshot.checkedAt)) continue;
      if (
        existing.runId === candidate.snapshot.runId &&
        existing.generatedAt >= candidate.snapshot.generatedAt
      )
        continue;
    }
    changed.push({
      path: candidate.path,
      mode: '100644',
      type: 'blob',
      content: candidate.content,
    });
  }
  if (!changed.length) {
    console.log('CATALOG_ALREADY_CURRENT');
    break;
  }
  const tree = await api('git/trees', 'POST', { base_tree: parent.tree.sha, tree: changed });
  const commit = await api('git/commits', 'POST', {
    message: 'Обновить проверенные предложения STEPPE',
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  try {
    await api('git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
    console.log(
      JSON.stringify({ published: true, commit: commit.sha, files: changed.map((f) => f.path) }),
    );
    break;
  } catch (error) {
    if (!['GITHUB_HTTP_409', 'GITHUB_HTTP_422'].includes(error.message) || attempt === 4)
      throw error;
    // Повторяем от актуального main, сохраняя параллельные коммиты других сборщиков.
  }
}
