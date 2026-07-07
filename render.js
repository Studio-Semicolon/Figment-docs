import { esc, strip } from './markdown.js';
import { NAV_TREE, findCrumb } from './nav.js';

const EDGE_CURVED = true;

export function highlight(code, lang) {
  if (lang === 'md' || lang === 'text' || lang === 'diagram') return esc(code);
  const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(@[A-Za-z_][A-Za-z0-9_]*)|(\b(?:fun|val|var|class|object|interface|override|private|public|protected|import|package|if|else|when|for|while|return|companion|init|const|vararg|is|in|as|typealias|sealed|enum|data|open|abstract|suspend|inline|internal|lateinit|null|true|false|this|super|new|void|static|final|extends|implements|throw|try|catch|finally)\b)|(\b\d+(?:\.\d+)?f?\b)/g;
  return esc(code).replace(pattern, (m, cm, str, ann, kw, num) => {
    if (cm) return `<span style="color:oklch(0.55 0.02 264.358);font-style:italic">${cm}</span>`;
    if (str) return `<span style="color:oklch(0.78 0.15 133)">${str}</span>`;
    if (ann) return `<span style="color:oklch(0.825 0.1 82.27)">${ann}</span>`;
    if (kw) return `<span style="color:oklch(0.7 0.164 318.2)">${kw}</span>`;
    if (num) return `<span style="color:oklch(0.725 0.1 63.82)">${num}</span>`;
    return m;
  });
}

export function computeDiagram(src, arrowId) {
  const lines = src.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const seen = new Set(); const nodes = []; const edges = [];
  const addNode = (n) => { if (!seen.has(n)) { seen.add(n); nodes.push(n); } };
  lines.forEach((l) => {
    const parts = l.split('->').map((s) => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) { addNode(parts[0]); addNode(parts[1]); edges.push({ from: parts[0], to: parts[1] }); }
  });
  const layer = {}; nodes.forEach((n) => (layer[n] = 0));
  for (let i = 0; i < nodes.length + 2; i++) {
    edges.forEach((e) => { if (layer[e.to] < layer[e.from] + 1) layer[e.to] = layer[e.from] + 1; });
  }
  const maxLayer = nodes.length ? Math.max(...nodes.map((n) => layer[n])) : 0;
  const rows = []; for (let i = 0; i <= maxLayer; i++) rows.push([]);
  nodes.forEach((n) => rows[layer[n]].push(n));
  const boxW = 148, boxH = 46, colGap = 32, rowGap = 72;
  const rowHeight = boxH + rowGap;
  const maxCols = Math.max(1, ...rows.map((r) => r.length));
  const width = maxCols * (boxW + colGap) - colGap;
  const pos = {};
  rows.forEach((row, ri) => {
    const rowW = row.length * (boxW + colGap) - colGap;
    const offsetX = (width - rowW) / 2;
    row.forEach((n, ci) => { pos[n] = { x: offsetX + ci * (boxW + colGap), y: ri * rowHeight }; });
  });
  const height = (maxLayer + 1) * rowHeight - rowGap;
  const outNodes = nodes.map((n) => ({ id: n, x: pos[n].x, y: pos[n].y, w: boxW, h: boxH }));
  const outEdges = edges.map((e) => {
    const a = pos[e.from], b = pos[e.to];
    const x1 = a.x + boxW / 2, y1 = a.y + boxH, x2 = b.x + boxW / 2, y2 = b.y;
    let d;
    if (EDGE_CURVED) { const my = (y1 + y2) / 2; d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`; }
    else { const my = (y1 + y2) / 2; d = `M ${x1} ${y1} L ${x1} ${my} L ${x2} ${my} L ${x2} ${y2}`; }
    return { d };
  });
  return { nodes: outNodes, edges: outEdges, width, height, arrowId, arrowUrl: `url(#${arrowId})` };
}

export function slug(prefix, text) {
  return prefix + '-' + text.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24);
}


// 헤딩 뒤 `{.chip-name}` 로 붙이는 상태 배지. 새 배지 추가 시 여기 한 줄만 늘리면 됨.
const CHIP_VARIANTS = {
  experimental: { color: 'oklch(0.75 0.14 70)', label: '실험적' },
};

// accent 색상만 지정하면 bg 는 자동 계산. note 는 CSS 변수라 color-mix() 로 대체.
const CALLOUT_VARIANTS = Object.fromEntries(Object.entries({
  note:        { accent: 'var(--accent)',         label: 'Note' },
  tip:         { accent: 'oklch(0.70 0.10 139)', label: 'Tip' },
  warning:     { accent: 'oklch(0.70 0.12 54)',  label: 'Warning' },
  danger:      { accent: 'oklch(0.70 0.14 26)',  label: 'Danger' },
  performance: { accent: 'oklch(0.70 0.08 293)', label: 'Performance' },
}).map(([k, v]) => [k, {
  ...v,
  bg: v.accent.startsWith('oklch(')
    ? v.accent.replace(/\)$/, ' / 6%)')
    : `color-mix(in srgb, ${v.accent} 6%, transparent)`,
}]));

export function normalize(pageId, blocks) {
  let hCount = 0;
  let diagramCounter = 0;
  return blocks.map((b) => {
    const nb = { ...b };
    if (nb.type === 'h2') { hCount++; nb.id = slug(pageId, b.text) + '-' + hCount; nb.num = String(hCount).padStart(2, '0'); }
    if ((nb.type === 'h2' || nb.type === 'h3') && b.chip) {
      const v = CHIP_VARIANTS[b.chip];
      if (v) nb.chip = v;
    }
    if (nb.type === 'callout') {
      const v = CALLOUT_VARIANTS[b.variant] || CALLOUT_VARIANTS.note;
      nb.accent = v.accent; nb.bg = v.bg; nb.title = b.title || v.label;
      nb.contentHtml = b.html.__html;
    }
    if (nb.type === 'table') {
      nb.rows = b.rows.map((row) => row.map((cell, i) => ({ html: cell.__html, align: b.cols[i].align })));
    }
    if (nb.type === 'code') {
      nb.highlightedHtml = highlight(b.code, b.lang);
    }
    if (nb.type === 'p' || nb.type === 'quote') {
      nb.contentHtml = b.html.__html;
    }
    if (nb.type === 'ul' || nb.type === 'ol') {
      nb.items = b.items.map((it) => it.__html);
    }
    if (nb.type === 'diagram') {
      nb.diagram = computeDiagram(b.src, 'arrow-' + pageId + '-' + diagramCounter++);
      nb.arrowId = nb.diagram.arrowId; nb.arrowUrl = nb.diagram.arrowUrl;
    }
    return nb;
  });
}

export function textOf(b) {
  if (b.html) return strip(b.html.__html);
  if (b.text) return b.text;
  if (b.items) return b.items.map((i) => strip(i.__html)).join(' ');
  if (b.code) return b.code;
  return '';
}

export function buildSearchIndex(pages) {
  return Object.keys(pages).map((id) => {
    const p = pages[id];
    const text = p.blocks.map((b) => textOf(b)).join(' ');
    const crumb = findCrumb(NAV_TREE, id, []) || '';
    return { id, title: p.title, crumb, text: (p.title + ' ' + text).toLowerCase() };
  });
}
