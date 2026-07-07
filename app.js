import { NAV_TREE, findCrumb, flattenNav, collectPages } from './nav.js';
import { fetchText, parseMarkdown, H } from './markdown.js';
import { normalize, buildSearchIndex } from './render.js';
import { renderNav, renderMain, renderToc, renderSearch, renderSearchResults } from './view.js';

const ACCENT = 'var(--accent)';
const PAGES_DIR = './pages/';
const PAGE_SOURCES = collectPages(NAV_TREE);

function stubPage(title) {
  return { title, blocks: [
    { type: 'callout', variant: 'note', title: '미완', html: H('해당 문서는 준비 중입니다.') },
  ]};
}

async function loadPageMeta() {
  const text = await fetchText(PAGES_DIR + 'meta.json');
  if (text === null) return {};
  try { return JSON.parse(text); } catch (e) { return {}; }
}

async function loadAllPages() {
  const pageMeta = await loadPageMeta();
  const entries = await Promise.all(Object.entries(PAGE_SOURCES).map(async ([id, src]) => {
    if (!src.file) return [id, stubPage(src.title)];
    const text = await fetchText(PAGES_DIR + src.file);
    if (text === null) return [id, stubPage(src.title)];
    return [id, { title: src.title, blocks: await parseMarkdown(text), meta: pageMeta[id] }];
  }));
  return Object.fromEntries(entries);
}

let savedId = 'overview';
try { savedId = localStorage.getItem('figment-wiki-page') || 'overview'; } catch (e) {}
if (location.hash.slice(1)) savedId = location.hash.slice(1);

const state = {
  currentId: savedId,
  expanded: { guide: true, 'guide/domain': true, architecture: true, reference: true },
  searchOpen: false,
  query: '',
  activeHeadingId: null,
};

let pages = null;
let searchIndex = [];
let currentH2s = [];

const navPane = document.getElementById('navPane');
const mainPane = document.getElementById('mainPane');
const tocPane = document.getElementById('tocPane');
const searchOverlay = document.getElementById('searchOverlay');

function renderNavPane() {
  const navItems = flattenNav(NAV_TREE, { currentId: state.currentId, expanded: state.expanded, accent: ACCENT });
  navPane.innerHTML = renderNav(navItems);
}

function buildTocItems() {
  const activeId = state.activeHeadingId || (currentH2s[0] && currentH2s[0].id);
  return currentH2s.map((h) => ({
    id: h.id, text: h.text,
    color: h.id === activeId ? ACCENT : 'rgba(230,227,220,.5)',
    weight: h.id === activeId ? 600 : 400,
    shift: h.id === activeId ? '0px' : '6px',
  }));
}

let tocIds = null;
function renderTocPane() {
  const items = buildTocItems();
  const ids = items.map((t) => t.id).join(',');
  if (ids !== tocIds) {
    // 목차 자체가 바뀔 때만 새로 그린다 — 매번 innerHTML 을 갈아치우면
    // DOM 노드가 매번 새로 생겨 transition(활성 항목 강조 애니메이션)이 재생되지 않는다.
    tocPane.innerHTML = renderToc(items);
    tocIds = ids;
    return;
  }
  const nodes = tocPane.querySelectorAll('.toc-item');
  nodes.forEach((el, i) => {
    const t = items[i];
    el.style.color = t.color;
    el.style.fontWeight = t.weight;
    el.style.transform = `translateX(${t.shift})`;
  });
}

let scrollTick = false;
function onMainScroll() {
  // rAF throttle, no scroll-spy lib needed for a handful of h2s per page
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => {
    scrollTick = false;
    const headings = mainPane.querySelectorAll('h2[id]');
    const top = mainPane.getBoundingClientRect().top + 24;
    let activeId = null;
    headings.forEach((h) => { if (h.getBoundingClientRect().top <= top) activeId = h.id; });
    if (activeId !== state.activeHeadingId) {
      state.activeHeadingId = activeId;
      renderTocPane();
    }
  });
}

function renderMainPane() {
  const rawPage = pages[state.currentId] || pages.overview;
  const blocks = normalize(state.currentId, rawPage.blocks);
  currentH2s = blocks.filter((b) => b.type === 'h2');
  const crumb = findCrumb(NAV_TREE, state.currentId, []) || '';
  mainPane.innerHTML = renderMain({ title: rawPage.title, hasCrumb: !!crumb, crumb, blocks, meta: rawPage.meta });
  mainPane.scrollTop = 0;
  mainPane.addEventListener('scroll', onMainScroll);
  renderTocPane();
}

let searchWasOpen = false;
let searchClosing = false;
function renderSearchPane() {
  const q = state.query.trim().toLowerCase();
  const results = q ? searchIndex.filter((p) => p.text.includes(q)).slice(0, 8) : [];
  const noResults = q.length > 0 && results.length === 0;
  const emptyQuery = q.length === 0;
  if (!state.searchOpen) {
    searchOverlay.innerHTML = '';
  } else if (!searchWasOpen) {
    // 열리는 순간에만 backdrop/panel 을 새로 그린다 — 입력마다 innerHTML 을 갈아치우면
    // 매번 DOM 이 새로 생겨 진입 animation(searchBackdropIn/searchPanelIn)이 다시 재생된다.
    searchOverlay.innerHTML = renderSearch({ open: true, query: state.query, results, noResults, emptyQuery });
  } else {
    const resultsEl = document.getElementById('searchResults');
    if (resultsEl) resultsEl.innerHTML = renderSearchResults({ results, noResults, emptyQuery });
  }
  searchWasOpen = state.searchOpen;
}

function go(id, { push = true } = {}) {
  if (!id || !pages[id]) return;
  state.currentId = id;
  state.searchOpen = false;
  state.activeHeadingId = null;
  try { localStorage.setItem('figment-wiki-page', id); } catch (e) {}
  if (push) history.pushState({ id }, '', '#' + id);
  renderNavPane();
  renderMainPane();
  renderSearchPane();
}

window.addEventListener('popstate', (e) => {
  const id = (e.state && e.state.id) || location.hash.slice(1) || 'overview';
  go(id, { push: false });
});

function toggleFolder(key) {
  state.expanded[key] = !state.expanded[key];
  renderNavPane();
}

function openSearch() {
  state.searchOpen = true;
  state.query = '';
  renderSearchPane();
  const el = document.getElementById('searchInput');
  if (el) el.focus();
}

function closeSearch() {
  if (!state.searchOpen || searchClosing) return;
  const overlay = searchOverlay.firstElementChild;
  const panel = overlay && overlay.firstElementChild;
  if (!overlay) { state.searchOpen = false; renderSearchPane(); return; }
  searchClosing = true;
  overlay.style.animation = 'searchBackdropOut .12s ease-in forwards';
  if (panel) panel.style.animation = 'searchPanelOut .12s ease-in forwards';
  setTimeout(() => {
    searchClosing = false;
    state.searchOpen = false;
    renderSearchPane();
  }, 120);
}

function scrollToHeading(id) {
  // id 에 페이지 경로(`/` 포함)가 섞여 있어 `#id` CSS 셀렉터로는 못 찾는다 — 속성 셀렉터로 조회.
  const el = mainPane.querySelector(`[id="${id}"]`);
  if (!el) return;
  const containerTop = mainPane.getBoundingClientRect().top;
  const elTop = el.getBoundingClientRect().top;
  mainPane.scrollTop += (elTop - containerTop) - 20;
}

document.addEventListener('click', (e) => {
  const navEl = e.target.closest('[data-nav]');
  if (navEl) { e.preventDefault(); go(navEl.getAttribute('data-nav')); return; }
  const toggleEl = e.target.closest('[data-toggle]');
  if (toggleEl) { toggleFolder(toggleEl.getAttribute('data-toggle')); return; }
  const scrollEl = e.target.closest('[data-scroll-to]');
  if (scrollEl) { scrollToHeading(scrollEl.getAttribute('data-scroll-to')); return; }
  if (e.target.closest('#searchTriggerBtn')) { openSearch(); return; }
  if (e.target.dataset && e.target.dataset.action === 'close-search') { closeSearch(); }
});

document.addEventListener('input', (e) => {
  if (e.target.id !== 'searchInput') return;
  state.query = e.target.value;
  renderSearchPane();
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  else if (e.key === 'Escape' && state.searchOpen) closeSearch();
});

(async function boot() {
  pages = await loadAllPages();
  if (!pages[state.currentId]) state.currentId = 'overview';
  searchIndex = buildSearchIndex(pages);
  history.replaceState({ id: state.currentId }, '', '#' + state.currentId);
  renderNavPane();
  renderMainPane();
  renderSearchPane();
})();
