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

지급은 `ItemService.render` 를 사용한다.

```kotlin title="ItemGiveCommand.kt"
@Command(label = "item-test")
class ItemGiveCommand(private val itemService: ItemService) {
    @Child("")
    fun give(@Sender player: Player) {
        val stack = itemService.render(ItemId("figment:test_sword"), player) ?: return
        player.inventory.addItem(stack)
    }
}
```

## 자주 쓰는 옵션

| 옵션 | 설명 |
|:-----|:-----|
| `material(Material)` | 베이스 타입. **반드시 가장 먼저** 호출한다. |
| `itemName(Component)` | 기본 이름. 모루 이름(`CUSTOM_NAME`)과 구분된다. |
| `lore(vararg: Component)` / `lore(List<Component>)` | 아이템 설명. `Component` 객체 리스트를 받는다. |
| `attribute(attr, amount, operation, slot)` | 속성 수정자. 같은 Attribute 로 여러 번 호출해도 각각 별개 수정자로 쌓인다. |
| `enchant(enchantment, level)` | 인챈트, 여러 번 호출로 쌓을 수 있음. |
| `color(Color)` / `color(r, g, b)` / `color(rgb)` | 염색. 가죽·포션 등 염색 가능한 아이템에만 유효. |
| `unbreakable(value = true)` | 파괴 불가 |
| `maxStackSize(size)` | 최대 스택 크기(유효 범위 1..99) |
| `itemModel(key)` | 아이템 모델 키(1.21.4+ 문자열 모델) |
| `hideTooltip(value = true)` | 툴팁 숨김 |
| `fireProof(value = true)` | 화염 면역 |
| `legacyModelData(data)` | 레거시 커스텀 모델 데이터(정수) |
| `durability(maxDamage)` | 최대 내구도 |
| `consumable(animation, particles = true)` | 섭취 가능 여부, `animation` 에 맞는 기본 섭취 사운드도 같이 설정된다. |
| `weapon(itemDamagePerAttack = 1, disableBlockingForSeconds = 0f)` | 무기, `disableBlockingForSeconds` = 방어 무력화 시간(도끼 기본 5f). |
| `blockAttack(blockDelaySeconds = 0f, disableCooldownScale = 1f)` | 공격 방어(방패류), 감쇠·사운드는 바닐라 방패 기본값. |
| `tooltipStyle(key)` | 툴팁 스타일 |

## 서버사이드 렌더 (SSR) {.experimental}

"viewer 로 빌드한다" = `build(ctx)` 가 **플레이어를 받아 그 플레이어를 기준으로 이름·lore·수치 등을 결정**한다는 뜻이다. 같은 `id` 라도 `render(id, A)` 와 `render(id, B)` 는 다른 스택으로 표시될 수 있다. 클라이언트는 이 계산 과정에 전혀 관여하지 않는다 — 매 패킷마다 통째로 구워진 결과(이름·lore·속성 등 전체 컴포넌트)만 받아 표시할 뿐이다.

경로는 **트리거 시점**에 따라 둘로 갈린다:

- **빌드타임 SSR (패킷 없음)** — 서버가 스택을 만들 때 viewer 로 빌드. GUI·보상·키트·상점처럼 **한 명만 보는** 스택에 쓴다. 위 `render(id, player)` 가 이것. 이미 빌드 시점에 누구에게 줄지 알고 있으니 패킷까지 갈 필요 없음.
- **공유 스택 SSR (패킷)** — 같은 물리 스택이 A/B 에게 다르게 보여야 하는 경우(떨군 아이템·남의 손·공용 상자). 빌드타임 SSR에서 A용으로 빌드된 스택은 B가 주워도 그대로 A 버전이 보인다 — 이 간극을 메우는 경로다. 아이템이 클라이언트에 나타나는 모든 경로가 결국 수렴하는 지점인 **clientbound 컨테이너 패킷**(`ContainerSetSlot`/`ContainerSetContent`)을 가로채 받는 플레이어 기준으로 재렌더한다.

**두 경로로 나눈 이유** — 공유 스택 SSR 하나로 통일해도 동작은 하지만, 서버가 내보내는 모든 컨테이너 패킷을 netty 스레드에서 매번 재빌드하게 된다. GUI/보상처럼 한 명만 보는 다수 케이스에 그 비용을 물릴 이유가 없어서, "물리 스택을 여러 명이 봄"이 실제로 성립하는 경우만 공유 스택 SSR 을 태운다.

## 아이템 업데이트 {.experimental}

플러그인 jar 로 배포되는 컨텐츠라 스펙이 업데이트 될 시 물리적으로 이미 지급된 아이템을 갱신해야 한다.

- 스펙을 바꾸면 `version` 을 **손수 업데이트한다**.
- **Stateless**(대부분): `migrators` 를 비워 둔다. 접속 시 통째로 재렌더된다.
- **Stateful**(내구도·추가 인챈트 등 인스턴스 상태 보존): `migrators = mapOf(2 to ItemMigrator { old, ctx -> ... })` 로 버전별 변환을 준다.
- 갱신 시점: 현재 **PlayerJoin**(인벤 훑기). "온라인 중 인벤 열 때"는 향후 추가 예정.

## 흔한 함정 (gotchas)

:::danger
- `unbreakable()` 과 `durability()` 를 같이 쓰지 않는다(파괴 불가가 내구도를 무시).
- `render` 는 수량 1을 반환한다. 여러 개 지급하려면 반환 스택의 `amount` 를 조정한다(마이그레이션은 자동 보존).
- `id` 는 배포 후 불변. 바꾸면 기존 아이템을 못 찾는다.
- `color` 는 염색 가능한 아이템(가죽·포션)에만. 아니면 fail-fast.
:::

## 관련 문서

- [DI](nav:guide/di)
- [커맨드](nav:guide/command)
