Figment 는 Paper 기반 멀티모듈 플러그인으로 **<치미망량>** 프로젝트의 엔진이다.

## 왜 Figment 인가

Figment 는 범용 프레임워크가 아니다. 세 가지 제약이 설계를 끌고 간다.

- **일관된 인프라** — ProtocolLib, PacketEvents, Lamp 등 여러 라이브러리 활용에서의 문제점은 등록 방식, 라이프사이클 등이 제각각이라 파편화된다. Figment 는 프로젝트의 중심 인프라를 일관되게 통합한다.
- **배포 컨텐츠** — 일반 플러그인과 달리 데이터 저장소(DB·yaml·json)가 유저에게 노출되면 안 된다. 컨텐츠 정의·데이터는 코드/내부 저장소에 두고 접근은 추상화 뒤에 숨긴다.
- **멀티 모듈 협업** — 기여자 3인 이상이 담당 영역을 코드 구조로 드러내야 한다. 도메인별 모듈 분리 + `framework`/`common` 공통 인프라 + 의존 방향 규칙(컴파일 단계 차단)으로 경계를 지킨다.

:::note
자세한 모듈 경계와 의존 방향은 [모듈 구조](nav:architecture/module)를 참고한다.
:::

## 핵심 인프라

- **DI** — Spring Framework 에서 착안한 어노테이션 기반 의존성 주입 및 등록.
- **Listener** — `@Listener` + `@Subscribe` 만으로 Bukkit 이벤트 핸들러 등록.
- **Command** — Brigadier 기반 선언형 커맨드. `@Command(label = ...)` + `@Child` / `@Arg`.
- **Coroutine** — `Dispatchers.BukkitMain` 와 플러그인 스코프 통합. teardown 시 자동 정리.

:::note
각 항목의 자세한 사용법은 왼쪽 사이드바의 **가이드** 섹션 개별 페이지를 참고한다. 예: [리스너 가이드](nav:guide/listener)
:::

## DI(의존성 주입)

```kotlin title="DamageService.kt"
@Bean
class DamageService(
    private val plugin: JavaPlugin,
    private val cooldowns: CooldownService,
) : ManagedLifecycle {
    override fun shutdown() { /* 외부 자원 정리 */ }
}
```

- `@Bean` 을 선언한 클래스는 부팅 시 singleton 으로 등록된다.
- 생성자 파라미터는 타입 매칭으로 자동 주입된다.
- 인터페이스 타입으로 노출하려면 `@Bean(binds = [Foo::class])` 로 명시.
- 종료 시 자원 정리가 필요하면 `ManagedLifecycle` 을 구현. 멱등 의무.

## 리스너

```kotlin title="JoinGreeter.kt"
@Listener
class JoinGreeter {

    @Subscribe(order = HandleOrder.NORMAL, ignoreCancelled = false)
    fun onJoin(event: PlayerJoinEvent) {
        event.player.sendMessage("환영합니다!")
    }
}
```

:::tip
자세한 옵션(`order`, `ignoreCancelled`)은 [리스너 가이드](nav:guide/listener) 에서 다룬다.
:::

## 커맨드

```kotlin title="HealCommand.kt"
@Command(label = "heal", description = "체력 회복 명령어")
class HealCommand {

    @Child("")
    fun self(@Sender player: Player) {
        player.health = player.maxHealth
    }

    @Child("target")
    fun target(@Sender sender: Player, @Arg("player") target: Player) {
        target.health = target.maxHealth
    }
}
```

## 코루틴

```kotlin title="AutoSaver.kt"
@Bean
class AutoSaver(private val scope: CoroutineScope) {
    init {
        scope.launch(cancelOnDisable + CoroutineName("auto-saver")) {
            while (isActive) {
                delay(60_000)
                save()
            }
        }
    }
}
```

:::warning
teardown 정책(`cancelOnDisable` / `awaitOnDisable`)을 명시하지 않으면 기본값 `awaitOnDisable` 이 적용된다.
:::
