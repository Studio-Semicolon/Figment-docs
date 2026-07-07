// 페이지 노드에 `file` 이 있으면 그 .md 를 불러와 채운다. 없으면 "준비중"
// 사이드바 뱃지와 실제 콘텐츠 여부를 이 한 곳(파일 유무)으로만 판단한다.
export const NAV_TREE = [
  { type: 'page', id: 'overview', label: '개요', file: 'overview.md' },
  { type: 'page', id: 'meta-wiki-guide', label: '위키 작성 가이드', file: 'meta-wiki-guide.md' },
  { type: 'folder', key: 'guide', label: '가이드', children: [
    { type: 'page', id: 'guide/di', label: 'DI', file: 'guide/di.md' },
    { type: 'page', id: 'guide/listener', label: '리스너', file: 'guide/listener.md' },
    { type: 'page', id: 'guide/command', label: '커맨드', file: 'guide/command.md' },
    { type: 'page', id: 'guide/coroutine', label: '코루틴', file: 'guide/coroutine.md' },
    { type: 'folder', key: 'guide/domain', label: '도메인', children: [
      { type: 'page', id: 'guide/domain/dialog', label: '다이얼로그', file: 'guide/domain/dialog.md' },
      { type: 'page', id: 'guide/domain/hud', label: 'HUD', file: 'guide/domain/hud.md' },
      { type: 'page', id: 'guide/domain/minimap', label: '미니맵', file: 'guide/domain/minimap.md' },
      { type: 'page', id: 'guide/domain/item', label: '아이템', file: 'guide/domain/item.md' },
      { type: 'page', id: 'guide/domain/skill', label: '스킬'},
      { type: 'page', id: 'guide/domain/mob', label: '몹' },
      { type: 'page', id: 'guide/domain/combat', label: '전투' },
      { type: 'page', id: 'guide/domain/visual', label: '비주얼' },
      { type: 'page', id: 'guide/domain/biome', label: '바이옴' },
    ]},
  ]},
  { type: 'folder', key: 'architecture', label: '아키텍처', children: [
    { type: 'page', id: 'architecture/module', label: '모듈 구조', file: 'architecture/module.md' },
  ]},
  { type: 'folder', key: 'reference', label: '참고', children: [
    { type: 'page', id: 'reference/annotations', label: '어노테이션', file: 'reference/annotations.md' },
  ]}
];

export function collectPages(nodes, out = {}) {
  nodes.forEach((n) => {
    if (n.type === 'page') out[n.id] = { title: n.label, file: n.file };
    else collectPages(n.children, out);
  });
  return out;
}

export function findCrumb(nodes, id, trail = []) {
  for (const n of nodes) {
    if (n.type === 'page' && n.id === id) return trail.join(' / ');
    if (n.type === 'folder') {
      const r = findCrumb(n.children, id, [...trail, n.label]);
      if (r !== null) return r;
    }
  }
  return null;
}

export function flattenNav(nodes, { currentId, expanded, accent, depth = 0 }, out = []) {
  nodes.forEach((n) => {
    if (n.type === 'page') {
      out.push({
        isPage: true, id: n.id, label: n.label, stub: !n.file,
        indent: 10 + depth * 14,
        color: n.id === currentId ? accent : 'rgba(230,227,220,.72)',
        weight: n.id === currentId ? 600 : 400,
      });
    } else {
      const exp = !!expanded[n.key];
      out.push({
        isFolder: true, label: n.label, key: n.key,
        indent: 10 + depth * 14,
        marginTop: depth === 0 ? 16 : 6,
        chevron: exp ? 'rotate(90deg)' : 'rotate(0deg)',
      });
      if (exp) flattenNav(n.children, { currentId, expanded, accent, depth: depth + 1 }, out);
    }
  });
  return out;
}
