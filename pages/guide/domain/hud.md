플레이어 화면에 고정되는 HUD 를 표시한다. 텍스트·아이템·블록·인라인(혼합)·타자기 효과를 지원한다. `HUDManager` 를 주입받아 `createGroup` 으로 그룹을 만들고, 그룹에 요소를 추가한다.

## 개요

- 실제 구현은 **가짜 Display 엔티티를 플레이어 본인에게 탑승(passenger)** 시켜 화면에 고정한다. 모든 패킷은 `owner` 한 명에게만 전송된다.
- 요소는 항상 **그룹(`HUDGroup`)** 안에서 만든다. 그룹 오프셋이 모든 요소에 합산되며, 그룹 단위로 일괄 제거/리스폰된다.
- 좌표·스케일 단위는 레퍼런스 해상도 픽셀 기준. 화면 위치는 `HUDAnchor`(3x3 격자) + 픽셀 오프셋으로 정한다.
- 퇴장/텔레포트/리스폰 시 자동 정리·복원된다(`HUDPlayerListener`).

## 예제

`HUDManager` 를 주입받아 그룹을 만들고 요소를 추가한다:

```kotlin title="HUDCommand.kt"
@Command(label = "hud", description = "예제 HUD를 표시한다.")
class HUDCommand(
    private val manager: HUDManager,
    private val scope: CoroutineScope,
) {
    @Child("text1")
    fun spawnText1(@Sender player: Player, @Arg("id") id: String) {
        val group = manager.createGroup(player, id)
        group.addText("text") {
            setAnchor(HUDAnchor.MIDDLE_CENTER)
            setOffset(0f, 0f, 0f)
            setScale(80f, 80f, 1f)
            setText(Component.text("테스트입니다."))
            setTextAlignment(TextDisplay.TextAlignment.CENTER)
        }
    }
}
```

> 출처: `game/content/.../hud/HUDCommand.kt`

## 요소 종류

그룹에 추가하는 5종. 모두 `id` + configure 람다를 받는다.

| 메서드 | 반환 | 용도 |
|---|---|---|
| `addText(id) { }` | `TextHUD` | 텍스트. 줄너비·불투명도·배경·정렬·그림자 |
| `addItem(id) { }` | `ItemHUD` | 아이템 아이콘. `setItem` / `setItemTransform` |
| `addBlock(id) { }` | `BlockHUD` | 블록. `setBlock` / `setCentered` |
| `addInline(id) { }` | `InlineHUD` | 텍스트·아이템·블록을 한 줄에 혼합. 폭은 폰트 메트릭으로 측정 |
| `typewriter(id, interval) { }` | `TypewriterController` | 타자기 효과. 글자 단위 점진 출력 |

### 인라인

`text`/`item`/`block` 을 순서대로 쌓으면 한 줄에 배치된다:

```kotlin title="HUDCommand.kt"
group.addInline("inline") {
    setAnchor(HUDAnchor.MIDDLE_CENTER)
    setTextAlignment(TextDisplay.TextAlignment.CENTER)
    item(ItemStack.of(Material.IRON_INGOT), scale = 40f)
    text(Component.text(" + "))
    item(ItemStack.of(Material.STICK), scale = 40f)
    text(Component.text(" = "))
    item(ItemStack.of(Material.IRON_SWORD), scale = 40f)
}
```

> 출처: `game/content/.../hud/HUDCommand.kt`

### 타자기 효과

`interval` 은 글자 사이 틱 간격. 시퀀스 토큰으로 흐름을 짠다:

```kotlin title="HUDCommand.kt"
group.typewriter("tw", interval = 2) {
    setAnchor(HUDAnchor.MIDDLE_CENTER)
    setScale(80f, 80f)
    text(Component.text("안녕하세요").color(NamedTextColor.RED))
    action { player.playSound(sound) }   // 해당 시점에 콜백
    pause(20)                            // 20틱 멈춤
    speed(3.0)                           // 이후 3배 빠르게
    text(Component.text("반갑습니다"))
    onComplete { manager.removeGroup(player, "test") }
}
```

> 출처: `game/content/.../hud/HUDCommand.kt`

## 자주 쓰는 옵션

### 배치 — 모든 요소 공통 (ActiveHUD)

| 메서드 | 의미 |
|---|---|
| `setAnchor(anchor)` | 화면 정렬 앵커. 기본 `MIDDLE_CENTER` |
| `setOffset(x, y, z, interpolationTicks)` | 앵커 기준 픽셀 오프셋. 보간 가능 |
| `setScale(x, y, z, interpolationTicks)` | 스케일. 기본 80/80/1 |
| `setRotation(x, y, z, interpolationTicks, dir)` | 오일러 각 회전. `dir` 로 좌/우 적용 위치 선택 |
| `setPivotPoint(x, y)` | 스케일·회전 기준점(피벗) |
| `setViewRange(range)` | 표시 거리 배율 |
| `setFirstPersonOnly(enabled)` | 1인칭에서만 표시 |
| `destroy()` / `respawn()` | 제거 / 재스폰 |

### 앵커 — HUDAnchor

`TOP_LEFT` … `BOTTOM_RIGHT` 의 3x3 격자 + `UNALIGNED`. `col`(0=left,1=center,2=right) / `row`(0=top,1=middle,2=bottom) 로 격자 위치를 읽는다.

### 텍스트 전용 (TextHUD)

`setText` / `getText` / `setLineWidth` / `setTextOpacity(Byte, -1=불투명)` / `setBackgroundColor(ARGB)` / `setTextAlignment` / `setShadow`.

### 그룹 (HUDGroup)

`offset(x, y, z, interpolationTicks)` 로 그룹 전체 오프셋을 전파. `get(id)` / `remove(id)` / `destroy()` / `respawn()`.

### 폭 측정 — advanceWidth

`manager.advanceWidth(component)` 로 텍스트 advance width(픽셀)를 미리 잰다. inline/typewriter 와 동일한 폰트 메트릭 기반이라 콘텐츠 쪽 레이아웃 사전 계산에 쓴다.

### 보간 (interpolationTicks)

`setOffset`/`setScale`/`setRotation` 의 `interpolationTicks > 0` 이면 그 틱 동안 부드럽게 변한다. 0 이면 즉시. 스케일 펄스 등 연출은 코루틴 `delay` 와 조합한다(아래 함정 참고).

## 흔한 함정 (gotchas)

:::danger
- **같은 그룹 ID 재생성은 예외.** `createGroup` 은 이미 있는 ID 면 `require` 로 깨진다. 기존 그룹은 `getGroup` 으로 조회하거나 `removeGroup` 후 다시 만든다.
- **HUD 는 항상 그룹 안에서.** 단독 요소 API 는 없다. 한 개만 필요해도 그룹을 만들고 요소 하나를 넣는다.
- **연출 타이밍은 코루틴으로.** `interpolationTicks` 는 한 번의 전이만 보간한다. 왕복/체인 연출은 `scope.launch { delay(...); setScale(...) }` 로 직접 짠다(디스패처=BukkitMain → 메인 스레드 보장).
- **텔레포트 직후 위치가 흔들릴 수 있다.** 탑승 관계가 클라이언트에서 풀려, 리스너가 **다음 틱**에 재스폰한다. 텔레포트 직후 즉시 좌표를 읽어 후속 처리하면 어긋날 수 있다.
- **불투명도는 `Byte`.** `setTextOpacity` 인자는 `Byte`. `-1` 이 완전 불투명. 0~127 사이 값으로 반투명.
- **폰트는 `minecraft:default` 하나만 번들.** inline/typewriter/`advanceWidth` 폭 측정은 클래스패스 `hud/font/default.json` 기준. 미정의 폰트 키는 폭 0 으로 측정되고 warn 로그가 한 번 뜬다.
:::

## 관련 문서

- [DI](nav:guide/di)
- [커맨드](nav:guide/command)
- [코루틴](nav:guide/coroutine)
