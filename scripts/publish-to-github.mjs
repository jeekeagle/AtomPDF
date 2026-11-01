/**
 * 把当前提交发布到 GitHub（走 GitHub API，不依赖 git push 的网络通道）。
 *
 * 用法：
 *   node scripts/publish-to-github.mjs [仓库名]
 *
 * 需要本机装了 GitHub CLI 并已登录（gh auth login）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OWNER = process.env.GH_OWNER || execSync('gh api user --jq .login', { encoding: 'utf8' }).trim();
const REPO = process.argv[2] || 'AtomPDF';
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

const token = execSync('gh auth token', { encoding: 'utf8' }).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
  'User-Agent': 'atom-pdf-publisher'
};

const call = async (method, url, body) => {
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${url} -> ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
};

const files = execSync('git ls-tree -r HEAD --name-only -z', { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .map((item) => item.trim())
  .filter(Boolean);

const message = execSync('git log -1 --pretty=%B', { cwd: ROOT, encoding: 'utf8' }).trim();

let parent = null;
try {
  parent = (await call('GET', `${API}/commits/main`)).sha;
} catch (error) {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'));
  parent = (
    await call('PUT', `${API}/contents/README.md`, {
      message: 'chore: 初始化仓库',
      content: readme.toString('base64'),
      branch: 'main'
    })
  ).commit.sha;
  console.log('已创建 main 分支');
}

const tree = [];
for (const file of files) {
  const buffer = fs.readFileSync(path.join(ROOT, file));
  const blob = await call('POST', `${API}/git/blobs`, {
    content: buffer.toString('base64'),
    encoding: 'base64'
  });
  tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
}

const createdTree = await call('POST', `${API}/git/trees`, { tree });
const commit = await call('POST', `${API}/git/commits`, {
  message,
  tree: createdTree.sha,
  parents: [parent]
});
await call('PATCH', `${API}/git/refs/heads/main`, { sha: commit.sha, force: false });

console.log(`已发布 ${files.length} 个文件到 ${OWNER}/${REPO}（${commit.sha.slice(0, 8)}）`);
