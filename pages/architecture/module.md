## 왜 멀티 모듈인가

3명 이상이 함께 만들기 때문에 각자 담당 영역이 **코드 구조에서 보여야** 하고 경계가 일관돼야 한다. 핵심 원칙:

- **api / core 분리** — 도메인은 api(인터페이스·데이터·어노테이션 등)와 core(구현)로 나뉜다. 다른 모듈은 api 에만 의존한다.
- **의존은 한 방향으로만** — 도메인 구현(core)끼리 직접 참조하지 않는다. 순환이 생기면 컴파일 단계에서 막힌다.
- **bootstrap 은 조립자** — 진입점이자 여러 core 를 엮는 곳. 도메인 로직을 가지지 않는다.
- **framework / common 은 도메인을 모른다** — 게임 도메인을 위로 의존하지 않는 순수 인프라.
- **nms 는 primitive만** — 패킷 전송·가로채기 같은 최소 원시 능력만 노출한다. 도메인 로직은 소비 core 가 소유한다.

## 의존 방향 규칙

```diagram
common -> framework:api
common -> nms:api
nms:api -> nms:core
nms:api -> nms:v1_21_11
framework:api -> domain:api
framework:api -> domain:core
nms:api -> domain:core
common -> domain:core
domain:api -> domain:core
domain:api -> game:api
game:api -> game:content
game:api -> game:core
game:content -> game:core
game:core -> bootstrap
```

- **game:content 는 도메인 api 만 안다.** 도메인 core 같은 구현체를 직접 참조하지 않는다.
- **game:api 는 game 계층의 연결 계약.** 계약/배선 코드는 game:api·game:core 로 밀려나므로 game:content 에 남는 건 도메인 정의뿐이다.
- **bootstrap 은 game:core 만 직접 의존**하고 나머지는 transitive.
- **framework/common 은 도메인을 위로 의존하지 않는다.** 인프라가 특정 게임 도메인을 알면 재사용성이 깨진다.

## 좌표 충돌 회피

여러 모듈이 같은 leaf 이름을 쓴다. 좌표 충돌을 막기 위해 루트 build.gradle.kts 의 subprojects 블록이 group 을 `team.semicolon.${parent.name}` 으로 분리한다.

> 이 분리를 깨면 `:framework:api` 와 `:nms:api`, `:<domain>:api` 좌표가 충돌해 Gradle 의존 해소가 실패한다.

## 순환 의존 끊기

- **읽기 전용 view** — 상대가 알아야 할 최소 정보만 api 에 인터페이스로 노출.
- **game:content 에서 연결** — A 가 B 를 직접 참조하는 대신, game:content 가 양쪽 api 를 구현해 잇는다.
- **이벤트 / 콜백** — A 가 B 의 상태를 바꿔야 하면 이벤트 버스나 콜백 인터페이스를 중간에 둔다.

## 새 도메인 모듈 추가

1. `<domain>/api` + `<domain>/core` 로 나눈다. 다른 모듈은 api 에만 의존.
2. `build.gradle.kts` 상단에 `id("figment.module")` 한 줄.
3. 의존 방향 규칙을 지킨다 — core 끼리 직접 참조 금지.
4. 짝으로 문서를 추가한다: `docs/guide/domain/<name>.md` + `docs/internal/<name>-internals.md`.

## 모듈 vs 패키지 판단

**모듈로 나눌 때**: 다른 기능이 독립적으로 의존, 구현 교체 가능성 큼, NMS/Paper 같은 무거운 의존 격리, 순환을 끊는 API 경계 필요.

**패키지로 충분할 때**: 같은 도메인의 하위 개념, 항상 함께 변경, 별도 배포·교체 가능성 낮음.
