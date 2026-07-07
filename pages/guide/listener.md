Bukkit 이벤트를 받으려면 클래스에 `@Listener`, 메서드에 `@Subscribe` 를 선언한다. `registerEvents` 호출도, `implements Listener` 도, `onDisable` 에서의 해제도 직접 하지 않는다.

## 개요

- `@Listener` 클래스는 `@Bean` 없이도 KSP 가 자동 수집한다(`@Scannable` 메타). 일반 Bean처럼 생성자 DI 를 자유롭게 쓴다.
- 클래스 안에서 `@Subscribe` 가 선언된 메서드만 이벤트 핸들러로 등록된다.
- 등록은 플러그인 활성화 시, 해제는 비활성화 시 자동. `ListenerAnnotationHandler` → `ListenerRegistry` 가 인스턴스 단위로 풀어준다.
- 메서드는 생성 시점에 한 번 스캔해 Bukkit `EventExecutor` 로 래핑된다. 이벤트 발생 시엔 리플렉션 비용이 없다.

## 예제

플레이어가 움직이면 메시지를 보내는 리스너:

```kotlin title="PlayerListener.kt"
@Listener
class PlayerListener {
    @Subscribe
    fun onMove(event: PlayerMoveEvent) {
        event.player.sendMessage("움직였음!")
    }
}
```

- `@Listener` 만 선언하면 등록됨. 이벤트 타입은 `@Subscribe` 메서드의 파라미터에서 자동 결정된다.
- 각 `@Subscribe` 메서드는 파라미터가 정확히 하나, `Event` 의 서브타입이어야 한다.
- 클래스 하나에 핸들러 여러 개를 둘 수 있고, 생성자로 다른 Bean을 자유롭게 주입받는다.

## 자주 쓰는 옵션

### order — 실행 순서

`@Subscribe(order = ...)` 로 핸들러가 얼마나 먼저/늦게 호출될지 고른다. Bukkit `EventPriority` 와 1:1. 기본값 `NORMAL`.

| 값 | EventPriority | 용도 |
|:---|:---:|:---|
| `FIRST` | LOWEST | 최우선. 사전 보정 / 조기 취소 |
| `EARLY` | LOW | 일반보다 우선 |
| `NORMAL` | NORMAL | 기본값. 일반 비즈니스 로직 |
| `LATE` | HIGH | 일반보다 늦게 |
| `LAST` | HIGHEST | 최종 결정 단계. 다른 모듈 보정 후 |
| `MONITOR` | MONITOR | 감청용. 이벤트 수정/취소 금지 |

```kotlin
@Subscribe(order = HandleOrder.LAST)
fun onDamage(event: EntityDamageEvent) { /* 최종 데미지 보정 */ }
```

> 정의: `framework/api/.../listener/HandleOrder.kt`

### ignoreCancelled — 취소된 이벤트 거르기

`@Subscribe(ignoreCancelled = true)` 면 이미 다른 핸들러가 취소한 이벤트는 받지 않는다. Bukkit 단계에서 걸러지므로 본문에서 `event.isCancelled` 를 다시 검사할 필요가 없다. 기본값 `false`.

```kotlin
@Subscribe(ignoreCancelled = true)
fun onInteract(event: PlayerInteractEvent) {
    // 여기까지 도달했다는 건 아직 취소되지 않았다는 뜻
}
```

## 흔한 함정 (gotchas)

:::danger
- **시그니처가 틀리면 즉시 실패한다.** 파라미터가 0개·2개 이상이거나 Event 서브타입이 아니면 등록 시점에 예외로 터진다.
- **@Subscribe 가 선언되지 않은 메서드는 핸들러가 아니다.** 이벤트 핸들이 안될 시 어노테이션 누락부터 의심.
- **수동 등록/해제 금지.** registerEvents 나 unregisterAll 를 직접 호출하지 않는다.
- **MONITOR + ignoreCancelled 같이 쓰지 않는다.** 감청 목적이 취소 필터링과 충돌한다.
- **같은 order 안에서의 순서는 보장되지 않는다.** 순서 중요 시 서로 다른 order 단계로 나눈다.
:::

## 관련 문서

- [DI](nav:guide/di)
- [커맨드](nav:guide/command)
- [개요](nav:overview)
