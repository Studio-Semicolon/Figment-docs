플레이어의 화면에 실시간 미니맵을 표시한다. 실제 지형·마커·자신 및 다른 플레이어·사망 지점을 표시하고, 탐험(안개) 추적을 지원한다. `MinimapService` 를 주입받아 플레이어별로 활성/비활성화 한다.

## 개요

- 각 요소(지형·자기·마커)는 별도 맵 레이어다. 렌더루프가 **2틱마다** 각 레이어를 128×128 픽셀로 그려 전송한다(변화 없으면 전송 생략).
- 지형은 실제 블록색(vanilla 지도와 동일 알고리즘)을 128블록 타일로 캐싱해 재사용한다. 타일은 비동기로 렌더된다.
- 사용·도메인 모듈은 `minimap:api` 만 의존한다. 구현(`minimap:core`)과 NMS(`nms:v1_21_11`)는 DI 로 연결된다.

:::note
**클라이언트 리소스팩이 필요하다.** 맵 픽셀의 특정 인덱스에 **셰이더가 읽는 제어값**으로 인코딩된다. 이를 해석하는 클라이언트 셰이더가 없으면 미니맵이 보이지 않는다.
:::

## 예제

`MinimapService` 를 주입받아 플레이어별로 활성/비활성화 한다:

```kotlin title="MinimapCommand.kt"
@Command(label = "minimap")
class MinimapCommand(
    private val service: MinimapService,
) {
    @Child("on")
    fun enable(@Sender player: Player) {
        service.enable(player)
    }

    @Child("off")
    fun disable(@Sender player: Player) {
        service.disable(player)
    }
}
```

## 마커

`Marker` 를 만들어 `addMarker` 로 추가한다. 월드 좌표를 주면 렌더 시 화면 좌표로 투영된다:

```kotlin
val marker = Marker(
    id = "spawn",
    world = player.world,
    x = 0, z = 0,
    icon = /* MinimapIconProvider 로 얻은 MinimapIcon */,
    keepOnEdge = true, // 벗어났을 시 미니맵의 가장자리에 위치할 것인지
)
when (service.addMarker(player, marker)) {
    MinimapService.AddMarkerResult.SUCCESS -> { /* ok */ }
    MinimapService.AddMarkerResult.ALREADY_EXISTS -> { /* 같은 id 존재 */ }
    MinimapService.AddMarkerResult.MINIMAP_DISABLED -> { /* 미니맵 꺼짐 */ }
}
```

| 인자 | 타입 | 가변 | 설명 |
|:-----|:-----|:----:|:-----|
| `id` | `String` | 불변 | 마커 식별자. 미니맵당 유일. 중복이면 `ALREADY_EXISTS` |
| `world` | `World` | 불변 | 마커가 속한 월드 |
| `x` / `z` | `Int` | 가변 | 월드 좌표. 렌더 시 화면 좌표로 투영. 플레이어·사망 마커가 갱신 |
| `icon` | `MinimapIcon` | 가변 | 표시 아이콘. `MinimapIconProvider` 로 얻음 |
| `keepOnEdge` | `Boolean` | 불변 | 화면 밖으로 나가도 가장자리에 고정해 방향 표시(오프스크린 마커) |

| 메서드 | 용도 |
|---|---|
| `addMarker(player, marker)` | 마커 추가. 결과는 `AddMarkerResult` |
| `removeMarker(player, id)` | id 로 제거 |
| `getMarkers(player)` | 현재 마커 전체(id→마커) |
| `setDeathMarker(player)` | 현재 위치에 사망 마커(가장자리 고정). 미니맵당 1개, 새로 찍으면 교체 |
| `clearDeathMarker(player)` | 사망 마커 제거 |

마커는 현재 **인메모리** 저장이라 서버 재시작 시 사라진다. 사망 마커는 `PlayerDeathEvent` 로 자동으로 찍힌다.

### 아이콘 등록

아이콘은 `MinimapIconProvider.getIcon(key)` 로 얻는다. **등록 정책은 파일 규약**이다 — 어느 모듈이든 `resources/minimap/<key>.png` 로 존재 시 파일명이 곧 key 가 된다. 코드 등록·목록 수정 불필요(fat jar 에서 리소스가 병합되므로 `game:content` 도 자신의 리소스에 넣을 수 있다).

| key | 용도 |
|:----|:-----|
| `player` | 플레이어 마커 기본 아이콘 |
| `death` | 사망 마커 |
| `offscreen_player` | 화면 밖 플레이어 방향 표시 |
| `test` / `test2` / `test3` | 렌더 테스트용 |

`getKeys()` 는 부팅 시 `minimap/` 를 스캔해 존재하는 key 전체를 돌려준다. `/minimap marker <id> <icon>` 의 `icon` 자동완성이 이 목록을 쓴다.

## 탐험 및 안개 {.experimental}

지나간 곳만 지도에 드러내고 나머지는 안개로 가리는 기능. **컴파일 타임 스위치**(`ExplorationConfig.ENABLED`, `minimap:core`)로 켠다 — 런타임 커맨드·config 토글은 없다. 기본 `false`(개발 서버 청크 PDC 누적 방지). 켜려면 그 상수를 `true` 로 바꿔 재빌드한다.

안개는 **3×3 청크(48블록) 단위**로 걷힌다 — 그 9청크 중 한 곳에라도 들어서면 뭉치 전체가 드러난다. 안개 자체는 지형 위에 덮이는 안개 마커로 표현되고, 리소스팩 셰이더가 그 마커를 안개로 렌더한다.

:::warning
실험적 기능입니다. 안개 비주얼은 전용 셰이더(리소스팩)에 의존합니다 — 안개 마커는 헤더 컨트롤 바이트의 fog 플래그로 식별되고, 셰이더가 그 레이어의 footprint 픽셀을 안개로 렌더합니다. **셰이더 훅이 없으면** footprint 채움색(회색)이 그대로 사각형으로 보입니다.
:::

## 자주 쓰는 옵션

- **다른 플레이어 마커**는 같은 월드 접속자를 20틱마다 sync 한다. 아이콘은 플레이어 스킨(비동기 로드).
- **화면 위치**는 우측 고정(현재 `MinimapScreenPosition.RIGHT`).

## 흔한 함정 (gotchas)

:::danger
- 아직까지 **활성화는 수동.** 접속 자동 활성이 없다. `enable` 을 호출하지 않으면 아무것도 안 보인다.
- **마커는 재시작 시 사라진다.** 인메모리 저장이다. 영속이 필요하면 PDC 저장소로 교체해야 한다.
- **블록 변경 반영은 대부분 즉시**(설치·파괴·폭발·피스톤·성장 등은 다음 틱 패치). 단 고빈도 이벤트(물리·물·용암·레드스톤 등)나 누락분은 최대 5초 TTL 후 재렌더로 반영된다.
- **텔레포트 직후 미니맵이 흔들릴 수 있다.** 탑승 관계가 클라이언트에서 풀려 리스너가 **다음 틱**에 재스폰한다.
:::

## 관련 문서

- [DI](nav:guide/di)
- [커맨드](nav:guide/command)
- [리스너](nav:guide/listener)
