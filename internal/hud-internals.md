# HUD 내부 동작

HUD 가 화면에 뜨기까지 가짜 엔티티·변환 행렬·폰트 측정이 어떻게 맞물리는지 정리한다. 사용법은 [domain/hud.md](../guide/domain/hud.md) 를 본다. 이 문서는 HUD 를 확장하거나 디버깅할 때 필요한 내부 지식이다.

## 모듈 분담

| 모듈 | 책임 |
|------|------|
| `hud:api` | 인터페이스(`HUDManager`/`HUDGroup`/`ActiveHUD`/`TextHUD`/`ItemHUD`/`BlockHUD`/`InlineHUD`/`TypewriterBuilder`·`Controller`), `HUDAnchor`/`RotationDir` enum, DSL 계약 |
| `hud:core` | 런타임 구현 — 매니저/그룹/요소, 변환 행렬, 폰트 측정, 리스너 |
| `nms:*` | `PseudoEntityManager`/`PseudoDisplayEntity` — 가짜 Display 엔티티 스폰·패킷·탑승 |

핵심 설계: **소비자(`game:content`)는 `hud:api` 만 의존**하고, 구현(`hud:core`)은 DI 로 연결된다. NMS 의존은 core 안에 갇혀 api/콘텐츠로 새지 않는다.

## 런타임 부팅 (DI)

`BeanRegistry.setup` 중:

1. `HUDManagerImpl`(`@Bean(binds=[HUDManager::class])`)이 `PseudoEntityManager`·`FontRegistry`·`CoroutineScope` 를 주입받아 생성된다.
2. `FontRegistry`(`@Bean`)가 `init` 에서 클래스패스 `hud/font/default.json` 을 `minecraft:default` 로 로드한다.
3. `HUDPlayerListener`(`@Listener`)가 등록돼 플레이어 수명 이벤트에 연결된다.

`HUDManagerImpl` 은 `ManagedLifecycle` 을 구현한다. `BeanRegistry.teardown` 의 `shutdown()` 에서 모든 플레이어의 전 그룹을 `destroy()` 하고 레지스트리를 비운다(멱등). reload 시 화면에 남은 HUD 누수를 막는다.

## 그룹·요소 구조

- `HUDManagerImpl` 은 `Map<UUID, Map<String, HUDGroup>>` 레지스트리를 들고 플레이어별 그룹을 관리한다. 같은 그룹 ID 재생성은 `require` 로 거부.
- `createGroup` 은 y 를 부호 반전(`-y`)해 `HUDGroupImpl` 에 넘긴다 — HUD 좌표계는 화면 위가 양수라 Bukkit/엔티티 좌표와 부호가 반대다. `AbstractHUD.setOffset` 도 동일하게 `offsetY = -y`.
- 요소 구현은 모두 `AbstractHUD<E : PseudoDisplayEntity>` 를 상속한다. 종류별로 `translation()` 기준값과 `rotationEulerOffset()` 만 다르게 제공한다(예: 텍스트는 Y 180° 보정).

## 변환 행렬 (`AbstractHUD.transformation`)

화면 배치는 Display 엔티티의 transformation(translation/scale/left·right 쿼터니언)으로 표현된다.

- **위치**: 자체 오프셋 + 그룹 오프셋을 합산하고, `HUDAnchor.band` 를 화면 세로 오프셋으로 환산해 더한다(`band * HUDScreen.UNIT_Y`). band 는 앵커별 큰 스칼라(예: `MIDDLE_CENTER=50000`)로, 셰이더가 NDC 좌표로 풀어 해당 지점에 위치시킨다.
- **회전**: 오일러 각 → 쿼터니언 후 `RotationDir` 에 따라 left(스케일 이전) 또는 right(스케일 이후) 회전에 넣는다. 같은 각이라도 적용 위치에 따라 결과가 다르다.
- **피벗**: `setPivotPoint` 가 설정되면 `initScale` 대비 현재 스케일 비율로 translation 을 보정해, 확대/축소가 피벗을 중심으로 일어나게 한다.
- **보간**: `setInterpolationDuration(interpolationTicks)` 로 전이 시간을 준다. 0 이면 즉시. 왕복/체인 연출은 보간이 아니라 코루틴 `delay` 로 짠다.

`init()` 에서 밝기를 15/15 로 고정하고 최초 변환을 적용한다.

## 1인칭 고정

요소는 가짜 Display 엔티티를 `owner` 본인에게 passenger 로 탑승시켜 카메라에 따라붙게 한다. `setFirstPersonOnly(true)` 는 별도 가림 처리 없이 **표시 거리를 0.003 으로 줄여** 본인 카메라에만 잡히게 한다.

## 폰트 측정 (`FontRegistry`)

inline/typewriter 의 폭 정렬과 `HUDManager.advanceWidth` 가 같은 경로를 쓴다.

- `advanceWidth(component)` 는 컴포넌트를 자식까지 재귀 순회하며, 각 `TextComponent` 의 코드포인트마다 폰트 definition 의 `measureWidth` 를 합산한다. 폰트는 컴포넌트 `font()` → 상속 폰트 → `minecraft:default` 순으로 해석.
- provider 타입은 `ttf`(`TtfFontProvider`)·`bitmap`(`BitmapFontProvider`) 지원. 그 외는 무시(warn). TTF 메트릭은 경로별로 캐시된다.
- 미정의 폰트 키는 폭 0 으로 측정되고 키당 한 번만 warn 로그.
- 현재 폰트는 default 하나뿐이라 명시 로드(`loadFromClasspath`)로 충분하다. 늘어나면 호출 추가 또는 디렉터리 스캐너 도입.

## 수명 이벤트 (`HUDPlayerListener`)

- **퇴장**(`PlayerQuitEvent`) → `clearAll`. 해당 플레이어 전 그룹 제거.
- **텔레포트**(`PlayerTeleportEvent`) → `scope.launch { respawn }`. 디스패처가 BukkitMain 이라 **다음 틱**에 재스폰한다. 텔레포트 직후엔 탑승 관계가 클라이언트에서 풀릴 수 있어, 위치 확정 후 재스폰/재전송해야 안정적이다.
- **리스폰**(`PlayerPostRespawnEvent`) → 즉시 `respawn`.

`respawn` 은 요소를 마지막 상태로 다시 show 하고 `rebroadcast(owner.entityId)` 로 탑승 관계를 재전송한다.

## 새 요소 종류 추가

1. `hud:api` 에 인터페이스 정의(`ActiveHUD` 상속).
2. `hud:core` 에 `AbstractHUD` 상속 구현 — `translation()` / `rotationEulerOffset()` 제공, 종류별 setter 추가.
3. `HUDGroup`(api) 에 `addXxx` 추가, `HUDGroupImpl`(core) 에 생성 로직 추가.
4. 필요한 가짜 엔티티 타입이 없으면 `nms` 에 `PseudoDisplayEntity` 변종 추가.
5. [domain/hud.md](../guide/domain/hud.md) 요소 표 갱신.

## 관련 문서

- [domain/hud.md](../guide/domain/hud.md) — 사용자 가이드
- [di.md](../guide/di.md) — `@Bean`·`@Listener`·`ManagedLifecycle`
- [module-architecture.md](../overview/module-architecture.md) — api/core 분리와 NMS 의존 격리
