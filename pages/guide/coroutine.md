플러그인 전체가 하나의 `CoroutineScope` 다. DI 로 주입받아 `launch` 시 메인 스레드 위에서 코루틴이 실행된다. `onDisable()` 시 진행 중 Job 은 선언한 정책대로 정리된다 — 스케줄러 직접 관리, `BukkitRunnable` 은 필요하지 않다.

## 개요

- 플러그인이 `CoroutineScope` 를 구현하므로 컴포넌트는 `CoroutineScope` 를 **생성자 DI** 로 그대로 받는다.
- 기본 디스패처는 `Dispatchers.BukkitMain` — Bukkit 메인 스레드에서 실행된다. 즉 `launch { }` 안에서 Bukkit API 를 바로 호출해도 안전하다.
- `delay()` 는 스레드를 점유하지 않고 `runTaskLater` 로 변환된다. 단위는 틱(1틱 = 50ms), 50ms 미만은 1틱으로 올림.
- 자식 코루틴 하나가 실패해도 형제·부모를 취소하지 않는다(`SupervisorJob`).
- 종료 시 각 Job 의 처리 방침은 `TeardownOption` 으로 선언한다.

## 예제

`CoroutineScope` 를 주입받아 주기 작업을 띄운다.

```kotlin
@Bean
class AutoSaver(private val scope: CoroutineScope) {
    init {
        scope.launch(cancelOnDisable + CoroutineName("auto-saver")) {
            while (isActive) {
                delay(60_000)   // 메인 스레드 점유 없이 60초 대기
                save()
            }
        }
    }

    private fun save() { /* ... */ }
}
```

핵심:
- `scope.launch { }` 안은 메인 스레드. Bukkit API 직접 호출 OK.
- `cancelOnDisable` 로 "종료 시 즉시 취소" 를 선언했다(아래 옵션 참고).
- `CoroutineName` 을 붙이면 종료 로그·미처리 예외 로그에서 어떤 Job 인지 추적된다.

## 종료 정책

`onDisable()` 진입 시 진행 중 Job 을 어떻게 처리할지 `launch` 컨텍스트로 선언한다.

| 옵션 | 동작 | 용도 |
|---|---|---|
| `cancelOnDisable` | 종료 진입 즉시 취소 | 반복 작업, 장시간 폴링 — 완료를 기다릴 의미 없는 Job |
| `awaitOnDisable` (기본) | 완료까지 대기. 타임아웃 시 취소 → abandon | DB 저장, 파일 flush — 데이터 손실 위험 있는 Job |

```kotlin
// 즉시 취소 대상
scope.launch(cancelOnDisable) { while (isActive) { poll(); delay(1000) } }

// 끝까지 기다려야 하는 저장 작업 (기본값이지만 의도 명시)
scope.launch(awaitOnDisable + CoroutineName("flush")) { repository.flush() }
```

> 정의: `framework/api/.../coroutine/TeardownOption.kt`

종료 순서(`Figment.onDisable`):
1. `cancelOnDisable` 인 Job 을 트리 전체에서 먼저 일괄 취소(중첩 launch 까지 `childrenAll` 로 커버).
2. 남은 직접 자식 Job 을 완료까지 대기 — **1초** 초과 시 취소 시도, 추가 **2초** 초과 시 강제 abandon.

## 자주 쓰는 옵션

### 무거운 작업은 메인 스레드에서 빼기

기본이 메인 스레드라, CPU·IO 무거운 작업을 `launch { }` 안에서 실행 시 서버가 지연된다. 다른 디스패처로 옮겼다가 결과 적용만 메인으로 되돌린다.

```kotlin
scope.launch {
    val data = withContext(Dispatchers.IO) { loadFromDisk() } // 워커 스레드
    applyToWorld(data)                                          // 다시 메인 스레드
}
```

### CoroutineName 으로 추적 가능하게

미처리 예외 핸들러와 종료 로그가 `CoroutineName` 을 출력한다. 운영 중 어떤 Job 이 문제인지 보려면 이름을 붙인다.

## 흔한 함정 (gotchas)

:::danger
- **플러그인 스코프 밖에서 `Dispatchers.BukkitMain` 을 쓰지 않는다.** `GlobalScope.launch(Dispatchers.BukkitMain)` 같은 호출은 `PluginCoroutineContextElement` 가 없어 `error()` 로 즉시 깨진다. 항상 DI 로 받은 `scope` 를 쓴다.
- **`launch { }` 안은 메인 스레드다.** 블로킹 IO·무거운 연산을 그대로 돌리면 TPS 가 떨어진다. `withContext(Dispatchers.IO)` 로 빼낸다.
- **`delay` 정밀도는 틱(50ms)이다.** 50ms 미만을 넘겨도 최소 1틱(50ms) 대기로 올림된다. 밀리초 정밀 타이밍에는 부적합.
- **`awaitOnDisable` 도 무한정 기다리지 않는다.** 1초 + 2초 초과하면 abandon 된다. 종료 시 반드시 끝나야 하는 저장은 그 시간 안에 끝나도록 설계한다.
- **반복 작업에 기본값(await)을 쓰면 종료가 느려진다.** `while (isActive)` 루프는 완료가 없으므로 `cancelOnDisable` 을 붙인다. 그렇지 않으면 종료 시 타임아웃까지 기다려야 한다.
:::

## 관련 문서

- [DI](nav:guide/di)
- [리스너](nav:guide/listener)
- [개요](nav:overview)
