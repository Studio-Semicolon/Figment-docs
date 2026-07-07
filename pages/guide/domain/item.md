아이템을 클래스 하나로 선언한다. `@Item` + `ItemBlueprint` 구현에 옵션을 쓰면 자동 등록되고, `ItemService.render(id, viewer)` 로 언제든 실제 `ItemStack` 을 만든다. **같은 아이템도 플레이어마다 다르게** 보일 수 있고(서버 사이드 렌더링), 밸런스 업데이트 시 아이템이 자동 갱신된다.

## 개요

- `@Item(id = ...)` 클래스는 `@Bean` 없이 자동 등록된다(`@Scannable` 메타).
- `build(ctx)` 는 `ItemSpec` 에 옵션을 쓰는 순수 함수다. **빌드 전체가 `ctx.viewer` 의 함수**라 lore·이름·모델 무엇이든 플레이어에 따라 분기할 수 있다.
- 지급/표시는 `ItemService.render` 가 담당한다. 도메인 모듈은 `item:api` 만 의존한다.
- id 는 안정 식별자다. **한 번 배포되면 바꾸지 않는다**(바꾸면 지급된 아이템이 미아가 된다).

## 예제

```kotlin title="TestSwordSample.kt"
@Item(id = "test_sword")
class TestSwordSample : ItemBlueprint {
    override val version: Int = 1

    override fun ItemSpec.build(ctx: ItemRenderContext) {
        material(Material.NETHERITE_SWORD)
        itemName(Component.text("테스트 검", NamedTextColor.RED))
        lore(
            // Server Side Render — viewer 마다 다른 소유자 이름이 표시된다.
            Component.text("소유자: ${ctx.viewer.name}", NamedTextColor.GRAY),
            Component.text("화염 면역 · 강타", NamedTextColor.DARK_GRAY),
        )
        attribute(Attribute.ATTACK_DAMAGE, 8.0, AttributeModifier.Operation.ADD_NUMBER, EquipmentSlotGroup.MAINHAND)
        enchant(Enchantment.FIRE_ASPECT, 2)
        weapon(itemDamagePerAttack = 1)
        fireProof()
        unbreakable()
    }
}
```

지급은 `ItemService.render` 를 사용한다. `id` 는 `ItemService.ids()` 기반 자동완성(`@Suggests`)을 붙여
등록된 어떤 정의든 하나의 커맨드로 지급하는 범용 형태다.

```kotlin title="ItemGiveCommand.kt"
@Command(label = "item-test")
class ItemGiveCommand(private val itemService: ItemService) {
    @Child("")
    fun give(
        @Sender player: Player,
        @Arg("id", suggests = "itemIds") id: String,
    ) {
        val stack = itemService.render(ItemId(id), player) ?: return
        player.inventory.addItem(stack)
    }

    @Suggests("itemIds")
    fun suggestItems(builder: SuggestionsBuilder) {
        val input = builder.remaining.lowercase()
        itemService.ids()
            .map { it.value }
            .filter { it.lowercase().startsWith(input) }
            .sorted()
            .forEach { builder.suggest(it) }
    }
}
```

## 자주 쓰는 옵션

:::tip
**공유 스택 SSR** 항목에 대해 — **같은 물리 스택**을 A/B 가 볼 때도 이 옵션이 viewer 별로 갈리는지 여부다. "빌드타임"인 옵션은 `render(id, player)` 로 **그 플레이어 전용 스택을 새로 만들어 줄 때만** viewer 별로 갈리고, 이미 지급된 물리 스택을 다른 플레이어가 보면 지급받은 플레이어 기준 값 그대로 보인다 — 게임플레이 계산도 항상 지급 시점 기준이라 화면과 서버가 어긋나지 않는다. 이유는 아래 **서버사이드 렌더** 참고.
:::

| 옵션 | 설명 | 공유 스택 SSR |
|:-----|:-----|:-----|
| `material(Material)` | 베이스 타입. **반드시 가장 먼저** 호출한다. | 빌드타임 |
| `itemName(Component)` | 기본 이름. 모루 이름(`CUSTOM_NAME`)과 구분된다. | 가능 |
| `lore(vararg: Component)` / `lore(List<Component>)` | 아이템 설명. `Component` 객체 리스트를 받는다. | 가능 |
| `attribute(attr, amount, operation, slot)` | 속성 수정자. 같은 Attribute 로 여러 번 호출해도 각각 별개 수정자로 쌓인다. | **빌드타임** — 게임플레이 값이라 canonical 고정 |
| `enchant(enchantment, level)` | 인챈트, 여러 번 호출로 쌓을 수 있음. | 빌드타임 |
| `color(Color)` / `color(r, g, b)` / `color(rgb)` | 염색. 가죽·포션 등 염색 가능한 아이템에만 유효. | 가능 |
| `unbreakable(value = true)` | 파괴 불가 | 빌드타임 |
| `maxStackSize(size)` | 최대 스택 크기(유효 범위 1..99) | 빌드타임 |
| `itemModel(key)` | 아이템 모델 키(1.21.4+ 문자열 모델) | 가능 |
| `hideTooltip(value = true)` | 툴팁 숨김 | 가능 |
| `fireProof(value = true)` | 화염 면역 | 빌드타임 |
| `legacyModelData(data)` | 레거시 커스텀 모델 데이터(정수) | 가능 |
| `durability(maxDamage)` | 최대 내구도 | **빌드타임** — 게임플레이 값이라 canonical 고정 |
| `consumable(animation, particles = true)` | 섭취 가능 여부, `animation` 에 맞는 기본 섭취 사운드도 같이 설정된다. | 빌드타임 |
| `weapon(itemDamagePerAttack = 1, disableBlockingForSeconds = 0f)` | 무기, `disableBlockingForSeconds` = 방어 무력화 시간(도끼 기본 5f). | **빌드타임** — 게임플레이 값이라 canonical 고정 |
| `blockAttack(blockDelaySeconds = 0f, disableCooldownScale = 1f)` | 공격 방어(방패류), 감쇠·사운드는 바닐라 방패 기본값. | 빌드타임 |
| `tooltipStyle(key)` | 툴팁 스타일 | 가능 |

## 서버사이드 렌더 (SSR) {.experimental}

"viewer 로 빌드한다" = `build(ctx)` 가 **플레이어를 받아 그 플레이어를 기준으로 이름·lore·수치 등을 결정**한다는 뜻이다. 같은 `id` 라도 `render(id, A)` 와 `render(id, B)` 는 다른 스택으로 표시될 수 있다.

경로는 **트리거 시점**에 따라 둘로 갈리고, 각 경로가 커버하는 범위가 다르다:

- **빌드타임 SSR (패킷 없음)** — 서버가 스택을 만들 때 viewer 로 빌드. GUI·보상·키트·상점처럼 **한 명만 보는** 스택에 쓴다. 위 `render(id, player)` 가 이것. 빌드 전체가 viewer 함수이므로 attribute·durability 등 **게임플레이 값까지 포함해 옵션 전체**가 그 사람 기준으로 갈린다. 이미 빌드 시점에 누구에게 줄지 알고 있으니 패킷까지 갈 필요 없음.
- **공유 스택 SSR (패킷)** — 같은 물리 스택이 A/B 에게 다르게 보여야 하는 경우(떨군 아이템·아이템 디스플레이·남의 손·공용 상자). 아이템이 클라이언트에 나타나는 진입점 4개 — 컨테이너 2종(`ContainerSetSlot`/`ContainerSetContent`, 자기 인벤·공용 상자), 아이템 하나를 보유한 엔티티(`SetEntityData`, 드롭 아이템 + 아이템 디스플레이), 장비(`SetEquipment`, 남의 손 포함) — 를 가로채 받는 플레이어 기준으로 재렌더한다. 단 이 경로는 **시각적 오버레이**다 — viewer 로 다시 구운 스택에서 이름·lore·모델·색 등 컴포넌트만 뽑아 원본 위에 덮고, `attribute`/`durability`/`enchant` 같은 게임플레이·상태 값은 서버가 실제로 들고 있는 스택 그대로 둔다. 서버 계산이 canonical 스택 하나로만 이뤄지기 때문에, 화면에서만 게임플레이 값을 바꾸면 화면과 실제 계산이 어긋나는 거짓이 되기 때문이다.

**두 경로로 나눈 이유** — 공유 스택 SSR 하나로 통일해도 동작은 하지만, 서버가 내보내는 모든 컨테이너 패킷을 netty 스레드에서 매번 재빌드하게 된다. GUI/보상처럼 한 명만 보는 다수 케이스에 그 비용을 물릴 이유가 없어서, "물리 스택을 여러 명이 봄"이 실제로 성립하는 경우만 공유 스택 SSR 을 태운다.

**조건부로 실시간 게임플레이 효과를 주고 싶다면**(예: "레벨 10 이상만 공격력 보너스") 아이템 정의만으로는 안 된다 — 빌드타임 baking 은 지급 순간에 고정되고 소유권이 바뀌어도 재평가되지 않는다. 조건 충족 여부에 따라 실시간으로 켜고 끄려면 별도 게임플레이 시스템(held-item 리스너·player attribute modifier)이 필요하다.

## 아이템 업데이트 {.experimental}

플러그인 jar 로 배포되는 컨텐츠라 스펙이 업데이트 될 시 물리적으로 이미 지급된 아이템을 갱신해야 한다.

- 스펙을 바꾸면 `version` 을 **손수 업데이트한다**.
- **Stateless**(대부분): `migrators` 를 비워 둔다. 접속 시 통째로 재렌더된다. 수량과 **내구도(damage)는 자동
  보존**되므로, 내구도만 지키면 되는 무기·도구도 그냥 stateless 로 둬도 된다(재렌더로 내구도가 풀회복되지 않음).
- **Stateful**(내구도 **외** 인스턴스 상태 — 추가 인챈트·커스텀 데이터 보존, 또는 내구도를 값 그대로가 아니라
  가공해 옮겨야 할 때): `migrators = mapOf(2 to ItemMigrator { old, ctx -> ... })` 로 버전별 변환을 준다.
- 갱신 시점: 현재 **PlayerJoin**(인벤 훑기). "온라인 중 인벤 열 때"는 향후 추가 예정.

## 흔한 함정 (gotchas)

:::danger
- **`build(ctx)` 는 netty 스레드에서 불릴 수 있다**(공유 스택 SSR). `ctx.viewer` 는 **plain 필드만 읽어라** —
  `level`/`name`/`uniqueId`/`locale` 등은 OK, `getNearbyEntities()`·`world.getBlockAt()`·인벤 변형 등
  world/entity 조회는 **금지**(off-main 크래시·데드락). 조건부 게임플레이 효과는 아이템이 아니라 별도 시스템.
- `unbreakable()` 과 `durability()` 를 같이 쓰지 않는다(파괴 불가가 내구도를 무시).
- `render` 는 수량 1을 반환한다. 여러 개 지급하려면 반환 스택의 `amount` 를 조정한다(마이그레이션은 자동 보존).
- `id` 는 배포 후 불변. 바꾸면 기존 아이템을 못 찾는다.
- `color` 는 염색 가능한 아이템(가죽·포션)에만. 아니면 fail-fast.
:::

## 관련 문서

- [DI](nav:guide/di)
- [커맨드](nav:guide/command)
