클래스에 `@Bean` 선언 시 KSP 가 컴파일 단계에서 수집하고, 런타임에 singleton 으로 자동 등록한다.

## 개요

- `@Bean` 클래스는 부팅 시 singleton 으로 Koin 에 등록된다.
- 생성자 파라미터는 **타입 매칭**으로 자동 주입된다. 의존이 아직 등록되지 않았으면 재시도 큐가 순서를 자동으로 해소한다.
- 런타임 reflection 스캔은 없다. 어노테이션은 KSP 가 매니페스트(`META-INF/figment/beans.txt`)로 굳힌다.
- Koin 은 전역이 아니라 격리 인스턴스(`koinApplication { }`)다. reload 시 충돌을 막기 위함.

## 예제

`@Bean` 을 선언하고, 필요한 의존을 생성자로 받는다.

```kotlin title="PaperDialogService.kt"
@Bean
class PaperDialogService(
    private val renderer: DialogRenderer,
    private val activeDialogs: ActiveDialogRegistry,
    private val actions: DialogActionRegistry,
    private val lifecycle: DialogLifecycleRegistry,
) : DialogService {
    // ...
}
```

> 출처: `dialog/core/.../internal/PaperDialogService.kt`

생성자 4개 파라미터는 전부 다른 `@Bean` 이다. 등록 순서를 신경 쓸 필요 없다 — `renderer` 가 아직 안 만들어졌으면 `PaperDialogService` 는 재시도 큐 뒤로 밀렸다가 의존이 채워진 뒤 생성된다.

## 인터페이스로 노출

구현체를 인터페이스 타입으로 주입받고 싶으면 `binds` 로 노출 타입을 명시한다. 소비자는 구현 클래스를 몰라도 된다.

```kotlin title="SnbtPayloadCodecImpl.kt"
@Bean(binds = [SnbtPayloadCodec::class])
class SnbtPayloadCodecImpl : SnbtPayloadCodec {
    // ...
}
```

> 출처: `nms/v1_21_11/.../SnbtPayloadCodecImpl.kt`

이러면 다른 Bean이 `SnbtPayloadCodec`(인터페이스) 타입으로 주입받는다. NMS 버전 교체 시 구현만 갈아끼우고 소비자는 그대로 둔다.

## 플랫폼이 쥐고 있는 객체 받기

DI 로 주입받는 건 보통 `@Bean` 끼리다. 그런데 컴포넌트를 짜다 보면 **우리가 만든 게 아니라 Paper(서버)가 만든** 객체가 필요할 때가 있다. 대표적으로:

| 타입 | 무엇인가 | 언제 필요한가 |
|---|---|---|
| `JavaPlugin` / `Plugin` | 플러그인 본체 | 스케줄러 등록, 리소스 읽기, `dataFolder` 접근 |
| `Server` | Bukkit 서버 | 온라인 플레이어 조회, 월드 접근 |
| `CoroutineScope` | 플러그인 전역 코루틴 스코프 | `launch` 로 비동기 작업 시작 |
| `Logger` | Bukkit JUL 로거 | 로그 출력 (보통은 `common` 의 slf4j 확장 권장) |

이 객체들은 플러그인이 부팅되기 **전에** 이미 Paper 가 만들어 놨다. 그러니 Figment 는 부팅 시 이것들을 따로 모아 두고(`PluginScopedInstanceProvider`), 다른 `@Bean` 과 똑같이 생성자로 주입해 준다 — 차이를 의식할 필요 없이 타입만 적으면 된다.

```kotlin
@Bean
class AutoSaver(
    private val plugin: JavaPlugin,  // Paper 가 쥐고 있던 본체
    private val scope: CoroutineScope, // 플러그인 전역 스코프
) {
    fun start() {
        scope.launch { /* ... */ }
    }
}
```

내부적으로 `BeanRegistry` 는 생성자 파라미터를 해소할 때 **이 미리 제공된 목록을 Koin 보다 먼저** 본다. 즉 위 4종은 일반 `@Bean` 검색을 타지 않고 곧바로 채워진다.

:::danger
이 타입들을 직접 `@Bean` 으로 다시 등록하지 않는다. 이미 제공되고 있어, 같은 타입이 둘이 되어 충돌한다.
:::

## 종료 정리

외부 자원·핸들러 큐·캐시처럼 Bean 자체가 정리해야 할 게 있으면 `ManagedLifecycle` 을 구현한다. `BeanRegistry.teardown` 마지막에 `shutdown()` 이 한 번 호출된다.

```kotlin title="PaperDialogService.kt"
@Bean(binds = [DialogService::class])
class PaperDialogService(/* ... */) : DialogService, ManagedLifecycle {
    override fun shutdown() {
        activeDialogs.clear()
        actions.clear()
        lifecycle.clear()
    }
}
```

> 출처: `dialog/core/.../internal/PaperDialogService.kt`

**멱등 필수.** 호출이 중복돼도 안전해야 한다. 호출 순서는 정의되지 않으므로 Bean 간 종료 순서에 의존하지 않는다.

## 플레이어 세션 정리

플레이어별 인메모리 상태(접속 중에만 유지, 서버 재시작 후엔 사라져도 되는 것 — 콤보 상태, HUD 세션, 활성 다이얼로그 등)는 `PlayerSessionHandler` 를 구현해 관리한다. `onJoin`/`onQuit` 중 필요한 메서드만 재정의하면 되고, `binds = [PlayerSessionHandler::class]` 로 등록하면 `PlayerSessionListener` 가 `PlayerJoinEvent`/`PlayerQuitEvent` 발생 시 자동으로 호출한다.

```kotlin title="HUDManagerImpl.kt"
@Bean(binds = [HUDManager::class, PlayerSessionHandler::class])
class HUDManagerImpl(/* ... */) : HUDManager, PlayerSessionHandler {
    override fun onQuit(player: Player) = clearAll(player)
}
```

> 출처: `hud/core/.../impl/HUDManagerImpl.kt`

같은 클래스가 다른 `binds` 인터페이스(`HUDManager`)와 `PlayerSessionHandler` 를 동시에 노출해도 된다. join/quit 라이프사이클과 무관한 영속 데이터(PDC)는 이 훅과 관계없이 필요한 시점에 직접 읽고 쓴다.

:::danger
- **호출 순서는 보장하지 않는다.** 한 핸들러의 `onJoin`/`onQuit` 이 다른 핸들러의 세션 데이터를 참조하면 안 된다.
- **`onQuit`에서 반드시 정리한다.** `onJoin`에서 채운 상태는 `onQuit`에서 반드시 비운다 — `PlayerQuitEvent` 는 서버 종료 시에도 발행된다.
:::

> 정의: `framework/api/.../session/PlayerSessionHandler.kt`, `framework/core/.../session/PlayerSessionListener.kt`

## 자주 쓰는 옵션

### List<T> 로 같은 타입 Bean 전부 모으기

생성자 파라미터를 `List<T>` 로 선언하면 등록된 모든 `T` Bean이 리스트로 주입된다. 플러그인 방식 확장에 쓴다.

```kotlin
// 모든 ArgumentTypeHandler 구현을 한 번에 수집
@Bean(binds = [ArgumentTypeHandler::class])
class PlayerArgumentTypeHandler : ArgumentTypeHandler<Player> { /* ... */ }
```
각 핸들러는 `binds = [ArgumentTypeHandler::class]` 로 등록하고, 수집하는 쪽(`ArgumentTypeRegistry`)이 `List<ArgumentTypeHandler<*>>` 로 받는다.

> 출처: `framework/core/.../command/argument/ArgumentTypeHandlers.kt`

### 도메인 마커는 @Bean 없이도 수집된다

후술할 `@Listener`, `@Command`, `@Dialog` 등 처럼 `@Scannable` 메타가 선언된 어노테이션은 `@Bean` 없이 같은 메커니즘으로 수집·등록된다.

### 조건부 등록 — @PluginDepend

외부 플러그인이 있을 때만 등록하려면 `@PluginDepend(plugins = ["CoreFrame"])` 를 함께 붙인다. AND 조건이며, 미충족 시 런타임 `ManifestLoader` 단계에서 제외된다. 의존하는 쪽에도 같은 `@PluginDepend` 를 붙이거나, 연동 전체를 그 Bean 안에 격리한다.

> 정의: `framework/api/.../di/Annotations.kt`

## 흔한 함정 (gotchas)

:::danger
- **생성자는 하나여야 한다.** 0개 또는 2개 이상이면 즉시 실패한다. 보조 생성자·기본값 오버로드를 만들지 않는다.
- **순환 의존은 부팅을 깬다.** 재시도 큐가 더 진전 없으면 `NoBeanDefinitionsFoundException` 을 던진다. 콘솔에 미해결 파라미터가 색으로 출력된다(초록=해소, 빨강=미해결).
- **`binds` 를 빠뜨리면 인터페이스로 받지 못한다.** `@Bean` 만 선언 시 자기 구체 타입으로만 주입된다. 인터페이스 주입이 필요하면 `binds` 명시한다.
- **`shutdown()` 비멱등은 reload 때 터진다.** `onDisable → onEnable` 재부팅이 가능한 구조라 중복 호출 안전성이 필요하다.
:::

## 관련 문서

- [개요](nav:overview)
- [리스너](nav:guide/listener)
- [커맨드](nav:guide/command)
- [코루틴](nav:guide/coroutine)
