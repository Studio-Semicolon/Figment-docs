# Dialog 내부 동작

`@Dialog` 클래스가 화면에 뜨기까지 KSP·DI·런타임이 어떻게 맞물리는지 정리한다. 사용법은 [domain/dialog.md](../guide/domain/dialog.md) 를 본다. 이 문서는 도메인을 확장하거나 디버깅할 때 필요한 내부 지식이다.

## 모듈 분담

| 모듈 | 책임 |
|------|------|
| `dialog:api` | 어노테이션, `DialogScreen`, `InputKey`, `GeneratedDialogMeta` spec, `DialogScreenRuntime` 인터페이스, DSL |
| `dialog:processor` | `@Dialog` 클래스 분석·검증 + `${ClassName}GeneratedMeta` object 코드 생성(KSP) |
| `dialog:core` | 런타임 구현 — 메타 캐시, DialogSpec 빌드, Paper 렌더·이벤트, 핸들러 등록 |

핵심 설계: **소비자(`game:content`)는 `dialog:api` 만 의존**한다. 구현(`dialog:core`)은 service locator 를 통해 런타임에 연결된다.

## 컴파일 타임 (KSP)

두 프로세서가 같은 KSP 실행에서 나란히 돈다.

1. **framework:processor (`FigmentSymbolProcessor`)** — `@Dialog` 의 `@Scannable` 메타를 보고 클래스를 `beans.txt` 에 `BEAN` 으로 기록. → DI 가 인스턴스를 만들어 준다.
2. **dialog:processor (`KspDialogScreenProcessor`)**:
   - `DialogSymbolAnalyzer` 가 슬롯(`@Title`/`@Body`/`@ItemBody`/`@Button`/`@Buttons`/`@DialogAction`/`@ExitButton`)을 검사한다. 시그니처·타입·개수 위반은 **컴파일 에러**(KSPLogger)로 잡아 런타임까지 안 보낸다.
   - `DialogMetaCodeGenerator` 가 KotlinPoet 으로 `${ClassName}GeneratedMeta : GeneratedDialogMeta<...>` object 를 생성한다. (예: `RewardDialogSampleGeneratedMeta`)

생성된 메타 object 는 `dialogId`, 슬롯 정의, `INSTANCE` 필드(Kotlin object 표준)를 갖는다.

## 런타임 부팅

DI 부팅(`BeanRegistry.setup`) 중:

1. `DialogScreenRuntimeImpl`(`@Bean`)이 생성되며 `init` 에서 자신을 `DialogScreenRuntimeHolder.runtime` 에 주입한다. → `dialog:api` 의 `DialogScreen` 기본 구현이 이 holder 를 통해 동작 가능해진다.
2. `PaperDialogService`(`@Bean(binds=[DialogService::class])`)와 레지스트리들(`ActiveDialogRegistry`/`DialogActionRegistry`/`DialogLifecycleRegistry`)이 등록된다.
3. `@Dialog` 인스턴스마다 `DialogScreenAnnotationHandler.setup` 호출 → `DialogScreenProcessor.register` 가 `@Button`/`@DialogAction`/`@ExitButton` 슬롯 핸들러를 `DialogService` 에 등록한다.

> `DialogScreenAnnotationHandler` 는 `instance !is DialogScreen` 면 조용히 건너뛴다 — `@Dialog` 가 `DialogScreen` 아닌 클래스에 붙어도 `@Scannable` 만으로 수집되므로 런타임 가드가 필요하다.

## 메타 조회 — `DialogScreenCache`

`DialogScreen` 의 기본 구현은 `id`/`render` 를 `DialogScreenRuntimeHolder.runtime` 으로 위임하고, 런타임은 `DialogScreenCache` 에서 메타를 꺼낸다.

- 캐시는 `WeakHashMap` 3개(메타, name→`DialogInputKey` 맵, `IdentityKeyMap`) — 다이얼로그 인스턴스가 사라지면 함께 정리된다.
- 메타는 `${ClassName}GeneratedMeta` 의 `INSTANCE` 필드를 `Class.forName` + reflection 으로 **한 번만** 읽어 캐싱. 이후 호출은 reflection 비용 없음.
- 메타 클래스를 못 찾으면 `IllegalStateException` — KSP 미실행 또는 `figment.module` 미적용 모듈을 의심.

## 렌더 흐름

`dialogs.show(player, dialog)` →
1. `DialogScreen.render(ctx)` → `runtime.render` → `DialogScreenProcessor.buildDialog(메타, inputKeyMap, ctx)` 가 DSL 로 `DialogSpec` 빌드.
2. 본문의 `DialogTextSegment.AutoAction` 은 메타의 `@DialogAction` 슬롯 정의 identity 매칭으로 실제 `Action` 세그먼트로 치환.
3. `PaperDialogService.show` → `PaperDialogRenderer` 로 렌더. 이전 다이얼로그가 있으면 `REPLACED` close 이벤트 발행.

## 이벤트 흐름

`PaperDialogEventListener`(`@Listener`)가 Paper 이벤트를 도메인 이벤트로 변환한다.

- `PlayerCustomClickEvent` → namespace 검사 → `DialogActionRegistry.resolve(actionId)` → `DialogActionEvent` 디스패치. `afterDispatch == CLOSE` 또는 `@Dialog.afterAction == CLOSE` 면 닫는다.
- `PlayerQuitEvent` → 활성 다이얼로그 정리 + `DialogCloseReason.DISCONNECT`.
- 페이로드 파싱 실패는 `DialogEventErrorHandler` 로 위임(기본 `DefaultDialogEventErrorHandler`, `binds` 로 교체 가능).

namespace 비교에는 `nms:api` 의 `SnbtPayloadCodec` 가 payload SNBT 디코딩에 쓰인다.

## 종료

`PaperDialogService` 는 `ManagedLifecycle` 을 구현한다. `BeanRegistry.teardown` 마지막에 `shutdown()` 한 번 호출 → 활성 다이얼로그 전부 닫고 액션/close 핸들러 레지스트리를 비운다. 멱등. 인스턴스별 unbind 가 아니라 서비스 차원 일괄 정리라 `DialogScreenAnnotationHandler` 는 `teardown` 을 구현하지 않는다.

## 새 슬롯 어노테이션 추가

1. `dialog:api/annotation/DialogAnnotations.kt` 에 어노테이션 정의.
2. `DialogSymbolAnalyzer` 에 슬롯 검사 추가(시그니처·타입·개수 규칙).
3. `DialogMetaCodeGenerator` 에 메타 생성 코드 추가.
4. 필요 시 `DialogScreenProcessor`(core) 의 register/build 에 처리 추가.
5. [domain/dialog.md](../guide/domain/dialog.md) 슬롯 표 + [annotations.md](../reference/annotations.md) 갱신.

## 관련 문서

- [domain/dialog.md](../guide/domain/dialog.md) — 사용자 가이드
- [di.md](../guide/di.md) — `@Bean`·`@AnnotationHandler`·`ManagedLifecycle`
- [module-architecture.md](../overview/module-architecture.md) — api/core 분리와 service locator 위임
