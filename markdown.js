export function H(s) { return { __html: s }; }

export function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function strip(s) {
  return (s || '').replace(/<[^>]+>/g, ' ');
}

export async function fetchText(path) {
  try {
    const res = await fetch(path);
    return res.ok ? await res.text() : null;
  } catch (e) {
    return null;
  }
}

// CommonMark 코드 스팬 규칙(같은 길이의 백틱 런끼리 짝짓기)의 축소판.
// ` 하나로는 못 감싸는 내용(예: 리터럴 ``` 포함)은 `` ... `` 처럼 더 긴 런으로 감싸면 된다.
export function replaceCodeSpans(text) {
  const runs = [];
  const re = /`+/g;
  let m;
  while ((m = re.exec(text))) runs.push({ start: m.index, end: m.index + m[0].length, len: m[0].length });
  if (!runs.length) return text;
  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < runs.length) {
    const open = runs[i];
    let matchIdx = -1;
    for (let j = i + 1; j < runs.length; j++) { if (runs[j].len === open.len) { matchIdx = j; break; } }
    if (matchIdx === -1) { i++; continue; }
    const close = runs[matchIdx];
    out += text.slice(cursor, open.start);
    out += `<code>${text.slice(open.end, close.start).trim()}</code>`;
    cursor = close.end;
    i = matchIdx + 1;
  }
  out += text.slice(cursor);
  return out;
}

// `[label](nav:page-id)` 는 사이드바 내부 이동([data-nav] 클릭 위임)으로 연결된다.
// 그 외 [label](url) 은 아직 어디로도 안 가는 죽은 링크 — 실제 md-to-page-id 매핑 붙기 전까지 임시.
// **굵게**, __밑줄__, *기울임* 순서로 처리 — 굵게/밑줄을 먼저 걷어내야 남은 홑 `*` 가 기울임으로 잘못 안 묶인다.
export function parseInline(text) {
  return replaceCodeSpans(esc(text))
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(nav:([a-zA-Z0-9_/-]+)\)/g, '<a href="#" data-nav="$2" style="color:inherit;font-weight:700;">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" style="color:inherit;font-weight:700;">$1</a>');
}

// 이 위키가 쓰는 고정된 서브셋(#/##, -/1., **/`` /[](), >, :::type, fenced code, GFM 표)만 다루는 라인 스캐너.
// 범용 GFM 파서 아님 — 문법이 늘어나면 markdown-it 같은 라이브러리로 교체.
export async function parseMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const isBlank = (l) => l.trim() === '';

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    const fenceMatch = /^(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const info = line.slice(fence.length).trim();
      const langMatch = /^([a-zA-Z]*)/.exec(info);
      const lang = langMatch ? langMatch[1] : '';
      const titleMatch = /title="([^"]*)"/.exec(info);
      const fileMatch = /file="([^"]*)"/.exec(info);
      const body = [];
      i++;
      while (i < lines.length && lines[i].trim() !== fence) { body.push(lines[i]); i++; }
      i++;
      if (lang === 'diagram') {
        blocks.push({ type: 'diagram', src: body.join('\n') });
      } else if (fileMatch) {
        const fetched = await fetchText(fileMatch[1]);
        blocks.push({
          type: 'code', lang, imported: true, sourcePath: fileMatch[1],
          filename: titleMatch ? titleMatch[1] : fileMatch[1].split('/').pop(),
          code: fetched !== null ? fetched : `// 파일을 불러오지 못했습니다: ${fileMatch[1]}`,
        });
      } else {
        blocks.push({ type: 'code', lang, filename: titleMatch ? titleMatch[1] : undefined, code: body.join('\n') });
      }
      continue;
    }

    if (line.startsWith(':::')) {
      const variant = line.slice(3).trim() || 'note';
      const body = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { body.push(lines[i]); i++; }
      i++;
      const nonEmpty = body.filter((l) => l.trim() !== '');
      const isList = nonEmpty.length > 0 && nonEmpty.every((l) => /^-\s+/.test(l.trim()));
      const html = isList
        ? '<ul style="margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px;">' +
          nonEmpty.map((l) => `<li>${parseInline(l.trim().replace(/^-\s+/, ''))}</li>`).join('') + '</ul>'
        : parseInline(body.join(' ').trim());
      blocks.push({ type: 'callout', variant, html: H(html) });
      continue;
    }

    if (line.startsWith('#')) {
      const m = /^(#{1,3})\s+(.*)$/.exec(line);
      if (m) {
        const chipMatch = /^(.*?)\s*\{\.([a-z-]+)\}\s*$/.exec(m[2].trim());
        blocks.push({
          type: m[1].length >= 2 ? (m[1].length === 2 ? 'h2' : 'h3') : 'h2',
          text: chipMatch ? chipMatch[1].trim() : m[2].trim(),
          chip: chipMatch ? chipMatch[2] : undefined,
        });
        i++;
        continue;
      }
    }

    if (line.startsWith('> ')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) { body.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push({ type: 'quote', html: H(parseInline(body.join(' ').trim())) });
      continue;
    }

    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(lines[i + 1])) {
      const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const headerCells = splitRow(line);
      const alignCells = splitRow(lines[i + 1]);
      const cols = headerCells.map((label, ci) => {
        const a = alignCells[ci] || '';
        const align = a.startsWith(':') && a.endsWith(':') ? 'center' : a.endsWith(':') ? 'right' : 'left';
        return { label, align };
      });
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]).map((c) => H(parseInline(c))));
        i++;
      }
      blocks.push({ type: 'table', cols, rows });
      continue;
    }

    if (/^-\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items = [];
      const re = ordered ? /^\d+\.\s+/ : /^-\s+/;
      while (i < lines.length && re.test(lines[i])) { items.push(H(parseInline(lines[i].replace(re, '')))); i++; }
      blocks.push({ type: ordered ? 'ol' : 'ul', items });
      continue;
    }

    if (line.startsWith('↓')) {
      blocks.push({ type: 'caption', text: line.trim() });
      i++;
      continue;
    }

    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#|`{3,}|~{3,}|:::|>|\||-\s|\d+\.\s|↓)/.test(lines[i])) { para.push(lines[i]); i++; }
    if (para.length) blocks.push({ type: 'p', html: H(parseInline(para.join(' '))) });
  }

  return blocks;
}
