# 패킷 파이프라인 내부 동작

여러 도메인(item SSR, hud/minimap 가짜 엔티티, 향후 particle/biome)이 공유하는 clientbound/serverbound
패킷 가로채기 인프라 문서다. `.snippet/Paragon` 의 `nms/packet` 파이프라인을 참조하되, 아래 **얇은 nms 원칙**에
맞춰 축소·재배치했다.

**구현 상태**: outbound 경로(DTO·코덱·버스·lazy decode·`ProtectedPacket`)는 구현·사용 중(item SSR,
hud/minimap 탑승 보정). inbound 경로(`ContainerClosePacket`/`RecipeBookSeenRecipePacket` DTO만 정의,
코덱·`channelRead` 미구현)와 그걸 쓰는 인벤 열기 감지 trick, `OpenScreenPacket` 코덱, particle/biome DTO는
**아직 미구현** — 실제 소비자가 붙을 때 만든다(YAGNI).

패킷 도입 배경·대안 판단(왜 packetevents 를 안 쓰는가)은 이 문서 말미 [부록](#부록-packetevents-를-쓰지-않는-이유)에 있다.

## 왜 공유 인프라인가

단일 물리 아이템을 A/B 에게 다르게 보이려면(공유 스택 SSR) canonical 스택 하나론 불가 →
clientbound 패킷을 **받는 플레이어마다** 재작성해야 한다. 이 재작성 채널은 item 만의 것이 아니다:

| 소비자 | 패킷 용도 | 방향 |
|--------|-----------|------|
| `item` | `ContainerSetSlot`/`ContainerSetContent` 의 아이템을 viewer 로 재빌드 | outbound |
| `hud` / `minimap` | 가짜 엔티티 스폰·메타·`SetPassengers` 보정 | outbound (+ 필요 시 inbound) |
| 인벤 열기 감지 | recipe-book trick (아래) | inbound + outbound |
| `particle` / `biome` (예정) | 개인 파티클·바이옴 오버라이드 패킷 | outbound |

현재 2 + 예정 3 소비자 → 도메인마다 채널 핸들러를 각자 심는 건 중복·충돌. **한 번 nms 에 두고 전 도메인이 소비**한다.

## 얇은 nms 원칙 (이 설계의 뼈대)

> nms 는 **NMS 프리미티브만** 노출한다. "패킷으로 무엇을 할지"(도메인 로직)는 소비 모듈이 소유한다.
> nms 는 어떤 도메인도 import 하지 않는다.

### Paragon 안티패턴 진단

Paragon 의 nms 모듈은 무거웠다(impl 31파일 / 3065줄, 공통 53파일). 원인은 코드량이 아니라 **배치**다:

- `VanillaWorldMinimapRenderer`(174줄), `MinimapAdapterImpl`, `mob/ai/GoalApplicatorImpl`,
  `container/ContainerAdapterImpl`, `minimap/LockedViewInterceptor` — 미니맵 렌더·몹 AI·인터셉터 **로직**이
  "NMS 를 쓴다"는 이유만으로 nms 에 눌러앉았다.
- 결과: nms 가 "NMS 를 건드리는 모든 것"의 쓰레기장이 됨. 도메인 개념(미니맵 타일, 몹 목표)이 nms 에 샘.

### Figment 경계선

**nms 에 두는 것 (프리미티브):**
- 의미 패킷 DTO (`ContainerSetSlotPacket` 등 — NMS 타입을 감싸 Bukkit 타입으로만 노출)
- 인터셉터/파이프라인 **인터페이스**
- netty `ChannelDuplexHandler` 주입, 코덱(NMS 패킷 ↔ DTO)

**nms 에 두지 않는 것 (도메인 로직):**
- 인터셉터 **구현** — SSR 재빌드, 인벤 trick, 미니맵 보정. 각 도메인 `core` 에 산다.
- 판단 기준: **nms 안의 클래스가 도메인 개념(item definition, minimap tile, hud span)을 import 하려 하면 잘못 놓인 것.**

## 모듈 분담

| 모듈 | 책임 |
|------|------|
| `nms:api` | `PacketLike` DTO 계층, `Inbound`/`OutboundInterceptor`, `PacketService`(파이프라인 소유/조회), `PacketBus`. NMS·도메인 import 0 |
| `nms:core` | 버전 무관 배선. `PacketConnectionListener`(Join/Quit → `install`/`destroy`). NMS 직접 import 0 — `nms:api` 계약만 소비 |
| `nms:v1_21_11` | `ChannelDuplexHandler` 구현, 코덱(mojang-mapped NMS ↔ DTO), 파이프라인 impl. 도메인 import 0 |
| 도메인 `core` (`item:core`, …) | 인터셉터/버스 구독 **구현**. `nms:api` 만 의존 |

## 계층 & 데이터 흐름

### DTO — `PacketLike` (`nms:api`)

NMS 패킷을 의미 DTO 로 감싼다. 가변 필드가 재작성 지점이다.

```kotlin
sealed interface PacketLike { val player: Player }
sealed interface InboundPacket : PacketLike
sealed interface OutboundPacket : PacketLike

// item SSR 재작성 지점
class ContainerSetSlotPacket(
    override val player: Player, val containerId: Int, val stateId: Int,
    val slot: Int, var item: ItemStack,           // ← 갈아끼우면 그 클라만 다른 아이템
) : OutboundPacket
```

**지금 만드는 DTO 만 정의**하고 필요할 때 증식한다(YAGNI): `ContainerSetSlot`, `ContainerSetContent`,
`OpenScreen`, `ContainerClose`, `RecipeBookSeenRecipe`, `SetPassengers`.

### 코덱 (`nms:v1_21_11`)

`decode(nmsPacket, player) → DTO?` / `encode(DTO, original) → nmsPacket`. 인코드는 **바뀐 필드만 제자리 변형**한다.

```kotlin
object ContainerSetSlotCodec : OutboundPacketCodec<ContainerSetSlotPacket> {
    override val rawPacketType = ClientboundContainerSetSlotPacket::class.java
    override fun decode(p: Any, player: Player) = (p as? ClientboundContainerSetSlotPacket)?.let {
        ContainerSetSlotPacket(player, it.containerId, it.stateId, it.slot, CraftItemStack.asBukkitCopy(it.item))
    }
    override fun encode(e: ContainerSetSlotPacket, original: Any) = /* item 바뀌었으면 필드 세팅 후 */ original
}
```

### 채널 핸들러 (`nms:v1_21_11`)

`player.channel().pipeline().addBefore("packet_handler", …)`. inbound=`channelRead`, outbound=`write`.

**lazy decode(성능 가드, 필수):** 등록된 코덱이 없는 패킷은 디코드 없이 그대로 통과. 매 패킷 역직렬화 금지.

```
write(msg):
  codec = registry.findOutbound(msg) ?: return super.write(msg)   // 관심 없는 타입 → 스킵
  event = codec.decode(msg, player) ?: return super.write(msg)
  for interceptor in outbound (priority 순):
      event = interceptor.interceptOutbound(event, player) ?: return  // null = 드롭
  super.write(codec.encode(event, msg))
```

`ProtectedPacket(inner)` 래퍼 = "이 패킷은 가로채지 마라". 파이프라인이 **자기가 보낸** 패킷(SSR 재전송 등)을
다시 가로채는 루프를 막는다. `sendPacketSilent` 가 이걸로 감싼다.

### 이벤트 버스 (`nms:api`)

인터셉터 인터페이스를 매번 구현하는 대신 타입별 구독. 채널 핸들러가 디코드한 DTO 를 `PacketBus.dispatch`
로 바로 넘긴다 — 파이프라인·버스를 잇는 별도 브릿지 클래스는 없다. 구독자는 순서·우선순위 없이 등록순
전원 호출되고(YAGNI — 지금은 SSR 1개뿐), 하나가 던져도 나머지는 계속 돈다(`PacketBus.dispatch` 가 try/catch).

```kotlin
PacketBus.subscribe<ContainerSetSlotPacket> { it.item = render(it.item, it.player) }  // Subscription 반환
```

## Paragon 대비 게으른 결정

| Paragon | Figment | 이유 |
|---------|---------|------|
| 코덱 `CodecEntry(refCount, permanent)` 동적 등록/해제 | **정적 `Map<Class, Codec>`, 부팅 시 1회** | 도메인은 부팅 때 등록→플러그인 수명 내내 삶. 런타임 교체 없음. `// ponytail: 런타임 인터셉터 교체 생기면 refcount 추가` |
| 인터셉터 로직이 nms 에 일부 존재 | 인터셉터 구현 전부 도메인 core | 얇은 nms 원칙 |

유지한 것: 의미 DTO 추상화, lazy decode, `ProtectedPacket`, 버스.

## 소비 예시

### item 공유 스택 SSR

canonical 스택엔 `figment:item`(id) + `figment:item_version`(version) PDC 만. `item:core` 가:

```kotlin
PacketBus.subscribe<ContainerSetSlotPacket> { pkt ->
    val id = ItemKeys.readId(pkt.item) ?: return@subscribe
    val display = service.render(id, pkt.player, cosmeticOnly = true) ?: return@subscribe
    pkt.item = ClientsideOverlay.apply(pkt.item, display)   // cosmetic 만 덮음, 서버 truth 보존
}
```
craft-engine `CommonItemPacketHandler` 의 축소판. `ContainerSetContent`(인벤 전체)도 같은 방식. 자세한
내용(cosmetic overlay 범위, `cosmeticOnly` perf 근거)은 [item-internals.md](item-internals.md) 참고.

### 인벤 열기 감지 (Paragon trick) — 미구현

바닐라는 *자기 인벤* 여는 걸 서버에 안 알린다. 우회: 더미 recipe(id `-1`) + 슬롯1 더미템을 심어두면,
자기 인벤을 열 때 클라가 `RecipeBookSeenRecipe(-1)` 를 보냄 → 서버가 `PlayerInventoryOpenEvent` 발생.
inbound(recipe) + outbound(`OpenScreen`/`ContainerSetSlot`) 양방향을 쓴다 → 파이프라인이 inbound 를
지원하게 되면 첫 실사용례가 된다. `RecipeBookSeenRecipePacket`/`ContainerClosePacket` DTO 는
`nms:api` 에 이미 있지만 코덱·`channelRead` 오버라이드가 없어 아직 안 흐른다. 이 로직 자체는 nms 가
아니라 해당 도메인/게임 모듈에 산다.

## 함정 (버리면 버그)

- **스레드:** 인터셉터는 **netty IO 스레드**에서 돈다(메인 아님). 순수 패킷 변형(ItemStack 교체)은 off-main OK.
  하지만 **월드 상태 접근·Bukkit 이벤트 발생(`callEvent`)은 반드시 메인으로 hop**(`runTask`). Paragon 이
  `PlayerInventoryOpenEvent` 를 netty 스레드에서 바로 부르는 지점이 함정 — 옮겨 부른다.
- **teardown/reload:** disable 시 **채널 핸들러를 전 플레이어에서 제거 필수.** 안 하면 격리 Koin reload 설계가
  죽은 classloader 를 참조하는 stale 핸들러를 남겨 `ClassCastException` 지옥. `PacketService` 를
  `ManagedLifecycle` 로 만들어 `shutdown()` 에서 멱등 제거한다.
- **핸들러 순서:** `packet_handler` **앞에** 주입해야 디코드된 NMS 패킷 객체를 본다. 경로는
  `CraftPlayer.handle.connection.connection.channel`([NMSUtils](../../nms/v1_21_11/src/main/kotlin/team/semicolon/figment/nms/v1_21_11/NMSUtils.kt) 이미 노출).
- **주입/파괴 시점:** `nms:core` 의 `PacketConnectionListener`(`@Listener`)가 `PlayerJoin` 에 파이프라인 생성,
  `PlayerQuit` 에 파괴. reload 직후 이미 접속한 플레이어는 리스너 생성 시 `Bukkit.getOnlinePlayers()` 로 일괄 주입.

## 확장

- **새 패킷:** `nms:api` 에 DTO 추가 → `nms:v1_21_11` 에 코덱 추가 → 도메인에서 `subscribe`. nms 는 여전히 도메인 무지.
- **particle/biome:** 새 outbound DTO(개인 파티클/바이옴 패킷) + 코덱만 nms 에. 렌더 판단은 각 도메인 core.
- **멀티버전:** 현재 `nms:v1_21_11` 단일 타겟. 버전 분기 시 코덱/채널 impl 만 버전 모듈별로. `nms:api` DTO·인터페이스는 공유.

## 부록: packetevents 를 쓰지 않는 이유

| 근거 | 내용 |
|------|------|
| 인프라 중복 | 이미 mojang-mapped NMS(paperweight) + `nms:api` 추상화 + 채널 접근 보유. packetevents = 평행 NMS 추상화 |
| 없는 문제 | packetevents 핵심 가치 = 멀티버전. Figment 는 단일버전 정책 → 추상화 세금만 냄 |
| thin-jar 충돌 | `paper-library` 로 작은 dep 만 주입하는 설계와 뚱뚱한 런타임 dep 충돌 |
| 경험적 크기 | Paragon 이 ~10파일 자작으로 전 도메인 커버 증명. 문제가 작다 |
| paperweight 우위 | 컴파일타임 mojang 이름 접근 가능 → packetevents 런타임 래퍼보다 깔끔. packetevents 는 NMS 접근이 *없을 때* 빛남 |

**전환 지점(업그레이드 경로):** MC 여러 버전 동시 지원으로 선회 + 패킷 포맷 변화가 유지보수 병목이 될 때만.
