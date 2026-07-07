export function renderNavItem(item) {
  if (item.isFolder) {
    const style = [
      'display:flex;align-items:center;gap:7px',
      `padding:6px 10px;padding-left:${item.indent}px`,
      `margin-top:${item.marginTop}px`,
      'cursor:pointer',
      'font-size:var(--fs-nav-section);font-weight:650;letter-spacing:.08em',
      'color:oklch(0.916 0.01 87.568 / 0.42)',
      'user-select:none',
    ].join(';');
    return `<div data-toggle="${item.key}" style="${style}">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"
          style="transform:${item.chevron};transition:transform .15s;flex:none;">
        <polyline points="9 6 15 12 9 18"></polyline>
      </svg>
      ${item.label}
    </div>`;
  }

  const stubStyle = [
    "font-family:'Pretendard Variable',Pretendard,sans-serif",
    'font-size:var(--fs-nav-stub-badge);letter-spacing:.12em',
    'padding:1px 5px;border-radius:2px',
    'border:1px solid oklch(1 0 0 / 0.14)',
    'color:oklch(0.916 0.01 87.568 / 0.35)',
  ].join(';');
  const stub = item.stub ? `<span style="${stubStyle}">미완</span>` : '';

  const pageStyle = [
    'display:flex;align-items:center;gap:8px',
    `padding:9px 10px;padding-left:${item.indent}px`,
    'margin:1px 0',
    'font-size:var(--fs-nav-item)',
    'cursor:pointer',
    `color:${item.color}`,
    `font-weight:${item.weight}`,
  ].join(';');
  return `<div class="nav-page" data-nav="${item.id}" style="${pageStyle}">
    ${item.label}
    ${stub}
  </div>`;
}

export function renderNav(navItems) {
  return navItems.map(renderNavItem).join('');
}

function renderDiagram(block) {
  const d = block.diagram;

  const edgeStyle = 'stroke="oklch(0.916 0.01 87.568 / 0.28)" stroke-width="1.2" fill="none"';
  const edgesHtml = d.edges.map((e) =>
    `<path d="${e.d}" ${edgeStyle} marker-end="${block.arrowUrl}"></path>`
  ).join('');

  const nodeStyle = [
    'position:absolute',
    'background:oklch(0.181 0.004 106.942)',
    'border:1px solid oklch(0.916 0.01 87.568 / 0.2)',
    'border-radius:2px',
    'display:flex;align-items:center;justify-content:center',
    "font-family:'JetBrains Mono',monospace",
    'font-size:var(--fs-diagram-node)',
    'color:oklch(0.886 0.013 86.901)',
    'text-align:center;padding:0 6px',
  ].join(';');
  const nodesHtml = d.nodes.map((n) =>
    `<div style="${nodeStyle};left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;">${n.id}</div>`
  ).join('');

  return `
    <div style="margin:6px 0 24px;padding:26px;border:1px solid oklch(1 0 0 / 0.07);
        border-radius:3px;overflow-x:auto;background:oklch(0.168 0.004 106.968);
        display:flex;justify-content:center;">
      <div style="position:relative;width:${d.width}px;height:${d.height}px;flex:none;">
        <svg width="${d.width}" height="${d.height}"
            style="position:absolute;top:0;left:0;overflow:visible;">
          <defs>
            <marker id="${block.arrowId}" markerWidth="8" markerHeight="8"
                refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L8,4 L0,8 Z" style="fill:var(--accent);"></path>
            </marker>
          </defs>
          ${edgesHtml}
        </svg>
        ${nodesHtml}
      </div>
    </div>`.replace(/^\n    /, '');
}

function renderChip(chip) {
  if (!chip) return '';
  const style = [
    'display:inline-block;vertical-align:middle;margin-left:10px',
    'padding:2px 8px;border-radius:999px',
    'font-size:var(--fs-heading-chip);font-weight:650;letter-spacing:.04em',
    `color:${chip.color}`,
    `background:color-mix(in oklch, ${chip.color} 14%, transparent)`,
    `border:1px solid color-mix(in oklch, ${chip.color} 35%, transparent)`,
  ].join(';');
  return `<span style="${style}">${chip.label}</span>`;
}

function renderList(b) {
  const tag = b.type === 'ul' ? 'ul' : 'ol';
  const items = b.items.map((it) =>
    `<li style="font-size:var(--fs-list-item);line-height:1.8;color:oklch(0.916 0.01 87.568 / 0.76);">${it}</li>`
  ).join('');
  return `<${tag} style="margin:0 0 18px;padding-left:22px;display:flex;flex-direction:column;gap:7px;">${items}</${tag}>`;
}

function renderCallout(b) {
  const titleStyle = [
    'font-family:inherit',
    'font-size:var(--fs-callout-title);font-weight:600',
    'letter-spacing:.18em;text-transform:uppercase',
    'margin-bottom:7px',
    `color:${b.accent}`,
  ].join(';');
  return `<div style="border-left:2px solid ${b.accent};background:${b.bg};padding:14px 18px;margin:0 0 20px;">
    <div style="${titleStyle}">${b.title}</div>
    <div style="font-size:var(--fs-callout-body);line-height:1.8;color:oklch(0.916 0.01 87.568 / 0.82);">${b.contentHtml}</div>
  </div>`;
}

function renderTable(b) {
  // 하이브리드 layout: auto 라 각 열은 내용에 맞게 자라되(긴 셀도 넘치지 않음), 선두 열엔 min-width
  // 바닥값을 줘서 내용이 짧을 땐 그 값까지 늘어난다 — 짧은 표들끼리는 같은 열 경계로 정렬되고
  // (annotation 표처럼), 시그니처가 긴 표는 바닥값을 넘겨 자연스럽게 확장된다(item 옵션 표처럼).
  const lastCol = b.cols.length - 1;
  const minW = (i) => (
    i === lastCol ? '' :
    i === 0 ? 'min-width:200px;white-space:nowrap;' :
              'min-width:110px;white-space:nowrap;'
  );

  const thBase = [
    'padding:8px 14px',
    'border-bottom:1px solid oklch(1 0 0 / 0.16)',
    "font-family:'Pretendard Variable',Pretendard,sans-serif",
    'font-size:var(--fs-table-header);font-weight:600',
    'letter-spacing:.12em;text-transform:uppercase',
    'color:oklch(0.916 0.01 87.568 / 0.45)',
    'white-space:nowrap',
  ].join(';');
  const head = b.cols.map((c, i) =>
    `<th style="text-align:${c.align};${thBase};${i < lastCol ? minW(i) : ''}">${c.label}</th>`
  ).join('');

  const tdBase = [
    'padding:9px 14px',
    'border-bottom:1px solid oklch(1 0 0 / 0.05)',
    'color:oklch(0.916 0.01 87.568 / 0.76)',
  ].join(';');
  const body = b.rows.map((row) =>
    `<tr>${row.map((cell, i) =>
      `<td style="text-align:${cell.align};${tdBase};${minW(i)}">${cell.html}</td>`
    ).join('')}</tr>`
  ).join('');

  return `<div style="overflow-x:auto;margin:0 0 22px;">
    <table style="width:100%;border-collapse:collapse;font-size:var(--fs-table);">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

function renderCode(b) {
  const headerStyle = [
    'display:flex;align-items:center;gap:8px',
    'padding:8px 14px',
    'border-bottom:1px solid oklch(1 0 0 / 0.06)',
    "font-family:'JetBrains Mono',monospace",
    'font-size:var(--fs-code-filename);letter-spacing:.02em',
    'color:oklch(0.916 0.01 87.568 / 0.5)',
  ].join(';');
  const importSpan = b.imported
    ? `<span style="margin-left:auto;font-size:var(--fs-code-import-path);color:var(--accent);white-space:nowrap;">← ${b.sourcePath}</span>`
    : '';
  const header = b.filename
    ? `<div style="${headerStyle}">${b.filename}${importSpan}</div>`
    : '';

  const codeStyle = [
    "font-family:'JetBrains Mono',monospace",
    'font-size:var(--fs-code-block);line-height:1.75',
    'color:oklch(0.886 0.013 86.901)',
  ].join(';');
  return `<div style="border:1px solid oklch(1 0 0 / 0.07);border-radius:3px;overflow:hidden;margin:0 0 20px;background:oklch(0.168 0.004 106.968);">
    ${header}
    <pre style="margin:0;padding:14px 16px;overflow-x:auto;"><code style="${codeStyle}">${b.highlightedHtml}</code></pre>
  </div>`;
}

function renderBlock(b) {
  switch (b.type) {
    case 'h2':
      return `<h2 id="${b.id}" style="font-size:var(--fs-h2);font-weight:650;letter-spacing:-.015em;margin:46px 0 14px;scroll-margin-top:20px;">${b.text}${renderChip(b.chip)}</h2>`;
    case 'h3':
      return `<h3 style="font-size:var(--fs-h3);font-weight:650;margin:28px 0 10px;color:oklch(0.916 0.01 87.568 / 0.92);">${b.text}${renderChip(b.chip)}</h3>`;
    case 'p':
      return `<p style="font-size:var(--fs-body);line-height:1.85;color:oklch(0.916 0.01 87.568 / 0.78);margin:0 0 16px;text-wrap:pretty;">${b.contentHtml}</p>`;
    case 'caption':
      return `<div style="font-family:'JetBrains Mono',monospace;font-size:var(--fs-caption);letter-spacing:.12em;color:oklch(0.916 0.01 87.568 / 0.35);margin:2px 0 12px;">${b.text}</div>`;
    case 'ul':
    case 'ol':
      return renderList(b);
    case 'quote':
      return `<div style="border-left:2px solid oklch(0.916 0.01 87.568 / 0.22);padding:2px 0 2px 16px;margin:0 0 20px;font-size:var(--fs-quote);line-height:1.8;color:oklch(0.916 0.01 87.568 / 0.55);">${b.contentHtml}</div>`;
    case 'callout':  return renderCallout(b);
    case 'table':    return renderTable(b);
    case 'code':     return renderCode(b);
    case 'diagram':  return renderDiagram(b);
    default:         return '';
  }
}

function renderFooter(meta) {
  if (!meta) return '';
  const style = [
    'margin-top:36px;padding-top:16px',
    'border-top:1px solid oklch(1 0 0 / 0.06)',
    'font-size:var(--fs-footer-meta)',
    'color:oklch(0.916 0.01 87.568 / 0.4)',
    'display:flex;gap:8px;align-items:center',
  ].join(';');
  return `<div style="${style}">
    <span>마지막 업데이트 · ${meta.date}</span>
    <span>·</span>
    <span>@${meta.author}</span>
    <span>·</span>
    <span style="font-family:'JetBrains Mono',monospace;">${meta.hash}</span>
  </div>`;
}

export function renderMain(page) {
  const crumbStyle = [
    'font-size:var(--fs-crumb);font-weight:600;letter-spacing:.1em',
    'color:var(--accent);margin-bottom:14px',
  ].join(';');
  const crumb = page.hasCrumb
    ? `<div style="${crumbStyle}">${page.crumb}</div>`
    : '';
  const blocks = page.blocks.map(renderBlock).join('');
  return `<div style="max-width:1280px;margin:0 auto;padding:48px 40px 80vh;animation:pageIn .35s ease both;">
    ${crumb}
    <h1 style="font-size:var(--fs-h1);font-weight:700;letter-spacing:-.03em;margin:0 0 30px;padding-bottom:22px;border-bottom:1px solid oklch(1 0 0 / 0.08);">${page.title}</h1>
    ${blocks}
    ${renderFooter(page.meta)}
  </div>`;
}

export function renderToc(toc) {
  if (!toc.length) return '';
  return toc.map((t) => {
    const style = [
      'font-size:var(--fs-toc-item);line-height:1.6',
      `color:${t.color};font-weight:${t.weight}`,
      'cursor:pointer;padding:9px 0',
      `transform:translateX(${t.shift})`,
      'transition:transform .25s ease,color .2s',
    ].join(';');
    return `<div class="toc-item" data-scroll-to="${t.id}" style="${style}">${t.text}</div>`;
  }).join('');
}

function searchResultsInner({ results, noResults, emptyQuery }) {
  const resultsHtml = results.map((r) =>
    `<div class="search-result" data-nav="${r.id}" style="padding:10px 12px;border-radius:2px;cursor:pointer;">
      <div style="font-size:var(--fs-search-result-title);font-weight:600;">${r.title}</div>
      <div style="font-size:var(--fs-search-result-crumb);color:oklch(0.931 0.006 274.659 / 0.4);margin-top:2px;">${r.crumb}</div>
    </div>`
  ).join('');
  const empty = noResults
    ? `<div style="padding:24px;text-align:center;font-size:var(--fs-search-empty);color:oklch(0.931 0.006 274.659 / 0.4);">일치하는 결과가 없어요</div>`
    : '';
  const hint = emptyQuery
    ? `<div style="padding:24px;text-align:center;font-size:var(--fs-search-empty);color:oklch(0.931 0.006 274.659 / 0.35);">페이지 제목을 입력해보세요</div>`
    : '';
  return `${resultsHtml}${empty}${hint}`;
}

// 결과 목록만 갈아치우는 export — 검색창 자체(backdrop/panel) 는 열릴 때 한 번만 그려서
// 진입 애니메이션(searchBackdropIn/searchPanelIn)이 매 키 입력마다 재생되지 않게 한다.
export function renderSearchResults(data) {
  return searchResultsInner(data);
}

export function renderSearch({ open, query, results, noResults, emptyQuery }) {
  if (!open) return '';

  const inputStyle = [
    'flex:1;background:transparent;border:none;outline:none',
    'color:oklch(0.931 0.006 274.659)',
    'font-size:var(--fs-search-input);font-family:inherit',
  ].join(';');
  const escStyle = [
    "font-family:'JetBrains Mono',monospace",
    'font-size:var(--fs-search-esc-badge)',
    'padding:2px 6px;border:1px solid oklch(1 0 0 / 0.14);border-radius:2px',
    'color:oklch(0.916 0.01 87.568 / 0.4)',
  ].join(';');

  return `<div data-action="close-search" style="position:fixed;inset:0;background:oklch(0 0 0 / 0.6);display:flex;align-items:flex-start;justify-content:center;padding-top:110px;z-index:50;animation:searchBackdropIn .15s ease-out;">
    <div style="width:560px;max-width:90vw;background:oklch(0.181 0.004 106.942);border:1px solid oklch(1 0 0 / 0.12);border-radius:4px;box-shadow:0 24px 70px oklch(0 0 0 / 0.55);overflow:hidden;animation:searchPanelIn .18s cubic-bezier(0.2,0,0,1);">
      <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid oklch(1 0 0 / 0.08);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input id="searchInput" value="${query}" placeholder="페이지 제목이나 내용으로 검색..." style="${inputStyle}">
        <span style="${escStyle}">ESC</span>
      </div>
      <div id="searchResults" style="max-height:340px;overflow-y:auto;padding:8px;">
        ${searchResultsInner({ results, noResults, emptyQuery })}
      </div>
    </div>
  </div>`;
}
