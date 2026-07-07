이 페이지는 위키를 작성할 때 쓰는 문법과 그 렌더링 결과를 나란히 보여준다. 실제 문서는 `.md` 파일로 작성하고, 내부 컨버터가 이 프로토타입과 동일한 결과로 변환한다.

## 기본 서식

표준 마크다운 헤딩(#, ##), 목록(-, 1.), 굵게(**...**), 인라인 코드(`...`), 링크([]()) 를 그대로 지원한다.

```md title="example.md"
## 예제

플러그인 로드 후 콘솔에서 `getPack()` 결과를 확인하세요.
자세한 내용은 [datapack-discovery](../reference/datapack.md) 문서를 참고합니다.
```

↓ 렌더링 결과

플러그인 로드 후 콘솔에서 `getPack()` 결과를 확인하세요. 자세한 내용은 **datapack-discovery** 문서를 참고합니다.

## 헤딩 칩

`##`/`###` 뒤에 `{.chip이름}` 을 붙이면 헤딩 옆에 상태 배지가 붙는다.

```md
## 섹션 {.experimental}
```

↓ 렌더링 결과

## 섹션 {.experimental}

새 배지가 필요하면 `CHIP_VARIANTS` 에 `{ color, label }` 한 줄을 추가한다.

## 표

표준 GFM 문법의 콜론(`:`)으로 열 정렬을 지정한다. `:---` 왼쪽, `:---:` 가운데, `---:` 오른쪽.

```md
| 항목        | 상태 |  버전 |
|:-----------|:---:|----:|
| DI          | 안정 | 1.0 |
| Dialog      | 안정 | 1.0 |
| HUD         | 실험 | 0.4 |
```

↓ 렌더링 결과

| 항목   | 상태 | 버전 |
|:-------|:----:|-----:|
| DI     | 안정 | 1.0  |
| Dialog | 안정 | 1.0  |
| HUD    | 실험 | 0.4  |

## 인용

일반 인용은 `>` 를 사용하고, 강조 필요 시 `:::타입` fenced 블록으로 5가지 변형(note / tip / warning / danger / performance) 중 고른다.

```md
> 일반 인용문입니다.

:::danger
절대 메인 스레드에서 이 Future 를 .get() 하지 마세요.
:::
```

↓ 렌더링 결과

> 일반 인용문입니다.

:::danger
절대 메인 스레드에서 이 Future 를 `.get()` 하지 마세요.
:::

:::note
`teleportAsync()` 는 청크가 로드되지 않아도 안전합니다.
:::

:::tip
`CoroutineName` 을 같이 붙이면 로그 추적이 쉬워집니다.
:::

:::warning
`MONITOR` 와 `ignoreCancelled` 를 같이 쓰지 마세요.
:::

:::performance
청크가 언로드된 곳으로 텔레포트할 때는 `teleportAsync()` 를 쓰세요.
:::

## 코드 블록

코드는 평소처럼 fenced block 에 직접 쓰거나, `file=` 속성으로 저장소의 실제 소스 파일을 링크해 가져올 수 있다. 확장자(.kt, .java 등)로 문법 강조가 적용됨.

~~~md
```kotlin title="PlayerListener.kt"
@Listener
class PlayerListener { /* ... */ }
```

```kotlin file="../game/content/src/main/kotlin/team/semicolon/figment/game/content/listener/PlayerListener.kt"
```
~~~

↓ 렌더링 결과 (직접 작성)

```kotlin title="PlayerListener.kt"
@Listener
class PlayerListener {
    @Subscribe
    fun onMove(event: PlayerMoveEvent) {
        event.player.sendMessage("움직였음!")
    }
}
```

↓ 렌더링 결과 (파일에서 가져오기)

```kotlin file="../game/content/src/main/kotlin/team/semicolon/figment/game/content/listener/PlayerListener.kt"
```

## 다이어그램

박스와 화살표로 이루어진 다이어그램은 mermaid 와 비슷한 `A -> B` 문법의 fenced `diagram` 블록으로 작성한다. 레이어는 의존 관계에서 자동 계산됨.

```diagram
common -> framework
framework -> bootstrap
common -> nms
nms -> bootstrap
```

↓ 렌더링 결과는 위 코드 그대로 박스+화살표 다이어그램으로 표시된다.

## 정리

| 문법 | 설명 |
|:-----|:-----|
| `# / ## / - / 1.` | 제목, 목록 — 표준 마크다운 |
| `:--- / :---: / ---:` | 표 좌/가운데/우 정렬 |
| `> ...` | 일반 인용문 |
| `:::note ... :::` | 강조 콜아웃 5종 (note/tip/warning/danger/performance) |
| `## 제목 {.chip이름}` | 헤딩 옆 상태 배지 (`render.js` `CHIP_VARIANTS`) |
| `` ```kotlin title="X.kt" `` | 코드 직접 작성 + 파일명 표시 |
| `` ```kotlin file="path" `` | 저장소 실제 파일에서 코드 가져오기 |
| `` ```diagram A -> B `` | 박스+화살표 아키텍처 다이어그램 |
