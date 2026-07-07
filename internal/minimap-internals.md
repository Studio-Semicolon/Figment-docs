# Minimap 내부 동작

`minimap` 도메인의 렌더 파이프라인·타일 캐시·NMS 경계·맵 레이어 구현 메모. 사용자 관점은 [guide/domain/minimap.md](../guide/domain/minimap.md) 참조.

## 모듈 구성

| 모듈 | 책임 |
|------|------|
| `minimap:api` | `MinimapService`, `Marker`, `MinimapIcon`, `MinimapIconProvider`, `MinimapScreenPosition`. 인터페이스·데이터만 |
| `minimap:core` | 매니저·렌더 파이프라인·타일 캐시·인코더·마커·아이콘·exploration·리스너. `figment.module` |
| `nms:api` | `MinimapAdapter`, `WorldMinimapRenderer`, `PseudoMapLayer`, `IconColorConverter`. 얇은 인터페이스 레이어 |
| `nms:v1_21_11` | 위 인터페이스의 mojang-mapped 구현 |
| `game:content` | `MinimapCommand`(`minimap:api` 만 의존) |

`bootstrap` 이 `minimap:core` 를 의존해 `beans.txt` 가 fat jar 에 shade 된다. `game:content` 는 `minimap:api` 만 본다.

## thin-NMS 경계 (핵심 설계)

원칙: `nms` 모듈엔 `net.minecraft.*`/craftbukkit/mojang-mapped 를 **직접 참조하는 코드만** 둔다. 버전 무관 로직은 전부 `minimap:core`. (Paragon 은 타일 캐시·이미지 디코드까지 nms 에 뒀는데, 그 안티패턴을 답습하지 않았다.)

**`nms:v1_21_11` (NMS 만)**
- `VanillaWorldMinimapRenderer` / `FlatWorldMinimapRenderer` — `MapColor`·`Heightmap`·`Level` 로 128×128 타일을 렌더. **상태를 소유하지 않음**(캐시·필터는 core).
- `PseudoMapLayerImpl` + `ItemFramePackets` — 아이템프레임 2장 스폰/마운트 + `ClientboundMapItemDataPacket`.
- `NMSIconColorConverter` — ARGB→MapColor 팔레트 최근접. `toMapColors(IntArray)` 만.
- `MinimapAdapterImpl` — 위를 조립, `@Bean(binds = [MinimapAdapter::class])`. `unexploredColor`(안개 회색 packed byte)도 여기서 노출.

**`minimap:core` (버전 무관)**
- `WorldMapCache` — byte[] 타일 캐시 + 비동기 렌더 오케스트레이션. NMS 는 `WorldMinimapRenderer` 인터페이스로만.
- 렌더 파이프라인·인코더 — 순수 byte[] 조작.
- 아이콘 PNG/스킨 디코드(`ImageIO`→argb) → `IconColorConverter.toMapColors`.

## 렌더 파이프라인

`MinimapServiceImpl` 이 `scope.launch(Dispatchers.BukkitMain)` 로 렌더루프를 돈다(월드 블록 접근이 메인 스레드 필수). 2틱(`delay(100)`)마다:

1. **지형** — `MinimapRenderPipeline.updatePrimary`
   - `WorldMapCache` 에서 플레이어 위치 주변 **2×2 타일**(128블록 창이 타일 경계를 넘음)을 가져와 `buffer` 에 합성. 아직 렌더 안 된 타일은 이번 틱 스킵.
   - exploration 활성 시 미탐험 청크 픽셀을 `unexploredColor` 로 덮는다(`applyFog`).
   - `PrimaryLayerEncoder` 로 셰이더 제어값(코너 마크·플레이어 좌표 소수부·화면 위치)을 쓰고 전송.
2. **마커** — `updateAllMarkers`: 자기(`SelfMarkerEncoder`, 중앙 고정) + 일반/사망/플레이어 마커(`MarkerLayerEncoder`, 상대 위치 투영 + 화면 밖 가장자리 고정).
3. **플레이어 sync** — 20틱(10 iteration)마다 `PlayerMarkerService.sync`.

각 레이어는 `MinimapLayer` 로 감싸 **직전 전송 데이터와 같으면 전송 생략**(정지 화면 패킷 억제).

### 타일 캐시 (`WorldMapCache`)

- 월드별 128블록 타일. `tileKey`/`align` 로 좌표 정규화.
- `get` 은 캐시 히트면 반환, 미스/TTL(5초) 만료면 `scheduleRender` 예약.
- `scheduleRender`: 타일의 청크 8×8 를 `getChunkAtAsync` 로 **비동기 로드** → `Dispatchers.BukkitMain` 에서 `renderer.renderFully`. `pending` set 으로 중복 예약 방지.
- **viewer 레퍼런스 카운팅**: 각 플레이어가 보는 4타일을 추적. 아무도 안 보는 타일은 즉시 해제(`releaseViewer`/`setViewerTiles`).
- **블록 변경 즉시 반영**: `MinimapBlockListener` 가 지도 색이 바뀌는 블록 이벤트를 받아 `cache.updateBlock` 으로 해당 픽셀만 패치한다(TTL 을 기다리지 않음). 이벤트는 dirty set 에 모아 다음 틱 한 번에 flush, 각 블록의 상하좌우 이웃까지 갱신(명암이 인접 높이에 의존). 고빈도 `BlockPhysics`/`BlockRedstone` 등은 트림(제외)하고 TTL 로 보완한다.

## 맵 레이어 (아이템프레임 2장)

`PseudoMapLayerImpl` 이 filled_map 을 든 투명 아이템프레임 2장(위=`DOWN`/아래=`UP`)을 소유한다. 두 프레임은 항상 lockstep 이라 일반 `IPseudoEntity` 추상화 없이 여기서 직접 관리한다:

- entityId·mapId 모두 `PseudoIdAllocator` 의 같은 음수 풀에서 발급(맵 ID 도 클라이언트 키일 뿐이라 음수로 충분).
- `PassengerChannel` 로 플레이어 본인에게 마운트.
- **마운트 누수 방지**: `destroy` 는 두 프레임을 vehicle 에서 먼저 dismount 한 뒤 ID 를 반납한다. 안 하면 재발급분이 mount 없이 탑승되는 누수가 생긴다.
- 픽셀 갱신은 `sendMapData` → `ClientboundMapItemDataPacket`.

## 인코더 프로토콜

인코더는 맵 픽셀의 특정 인덱스에 클라이언트 셰이더가 읽는 제어값을 쓴다(`MapEncoder.markCorners`/`encodeFixedPoint`/`encodeUnsigned`). 좌표/인덱스/비트 배치는 셰이더 규약이라 **수정 금지**. `IconRenderer` 는 `index = x * 128 + y`(축 뒤바뀜 규약)로 아이콘을 중앙 정렬해 합성한다.

## exploration / fog

- `ExplorationSettings`(`@Bean`) — `config.yml` `minimap.exploration.enabled`, 기본 `false`, `setEnabled` 로 live 토글 + 영속.
- `ExplorationTracker`(`@Bean`) — 청크 PDC(`NamespacedKey "explored"`) + 인메모리 캐시. 언로드 청크의 제거는 `pendingRemoval` 에 모아 `onChunkLoad` 시 반영.
- 게이트: `MovementExplorationListener`(마킹)와 파이프라인 `applyFog`(마스킹)가 `settings.enabled` 를 검사. 비활성이면 **PDC 쓰기 0**.
- fog 는 렌더러가 아니라 파이프라인이 합성 후 적용한다(캐시에는 원지형만 저장 → 토글 시 재렌더 불필요).

## 플레이어 마커

- `PlayerHeadIconCache` — 스킨 URL 에서 머리(+모자) 8×8 를 잘라 `MinimapIcon` 으로 캐싱. 네트워크·이미지는 `Dispatchers.IO` 코루틴. 스킨 URL 동일 시 재변환 skip, `inflight` 로 중복 요청 1회.
- `PlayerMarkerService.sync` — 이탈자(오프라인/타월드/관전) 제거, 남은 마커 위치·아이콘 갱신, 신규 스폰. `spawn` 시 기본 `player` 아이콘으로 시작하고 `refresh` 로 스킨을 비동기 로드 → 다음 sync 때 캐시에서 헤드 아이콘을 pull.

## 라이프사이클

- `MinimapServiceImpl : ManagedLifecycle`. `shutdown` 에서 렌더 잡 취소 + 전 미니맵 정리(멱등). reload 안전.
- `MinimapPlayerListener` — 퇴장→`disable`, 사망→사망 마커, 리스폰/텔레포트→`respawn`(레이어 재스폰; 텔레포트는 다음 틱).

## Paragon 대비 주요 변경

- `AdapterModule` 수동 부트 → KSP DI(`@Bean`/`@Listener`/`@Command`). `NMSAdapterHolder` service-locator → 생성자 주입.
- 타일 캐시·이미지 디코드를 nms→core 로 이동(thin-NMS). 렌더러 stateless 화.
- 풀스크린(locked view·가짜 ServerPlayer·패킷 인터셉터) 미이식.
- 아이템프레임 전용 pseudo 엔티티 추상화 폐기 — 맵 레이어가 프레임 2장을 직접 관리.
- exploration 컴파일 상수(`EXPLORATION_ENABLED`) → 런타임 config 토글.
- Guava → stdlib/fastutil, `Tasks.repeat`/`Tasks.run(Async)` → 코루틴.
