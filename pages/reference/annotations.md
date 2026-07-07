## 프레임워크 — DI

| 어노테이션 | 대상 | 용도 |
|:---|:---:|:---|
| `@Bean` | 클래스 | singleton Bean으로 등록. binds = [...] 로 인터페이스 타입 노출 |
| `@Scannable` | 어노테이션 | 메타 어노테이션. 이 어노테이션을 가진 클래스를 @Bean 없이 자동 수집 |
| `@AnnotationHandler` | 클래스 | 특정 `@Scannable` 어노테이션의 라이프사이클 핸들러 표시 |
| `@PluginDepend` | 클래스 | 열거된 외부 의존 플러그인이 모두 로드됐을 때만 등록(AND 조건) |

## 프레임워크 — 리스너

| 어노테이션 | 대상 | 용도 |
|:---|:---:|:---|
| `@Listener` | 클래스 | Bukkit 이벤트 리스너 마커(`@Scannable`). 자동 등록/해제 |
| `@Subscribe` | 메서드 | 이벤트 핸들러 메서드. order / ignoreCancelled 옵션 |

## 프레임워크 — 커맨드

| 어노테이션 | 대상 | 용도 |
|:---|:---:|:---|
| `@Command` | 클래스 | 커맨드 마커(`@Scannable`). label/aliases/parent/description 속성 |
| `@Child` | 메서드 | 서브커맨드 경로. `@Child("")` 는 루트 |
| `@Sender` | 파라미터 | 실행자(CommandSender) 구체 타입 제한 |
| `@Arg` | 파라미터 | 필수 인자. suggests 로 자동완성 키 연결 |
| `@OptionalArg` | 파라미터 | 선택 인자(미입력 시 null) |
| `@Suggests` | 메서드 | 자동완성 제공자. `@Arg(suggests=)` 키와 매칭 |
| `@StringType` | 파라미터 | String 인자 파싱 방식(WORD / STRING / GREEDY) |
| `@IntRange` | 파라미터 | 정수 인자 범위 검증(kotlin.ranges.IntRange 아님). |
| `@LongRange` | 파라미터 | Long 인자 범위 검증 |
| `@FloatRange` | 파라미터 | Float 인자 범위 검증 |
| `@DoubleRange` | 파라미터 | Double 인자 범위 검증 |
| `@CenterIntegers` | 파라미터 | FinePosition 정수 좌표를 블록 중앙(+0.5)으로 보정(플래그) |

## 도메인 — Dialog

@Dialog 클래스 안에서 슬롯을 선언하는 어노테이션. 상세 사용법은 [도메인 가이드](nav:guide/domain/dialog) 참고.

| 어노테이션 | 대상 | 용도 |
|:---|:---:|:---|
| `@Dialog` | 클래스 | 다이얼로그 정의 마커(`@Scannable`). id / columns 등 메타 |
| `@Title` | 프로퍼티/함수 | 제목 슬롯. 클래스당 최대 1개 |
| `@ExternalTitle` | 프로퍼티/함수 | 외부 제목 슬롯. 규칙은 `@Title` 과 동일 |
| `@Body` | 프로퍼티/함수 | 텍스트 본문 슬롯. 여러 개 선언 순서대로 누적 |
| `@ItemBody` | 프로퍼티/함수 | 아이템 본문 슬롯. tooltip/장식 옵션 |
| `@DialogAction` | 프로퍼티 | 본문 인라인 액션 정의. KSP 가 stable id 생성·자동 등록 |
| `@Button` | 프로퍼티 | 단일 버튼 슬롯. 프로퍼티 이름으로 stable id |
| `@ExitButton` | 프로퍼티 | 종료 버튼 슬롯. 클래스당 최대 1개 |
| `@Buttons` | 함수 | 동적 버튼 목록 슬롯. 핸들러는 호출자가 직접 결정 |

## 도메인 — Item

ItemBlueprint 구현 클래스에 선언하는 마커 어노테이션.

| 어노테이션 | 대상 | 용도 |
|:---|:---:|:---|
| `@Item` | 클래스 | 커스텀 아이템 정의 마커(`@Scannable`). id(비어 있지 않은 임의 문자열) 속성. 옵션은 ItemSpec 메서드로 선언 |

## 메타 어노테이션 메모

`@Scannable` 이 선언된 어노테이션(`@Listener`, `@Command`, `@Dialog`)은 `@Bean` 없이도 KSP 가 자동 수집한다. 새 도메인 마커를 만들 때 `@Scannable` 을 메타로 선언하면 같은 메커니즘을 그대로 탄다 — 별도 수집 코드가 필요 없다. 원리는 [di.md](nav:guide/di) 참고.

## 관련 문서

- [di.md](nav:guide/di)
- [listener.md](nav:guide/listener)
- [command.md](nav:guide/command)
