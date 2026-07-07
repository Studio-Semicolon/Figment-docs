다이얼로그 UI 를 클래스 하나로 선언한다. `@Dialog` + `DialogScreen` 구현에 슬롯 어노테이션(`@Title`/`@Body`/`@Button` 등)을 선언하면, KSP 가 메타를 생성하고 버튼·액션 핸들러를 자동 등록한다.

## 개요

- `@Dialog` 클래스는 `@Bean` 없이 자동 등록된다(`@Scannable` 메타). 생성자 DI 도 그대로 쓴다.
- UI 구성요소는 **슬롯 어노테이션**으로 선언한다(제목, 본문, 버튼, 입력, 액션).
- 입력값은 `InputKey<T>` 프로퍼티로 선언하고, 버튼 핸들러에서 `inputs[key]` 로 읽는다.

## 예제

```kotlin title="RewardDialogSample.kt"
@Dialog(id = "reward", canClose = true, afterAction = DialogAfterAction.CLOSE, columns = 2)
class RewardDialogSample : DialogScreen {
    @Title
    val title: Component = Component.text("보상 받기", NamedTextColor.GOLD)

    val reward: InputKey<Material> =
        InputKey.option(
            label = Component.text("보상 종류"),
            initial = Material.DIAMOND labeled Component.text("다이아몬드"),
            Material.DIAMOND labeled Component.text("다이아몬드"),
            Material.EMERALD labeled Component.text("에메랄드"),
        )

    val amount: InputKey<Float> =
        InputKey.slider(label = Component.text("수량"), min = 1f, max = 16f, initial = 1f, step = 1f)

    @Button
    val claim: ButtonDefinition =
        button(label = Component.text("선택한 보상 받기")) {
            val type = inputs[reward]
            val count = inputs[amount].toInt().coerceIn(1, 64)
            player.inventory.addItem(ItemStack(type, count))
        }

    @ExitButton
    val cancel: ExitButtonDefinition =
        exitButton(label = Component.text("취소", NamedTextColor.RED)) {
            player.sendMessage(Component.text("취소"))
        }
}
```

## 슬롯 어노테이션

| 슬롯 | 대상 | 비고 |
|:---|:---:|:---|
| `@Title` | 프로퍼티/함수 | 클래스당 최대 1개 |
| `@Body` | 프로퍼티/함수 | 여러 개, 선언 순서대로 누적 |
| `@ItemBody` | 프로퍼티/함수 | tooltip/장식 옵션 |
| `@DialogAction` | 프로퍼티 | 본문 인라인 액션. 재사용 가능 |
| `@Button` | 프로퍼티 | 프로퍼티 이름으로 stable id |
| `@ExitButton` | 프로퍼티 | 클래스당 최대 1개 |

## 입력 — InputKey

프로퍼티로 선언하고 핸들러에서 `inputs[key]` 로 읽는다. 팩토리 4종:

```kotlin
InputKey.text(label, initial = "", width = null, maxLength = null)   // → String
InputKey.bool(label, initial = false)                                // → Boolean
InputKey.slider(label, min, max, initial, step = null)               // → Float
InputKey.option(label, initial?, vararg options)                     // → T
```

## 흔한 함정 (gotchas)

:::danger
- **슬롯 타입·개수 위반은 컴파일 에러.** KSP가 빌드 단계에서 잡는다.
- **인라인 액션은 같은 클래스의 `@DialogAction` 프로퍼티를 참조해야 한다.**
- **`show()` 는 이전 다이얼로그를 `REPLACED` 로 닫는다.**
- **`@Dialog` 선언 후 `DialogScreen` 미구현 시 슬롯이 동작하지 않는다.**
:::

## 관련 문서

- [DI](nav:guide/di)
- [커맨드](nav:guide/command)
- [어노테이션](nav:reference/annotations)
