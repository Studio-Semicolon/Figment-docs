import { esc, strip } from './markdown.js';
import { NAV_TREE, findCrumb } from './nav.js';

const EDGE_CURVED = true;

export function highlight(code, lang) {
  if (lang === 'md' || lang === 'text' || lang === 'diagram') return esc(code);
  const pattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|(@[A-Za-z_][A-Za-z0-9_]*)|(\b(?:fun|val|var|class|object|interface|override|private|public|protected|import|package|if|else|when|for|while|return|companion|init|const|vararg|is|in|as|typealias|sealed|enum|data|open|abstract|suspend|inline|internal|lateinit|null|true|false|this|super|new|void|static|final|extends|implements|throw|try|catch|finally)\b)|(\b\d+(?:\.\d+)?f?\b)/g;
  return esc(code).replace(pattern, (m, cm, str, ann, kw, num) => {
    if (cm) return `<span style="color:#6b7280;font-style:italic">${cm}</span>`;
    if (str) return `<span style="color:#98c379">${str}</span>`;
    if (ann) return `<span style="color:#e5c07b">${ann}</span>`;
    if (kw) return `<span style="color:#c678dd">${kw}</span>`;
    if (num) return `<span style="color:#d19a66">${num}</span>`;
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

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// 헤딩 뒤 `{.chip-name}` 로 붙이는 상태 배지. 새 배지 추가 시 여기 한 줄만 늘리면 됨.
const CHIP_VARIANTS = {
  experimental: { color: 'oklch(0.75 0.14 70)', label: '실험적' },
};

// note 는 사이트 accent(CSS 커스텀 프로퍼티)를 쓰므로 JS 에서 hex 계산이 안 돼 color-mix() 로 대체.
const CALLOUT_VARIANTS = {
  note: { accent: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 6%, transparent)', label: 'Note' },
  tip: { accent: '#7fae72', bg: hexToRgba('#7fae72', 0.06), label: 'Tip' },
  warning: { accent: '#c9a34f', bg: hexToRgba('#c9a34f', 0.06), label: 'Warning' },
  danger: { accent: '#c96a5c', bg: hexToRgba('#c96a5c', 0.06), label: 'Danger' },
  performance: { accent: '#9c8ec4', bg: hexToRgba('#9c8ec4', 0.06), label: 'Performance' },
};

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
