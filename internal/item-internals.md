# item 도메인 내부 동작 (설계)

플러그인 jar 와 함께 배포되는 커스텀 아이템의 정의·서버사이드 렌더링(SSR)·밸런스 업데이트 마이그레이션
설계 문서다. **아직 미구현** — 만들기 전 합의된 아키텍처와 정책이다.

> 사용자 가이드(`docs/guide/domain/item.md`)는 아직 없다. CLAUDE.md 규칙상 가이드 예제는 실재 코드
> (`game:content`/`bootstrap/sample`)를 1차 소스로 써야 하므로, item 구현과 샘플이 생긴 뒤 짝으로 추가한다.

## 모듈 분담

| 모듈 | 책임 |
|------|------|
| `item:api` | `ItemId`, `ItemBlueprint`, `ItemSpec` DSL, `ItemRenderContext`, `@Item`, `ItemMigrator`, `ItemRuntimeHolder` |
| `item:core` | `PaperItemService`(render-time 빌드 + PDC 스탬프), `ItemRegistry`, 업데이트 리스너, 어노테이션 핸들러 + `ManagedLifecycle` |
| `game:content` | `@Item` + `ItemBlueprint` 실제 아이템 정의 (`item:api` 만 의존) |

의존 방향: `game:content ← item:api`, `item:core ← item:api, nms:api, framework:core, common` (dialog 와 동형).
`settings.gradle.kts` 에 `:item:api`, `:item:core` 추가. build 은 dialog:core 를 그대로 본뜬다(`id("figment.module")`).

**스킵(YAGNI):** `item:processor`. dialog 처럼 컴파일타임 슬롯 검증이 필요해질 때 추가. 초기 아이템은 순수
코드라 런타임 fail-fast 로 족하다.

## 아이템 정의 = viewer 함수 (SSR 의 뿌리)

정의는 dialog 의 `DialogScreen.render(ctx)` 와 동형이다. **특정 필드만이 아니라 빌드 전체가 viewer 함수**다
— lore 뿐 아니라 name·model·색·수치 무엇이든 보는 사람에 따라 달라질 수 있다(craft-engine 확인:
`ItemName`/`CustomName`/`Lore`/`CustomModelData`/`DyedColor`/`Enchantments`/`ItemModel`/`Food`/`MaxDamage`
등 전 필드가 build context 소비).

```kotlin
@Item(id = "figment:test_sword")
class TestSwordSample : ItemBlueprint {
    override val version = 3                       // 스펙 바꾸면 손으로 올림(§업데이트)
    override fun ItemSpec.build(ctx: ItemRenderContext) {
        material(Material.NETHERITE_SWORD)
        itemName(nameFor(ctx.viewer))              // ← viewer 마다 다른 이름/lore = SSR
        lore(loreFor(ctx.viewer, ctx.locale))
        attribute(ATTACK_DAMAGE, 8.0, ADD_NUMBER, MAINHAND)
        weapon(itemDamagePerAttack = 1)
        damageResistant(fire = true)
        unbreakable()
    }
}
```

`ItemRenderContext { viewer; locale; now; attribute(key) }` — `DialogRenderContext` 를 그대로 복제한다.

## SSR 2단계

같은 정의라도 **어디서 보이느냐**로 두 경로가 갈린다. 라더대로 싼 것부터.

### 빌드타임 SSR (패킷 없음)

서버가 아이템을 *만들어 줄 때* viewer 로 빌드한다. 플레이어마다 **물리 스택이 다르다**. 커버: GUI 메뉴,
보상, 키트, 상점 표시, 서버가 직접 쥐여주는 아이템. `PaperItemService.render(def, viewer)` 가 매번 빌드.
zero 패킷.

이 경로가 성립하는 이유는 빌드 시점에 이미 "누구에게 줄지"가 정해져 있어서다 — GUI 여는 사람, 보상 받는
사람, `/give` 대상. 그 자리서 바로 viewer 로 빌드하면 끝, 패킷까지 갈 이유가 없다. 또한 이 스택은
**그 사람만 본다**(각자 자기 GUI/인벤) — 재작성이 필요한 경우 자체가 아니다.

### 공유 스택 SSR (패킷)

*같은 물리 스택*이 옆에서 보는 A/B 에게 다르게 보인다 — 떨군 아이템, 남의 손, 공용 상자. 빌드타임 SSR로
A용으로 구운 스택은 lore가 A 기준으로 물리적으로 박혀 있으므로, B가 그 스택을 주워도 그대로 A 버전이 보인다
— `PlayerPickupItemEvent` 같은 특정 이벤트를 못 쓰는 이유는, 아이템이 B 화면에 나타나는 경로가 줍기·상자
열기·트레이드 등 무엇이든 **결국 컨테이너 패킷 하나로 수렴**하기 때문이다. 그래서 이벤트별 훅 대신 그
공통 병목(패킷)에서 한 번에 잡는다.

canonical 스택엔 `figment:item`(id) + `figment:v`(version) PDC 만 심고, clientbound 패킷을 받는
플레이어마다 재작성한다. 이 PDC 는 클라 입장에서 **의미 없는 raw 데이터**다 — 게임 내 어디에도 표시되지
않고, 클라가 이 값을 읽어 뭘 하지도 않는다. 서버가 나중에 "이 스택이 무슨 정의였는지" 되찾기 위해 자기
자신에게 남긴 메모일 뿐이다. 클라가 실제로 보는 이름·lore·속성 등은 매번 통째로 다시 구워져 패킷에 실려
오는 값이다(증분 diff 없음, 전체 교체).

```kotlin
// item:core 가 nms:api PacketBus 에 구독. 인터셉터 로직은 도메인(item:core)에 산다.
PacketBus.subscribe<ContainerSetSlotPacket> { pkt ->
    val def = registry.byPdc(pkt.item) ?: return@subscribe
    pkt.item = service.render(def, pkt.player)     // per-receiver 재빌드
}
```

패킷 파이프라인 자체는 [packet-pipeline-internals.md](packet-pipeline-internals.md) 참조. craft-engine
`CommonItemPacketHandler` 의 축소판이다.

**두 경로로 나눈 이유(라더 — 싼 것부터):** 공유 스택 SSR 하나로 통일해도 동작은 하지만, 서버가 나가는
**모든** 컨테이너 패킷을 netty 스레드에서 매번 가로채 재빌드하는 셈이다. GUI/보상/키트처럼 애초에 한 명만
보는 압도적 다수 케이스까지 그 경로를 태우면 이미 만든 걸 패킷 계층에서 또 재빌드하는 이중 작업 +
불필요한 netty 오버헤드가 붙는다. "물리 스택 하나를 여러 명이 봄"이 성립하는 경우(드롭·공용 상자 등)만
공유 스택 SSR 이 필요 — 나머지는 빌드타임에 한 번으로 끝낸다.

## 옵션 → DataComponent 매핑

Paper 1.21.11 기준 **전 옵션이 Paper `ItemStack.setData(DataComponentTypes.X, …)` 로 커버**된다. NMS 0.
`ItemSpec` DSL 은 이 위의 얇은 ergonomic 레이어다.

| DSL | DataComponent | 비고 |
|-----|---------------|------|
| `material` / `itemName` / `lore` | ItemStack / `ITEM_NAME` / `LORE` | `itemName`=기본명(SSR 대상). 모루 개명은 `CUSTOM_NAME` |
| `pdc` | PersistentDataContainer | id/version 스탬프도 여기 |
| `attribute(…, display)` | `ATTRIBUTE_MODIFIERS` 엔트리 display | display 슬롯은 **1.21.6+** |
| `color` (가죽/포션) | `DYED_COLOR` / `POTION_CONTENTS` | rgb int3 / hex 오버로드 |
| `unbreakable` | `UNBREAKABLE` | |
| `itemFlags` | `TOOLTIP_DISPLAY` | **1.21.5** 부터 구 ItemFlag → 이 컴포넌트 |
| `maxStackSize` | `MAX_STACK_SIZE` | `require(1..99)` |
| `fireProof` | `DAMAGE_RESISTANT`(is_fire) | 구 meta 폐기 |
| `durability` | `MAX_DAMAGE` | **NMS 어댑터** 경유(아래) |
| `consumable` | `CONSUMABLE` | **NMS 어댑터** 경유. animation 별 기본 사운드 설정 |
| `hideTooltip` | `TOOLTIP_DISPLAY.hideTooltip` | itemFlags 와 같은 컴포넌트 |
| `itemModel` | `ITEM_MODEL` | 문자열 모델(1.21.4) |
| `legacyModelData` | `CUSTOM_MODEL_DATA` | 정수 경로(`setCustomModelData(int)`) |
| `enchant` | `ENCHANTMENTS` | |
| `weapon`/`blockAttack`/`consumable` | `WEAPON`/`BLOCKS_ATTACKS`/`CONSUMABLE` | **NMS 어댑터**. blockAttack 감쇠·사운드는 바닐라 방패 기본값 |
| `tooltipStyle` | `TOOLTIP_STYLE` | **NMS 어댑터** |

**NMS 어댑터(실험적 컴포넌트 경로):** Paper 의 DataComponent API 는 `@UnstableApiUsage` 라 버전 간 시그니처가
흔들린다. 단일 버전 타겟 + paperweight(mojang 이름) 환경에선 **NMS `DataComponents` 경로가 더 안정적**이다
(`.snippet` 의 Module 프로젝트 방식). `nms:api` 의 `ItemComponentAdapter`(impl `nms:v1_21_11`,
`asNMSCopy` → set → `asBukkitCopy` 복원)가 이를 담당하고, `durability`/`consumable` 이 여기로 간다.

현재 어댑터 커버: `durability`(`MAX_DAMAGE`), `consumable`(`CONSUMABLE`), `weapon`(`WEAPON`),
`blockAttack`(`BLOCKS_ATTACKS`), `tooltipStyle`(`TOOLTIP_STYLE`).

Module 과 차이: Module 은 `ItemUseAnimation`(NMS)을 콜러에 노출하지만, 우리는 `ConsumeAnimation`(nms:api 자체
enum)만 노출해 **도메인이 NMS·Paper-unstable 어느 쪽도 보지 않는다**. 안정 `ItemMeta` 로 충분한 옵션
(name/lore/attribute/color/enchant/unbreakable 등)은 어댑터를 거치지 않는다.

**제네릭 passthrough 는 두지 않는다.** 불안정 Paper API 를 도메인에 노출하게 되므로 의도적으로 뺐다. 타입드
메서드가 없는 컴포넌트가 필요하면 `ItemComponentAdapter` 에 메서드를 추가한다(NMS record 시그니처는 paperweight
소스 `output.jar` 에서 확인 — 예: `Weapon(int, float)`, `BlocksAttacks(float, float, List<DamageReduction>, …)`).

**직접 컴포넌트 없음:** `canBreakFromCactus` — 바닐라 per-item 토글 부재. 필요 시 엔티티 리스너. 스킵.

**어댑터 추가 후보(사용 빈도 보고):** `RARITY`, `ENCHANTMENT_GLINT_OVERRIDE`, `EQUIPPABLE`(1.21.2),
`REPAIR_COST`, `USE_COOLDOWN`, `USE_REMAINDER`, `JUKEBOX_PLAYABLE`, `GLIDER`(1.21.2), `DEATH_PROTECTION`,
`profile`(헤드).

## 업데이트 / 마이그레이션 정책

jar 배포 컨텐츠라 밸런스 업데이트로 스펙이 바뀌면 **이미 월드에 뿌려진 아이템**을 갱신해야 한다.
craft-engine 모델(`version` int + on-access 마이그레이션)을 축소해 쓴다.

**식별:** PDC `figment:item`(id) + `figment:v`(int). 정의엔 `version` int. `stored < def.version` → 갱신 대상.

**2-tier — 대부분 공짜:**

- **Stateless (99%)** — 인스턴스 상태 없음 → **통째로 재렌더**. 마이그레이션 = 옛 스택 버리고 def 로 새로 빌드.
  코드 0. 데미지 8→10 바꾸고 `version++` 만.
- **Stateful** — 플레이어가 건드린 내구도·추가 인챈트·커스텀 데이터 보존 필요 → 해당 정의에만 `ItemMigrator`
  등록, 버전별 순차 적용(craft-engine `ItemUpdater` 형). 필요할 때만.

```kotlin
override val version = 3
override val migrators = mapOf(          // stateful 일 때만
    2 to ItemMigrator { old, ctx -> /* v1→v2: 내구도 보존 재빌드 */ },
    3 to ItemMigrator { old, ctx -> /* v2→v3 */ },
)
```

**실행 시점 = on-access(스캔 없음):** 두 트리거로 간다.
- **PlayerJoin** — 접속 시 플레이어 인벤을 훑어 stale 아이템 갱신. `ItemMigrationListener`(item:core) 구현됨.
  stateless=재렌더(수량 보존), stateful=migrators 순차.
- **인벤토리 열기 감지 trick** — 자기 인벤 열 때 갱신. 패킷 trick(레시피북) 기반이라 [packet-pipeline-internals.md](packet-pipeline-internals.md) 참조. (**TODO** — trick 미구현)

월드 전체 스캔은 안 한다.
`// ponytail: on-access. 안 만진 아이템(언로드 청크·엔더상자 방치)은 stale 로 남음. 천장 = 주기적 sweep, 실측으로 필요해지면 추가`

**버전 감지 = 수동 int.** 정의 해시 자동화는 리팩터에도 바뀌는 버그팜. 개발자가 명시적으로 올린다.

## 함정

- **공유 스택 SSR 스레드/teardown** — 패킷 경로는 netty 스레드. 월드 상태·이벤트는 메인 hop. 핸들러 teardown 필수.
  전부 [packet-pipeline-internals.md](packet-pipeline-internals.md) 함정 절을 따른다.
- **재렌더 무한 루프** — SSR 이 재작성한 아이템을 다시 SSR 대상으로 잡지 않도록, 재작성 후 스택은 이미 최종형.
  canonical PDC 는 유지하되 재렌더 결과를 다시 patch 하지 않는다.
- **stateful 오분류** — stateless 로 보고 통째 재렌더했는데 실은 플레이어 상태가 있었으면 데이터 유실.
  상태 있는 아이템은 반드시 `ItemMigrator` 로 표기.

## 다음 (미결)

1. `item:api` 스켈레톤 — `ItemId`, `ItemBlueprint`, `ItemSpec`, `ItemRenderContext`, `@Item`, `ItemMigrator`, `ItemRuntimeHolder`
2. `item:core` — `PaperItemService`, `ItemRegistry`, 업데이트 리스너, 어노테이션 핸들러
3. `game:content` stateless 샘플 1 → 그 뒤 `docs/guide/domain/item.md` 작성(실재 샘플 기반)
