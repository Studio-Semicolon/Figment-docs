커맨드 등록은 클래스에 `@Command(label = ...)` 를 선언한다. 인터페이스 구현, `plugin.yml` / `paper-plugin.yml` 에 등록하지 않는다.

## 개요

- `@Command(label = ...)` 클래스는 자동 등록된다(`@Bean` 불필요 — `@Scannable` 메타). 루트 라벨·alias·부모·설명은 어노테이션 속성으로 선언한다.
- 실행 분기는 `@Child("경로")` 메서드로 표현한다. 빈 문자열 `@Child("")` 는 루트(서브토큰 없이 실행).
- 인자는 메서드 파라미터 어노테이션으로 선언한다: `@Sender`, `@Arg`, `@OptionalArg`, 자동완성은 `@Suggests`.
- 일반 Bean과 동일하게 생성자 DI 를 쓴다.

## 예제

```kotlin title="RewardDialogCommand.kt"
@Command(label = "rewardDialog", description = "예제 다이얼로그를 표시한다.")
class RewardDialogCommand(
    private val dialogs: DialogService,   // 생성자 DI
    private val sample: RewardDialogSample,
) {
    @Child("")
    fun open(
        @Sender sender: Player,
    ) {
        dialogs.show(sender, sample)
    }
}
```

핵심:
- `label` 만 필수 속성. `/rewardDialog` 로 호출된다.
- `@Child("")` + `@Sender sender: Player` → 플레이어가 `/rewardDialog` 입력 시 `open` 실행.
- `@Sender` 로 타입을 좁히면 그 외 sender(콘솔 등)는 Brigadier `requires` 가 막아 자동완성·실행 모두 차단된다.

## 서브커맨드와 인자

`@Child` 는 공백 구분으로 다단계 경로를 만든다. 인자는 파라미터에 `@Arg`(필수) / `@OptionalArg`(선택)로 붙인다.

```kotlin title="HealCommand.kt"
@Command(label = "heal")
class HealCommand {
    // /heal           → 자기 자신
    @Child("")
    fun self(@Sender player: Player) {
        player.health = player.maxHealth
    }

    // /heal target <player>
    @Child("target")
    fun target(
        @Sender sender: Player,
        @Arg("player") target: Player,
    ) {
        target.health = target.maxHealth
    }
}
```

- `@Child("player ban")` 처럼 여러 토큰, `@Child("player ban", "p ban")` 처럼 여러 경로 매핑도 가능.
- `@Arg(value)` 의 `value` 는 Brigadier 노드 이름. 빈 문자열이면 파라미터 이름을 쓴다(`-parameters` 컴파일 옵션 필요).
- `@OptionalArg` 는 미입력 시 `null` 전달. `skipFor = Player::class` 로 "콘솔만 생략 가능" 같은 조건도 건다.

## 자주 쓰는 옵션

### 자동완성 — @Suggests

`@Arg(suggests = "키")` 와 같은 키를 가진 `@Suggests("키")` 메서드를 연결한다.

```kotlin
@Child("target")
fun target(@Sender s: Player, @Arg("player", suggests = "online") name: String) { /* ... */ }

@Suggests("online")
fun onlineNames(builder: SuggestionsBuilder) {
    Bukkit.getOnlinePlayers().forEach { builder.suggest(it.name) }
}
```
허용 시그니처는 `(SuggestionsBuilder)` 또는 `(CommandContext<CommandSourceStack>, SuggestionsBuilder)`. `buildFuture()` 는 프레임워크가 호출한다.

두 시그니처 모두 `suspend fun` 으로 선언할 수 있다. DB/네트워크 조회처럼 오프스레드 작업이 필요한 자동완성에 쓴다. `suspend` 가 아니면 지금처럼 동기로 즉시 실행된다.

```kotlin
@Suggests("guildNames")
suspend fun guildNames(builder: SuggestionsBuilder) {
    guildRepository.findAllNames().forEach { builder.suggest(it) } // 오프스레드 조회
}
```

### suspend `@Child`

`@Child` 함수도 `suspend` 로 선언할 수 있다. Brigadier `Command<S>.run` 자체가 동기 API 라 결과를 기다릴 수 없으므로, 프레임워크가 내부적으로 코루틴을 `launch` 하고 `executes` 는 즉시 완료 처리한다 — 커맨드 실행이 "성공적으로 접수됨" 과 "실제 처리 완료" 가 분리된다는 뜻이다.

```kotlin
@Child("cast")
suspend fun cast(@Sender player: Player, @Arg("key") key: String) {
    val result = executor.cast(SkillKey(key), player) // suspend 호출을 바로 쓸 수 있다
    player.sendMessage(...)
}
```

동기 `@Child` 에서 직접 `scope: CoroutineScope` 를 주입받아 `scope.launch { }` 로 감싸던 기존 패턴(`skill:core` 의 `SkillCommand` 등) 대신 `suspend` 하나로 대체 가능하다.

### 커맨드 실행 중 예외 처리

`@Child`(동기·suspend 모두) 본문에서 던진 예외는 `CommandExceptionController` 가 타입별로 라우팅해 sender 에게 응답한다. 직접 `sendMessage` 를 부르고 `return` 하는 대신, sender 에게 그대로 보여줄 메시지가 있으면 `CommandMessageException` 을 던진다.

```kotlin
@Child("give")
fun give(@Sender p: Player, @Arg("item") item: String) {
    val stack = itemRegistry.find(item)
        ?: throw CommandMessageException(Component.text("존재하지 않는 아이템: $item", NamedTextColor.RED))
    p.inventory.addItem(stack)
}
```

도메인 전용 예외를 자동 처리하고 싶으면 `CommandExceptionHandler<T>` 를 구현해 `@Bean(binds = [CommandExceptionHandler::class])` 로 등록한다. 예외의 실제 클래스부터 상위 타입으로 올라가며 핸들러를 찾고, 없으면 프레임워크 기본 메시지 + 로그로 처리한다.

> 정의: `framework/api/.../command/CommandExceptionHandler.kt`, `CommandMessageException.kt` · 구현: `framework/core/.../command/CommandExceptionController.kt`

### 숫자 범위 검증

`@IntRange` / `@LongRange` / `@FloatRange` / `@DoubleRange` 를 인자에 붙이면 Brigadier 가 파싱 단계에서 범위를 강제한다.

```kotlin
@Child("setlevel")
fun setLevel(@Sender p: Player, @Arg("level") @IntRange(min = 1, max = 100) level: Int) { /* ... */ }
```

### 문자열 파싱 방식 — @StringType

`@StringType(WORD | STRING | GREEDY)` 로 토큰 범위를 고른다. 기본 `WORD`(공백 없는 단일 토큰). 문장 전체를 받으려면 `GREEDY`.

### 커스텀 인자 타입

기본 제공 타입(`String`, `Boolean`, `Int`, `Player` 등) 외의 타입을 인자로 받으려면 `ArgumentTypeHandler<T>` 를 구현해 `@Bean(binds = [ArgumentTypeHandler::class])` 로 등록한다. `ArgumentTypeRegistry` 가 모든 핸들러를 수집해 타입별로 조회한다.

> 정의: `framework/api/.../command/argument/ArgumentTypeHandler.kt` · 구현 예: `framework/core/.../command/argument/ArgumentTypeHandlers.kt`

### 실행 권한 — @Permission

`@Permission("노드")` 를 `@Command` 클래스나 `@Child` 메서드에 붙이면 그 권한이 없는 sender 에게는
`@Sender` 타입이 안 맞을 때와 동일하게 커맨드 자체가 존재하지 않는 것처럼 처리된다(바닐라 Minecraft
관례). 클래스와 메서드 양쪽에 있으면 AND — 둘 다 통과해야 실행 가능.

```kotlin
@Command(label = "figment")
@Permission("figment.admin")
class FigmentCommand {
    @Child("reload")
    fun reload(@Sender s: CommandSender) { /* figment.admin 필요 */ }

    @Child("info")
    @Permission("figment.info", "figment.admin", mode = PermissionMode.ANY_OF)
    fun info(@Sender s: CommandSender) { /* figment.info 또는 figment.admin 아무거나 */ }
}
```

권한 없음을 "존재하지 않는 커맨드"가 아니라 명시적으로 안내하고 싶으면, 어노테이션 대신 본문에서
직접 `hasPermission` 을 확인해 [CommandMessageException](nav:guide/command) 을 던진다.

문자열 권한 노드가 아닌 조건(레벨, 소속 등)을 검사해야 하면 `CommandPermission { sender -> ... }`
람다로 직접 만들어 도메인 코드에서 조립한다 — `@Permission` 은 문자열 권한 전용이다.

> 정의: `framework/api/.../command/CommandPermission.kt`, `Annotations.kt` 의 `Permission`

### 다른 커맨드 아래로 병합 — parent

`@Command(parent = "부모라벨")` 로 같은 라벨의 다른 커맨드 아래 서브로 병합된다. 여러 모듈이 한 루트 명령을 나눠 가질 때 쓴다.

## 흔한 함정 (gotchas)

:::danger
- **`plugin.yml` / `paper-plugin.yml` 에 커맨드를 적지 않는다.** Paper plugin yaml 자체가 빌드 타임 생성이고, 커맨드는 `LifecycleEvents.COMMANDS` 에 자동 등록된다. 수동 등록은 충돌·중복.
- **`@Sender` 타입이 일치하지 않을 시 커맨드가 "보이지 않는다".** `requires` 가 막으므로 자동완성 및 실행 거부. 콘솔에서 실행 실패 시 `@Sender Player` 제한부터 확인한다.
- **`@Arg(value)` 빈 문자열 + `-parameters` 누락.** 노드 이름을 파라미터 이름에서 가져오려면 `-parameters` 컴파일 옵션이 필요하다. 명시적으로 `@Arg("name")` 을 주면 안전하다.
- **`parent` 를 쓰면 `aliases` 는 무시된다.** 병합 대상일 때 alias 는 의미가 없어 `CommandAnnotationHandler` 가 경고 후 버린다.
- **`@IntRange` 는 `kotlin.ranges.IntRange` 가 아니다.** 같은 이름의 커맨드 어노테이션이다. 같은 파일에서 Kotlin `IntRange` 를 타입으로 쓰면 FQ 임포트로 구분한다.
- **같은 경로 세그먼트에 서로 다른 `@Permission` 을 가진 `@Child` 두 개를 매핑하지 않는다.** 예를 들어
  `@Child("give")` 가 두 함수(오버로드)에 걸려 있고 각각 다른 권한이면, 두 권한이 그 세그먼트 노드
  에서 AND 로 합쳐진다("give 진입 자체에 둘 다 필요") — Brigadier 가 같은 이름 노드를 하나로 병합하기
  때문. 실행 자체는 함수별로 정확한 권한만 검사되니 안전 방향(과잉 차단)으로 실패하지만, 의도한
  "이 오버로드는 A 권한, 저 오버로드는 B 권한" 과는 다르게 tab-complete 가 더 좁게 보일 수 있다.
- **`suspend @Child` 는 "접수"와 "완료"가 분리된다.** `executes` 는 코루틴을 띄우자마자 즉시 반환하므로, 명령어 실행 자체는 항상 성공한 것처럼 보인다. 본문에서 벌어지는 실패(권한 부족, 잘못된 상태 등)는 sender 에게 메시지를 보내는 방식으로만 알릴 수 있다 — `CommandMessageException` 을 던지거나 직접 `sendMessage` 한다.
:::

## 관련 문서

- [DI](nav:guide/di)
- [리스너](nav:guide/listener)
- [개요](nav:overview)
