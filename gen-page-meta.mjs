// 페이지별 "마지막 업데이트" 푸터 데이터 생성기. 배포 전 수동 실행: `node docs/gen-page-meta.mjs`
// git log 로 각 페이지 .md 파일의 최신 커밋(hash/author/date)을 읽어 pages/meta.json 에 기록한다.
// 커밋 안 된 파일(신규/미추적)은 항목에서 빠진다 — 앱은 meta 없는 페이지의 푸터를 숨긴다.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NAV_TREE, collectPages } from './nav.js';

const DOCS_DIR = dirname(fileURLToPath(import.meta.url));
const pages = collectPages(NAV_TREE);
const meta = {};

for (const [id, page] of Object.entries(pages)) {
  if (!page.file) continue;
  const relPath = `docs/pages/${page.file}`;
  const out = execSync(`git log -1 --format=%h%x09%an%x09%ad "--date=format:%Y-%m-%d %H:%M" -- "${relPath}"`, {
    cwd: join(DOCS_DIR, '..'),
  }).toString().trim();
  if (!out) continue;
  const [hash, author, date] = out.split('\t');
  meta[id] = { hash, author, date };
}

writeFileSync(join(DOCS_DIR, 'pages/meta.json'), JSON.stringify(meta, null, 2) + '\n');
console.log(`meta.json 갱신: ${Object.keys(meta).length}/${Object.keys(pages).length} 페이지`);
