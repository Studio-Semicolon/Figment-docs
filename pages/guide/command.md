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

### 다른 커맨드 아래로 병합 — parent

`@Command(parent = "부모라벨")` 로 같은 라벨의 다른 커맨드 아래 서브로 병합된다. 여러 모듈이 한 루트 명령을 나눠 가질 때 쓴다.

## 흔한 함정 (gotchas)

:::danger
- **`plugin.yml` / `paper-plugin.yml` 에 커맨드를 적지 않는다.** Paper plugin yaml 자체가 빌드 타임 생성이고, 커맨드는 `LifecycleEvents.COMMANDS` 에 자동 등록된다. 수동 등록은 충돌·중복.
- **`@Sender` 타입이 일치하지 않을 시 커맨드가 "보이지 않는다".** `requires` 가 막으므로 자동완성 및 실행 거부. 콘솔에서 실행 실패 시 `@Sender Player` 제한부터 확인한다.
- **`@Arg(value)` 빈 문자열 + `-parameters` 누락.** 노드 이름을 파라미터 이름에서 가져오려면 `-parameters` 컴파일 옵션이 필요하다. 명시적으로 `@Arg("name")` 을 주면 안전하다.
- **`parent` 를 쓰면 `aliases` 는 무시된다.** 병합 대상일 때 alias 는 의미가 없어 `CommandAnnotationHandler` 가 경고 후 버린다.
- **`@IntRange` 는 `kotlin.ranges.IntRange` 가 아니다.** 같은 이름의 커맨드 어노테이션이다. 같은 파일에서 Kotlin `IntRange` 를 타입으로 쓰면 FQ 임포트로 구분한다.
:::

## 관련 문서

- [DI](nav:guide/di)
- [리스너](nav:guide/listener)
- [개요](nav:overview)
