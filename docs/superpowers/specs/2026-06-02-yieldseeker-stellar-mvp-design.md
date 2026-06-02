# YieldSeeker · Stellar — MVP Tasarım Spec'i

- **Tarih:** 2026-06-02
- **Durum:** Tasarım onaylandı; implementation plan'a (writing-plans) geçilecek
- **Bağlam kaynağı:** `yieldseeker-stellar-fizibilite-raporu.md` (fizibilite + mimari araştırma)

---

## 1. Amaç & Özet

Atıl USDC için Stellar (Soroban) üzerinde otonom bir DeFi yield-optimizasyon AI agent'ı. Agent, Blend Capital testnet pool'larının USDC getirilerini periyodik tarar, risk-ayarlı en iyi getiriyi bir LLM (Claude) ile seçer, ve kullanıcının fonunu daha iyi pool'a **gerçek Soroban testnet işlemleriyle** taşır.

**Tek cümlelik UX:** Kullanıcı bir kez kurar (smart wallet'a USDC yatırır + passkey ile agent'ı yetkilendirir); gerisini agent otonom halleder.

> **Tasarım güncellemesi (2026-06-02 — uygulama sırasında):** Tarama/listeleme **gerçek Blend MAINNET pool'larını** okur (çok sayıda pool, gerçek ~%4-8 USDC getirisi); execution (deposit) **TESTNET**'te yapılır (gerçek tx, gerçek para yok). Sebep: testnet'te tek ve ~%0.05 APR'li pool var → saf testnet verisi demo'da gerçekçi durmuyor. Seçilen mainnet pool, deposit anında tek testnet exec pool'una eşlenir. Config `SCAN_*` (mainnet) ve `EXEC_*` (testnet) olarak ayrılmıştır.

Bu spec **agent backend'ini (sistem)** kapsar. Web dashboard (frontend) sonraki ayrı bir aşamadır ve bu backend'in API'sini tüketir.

## 2. Hedefler / Hedef-Olmayanlar

**Hedefler (MVP):**
- Gerçek Soroban **testnet** execution: Blend pool'larına gerçek USDC deposit/withdraw, gerçek tx hash'leri.
- Gerçek LLM agent: Claude tool-use ile karar + doğal-dil gerekçe.
- Tek-seferlik kullanıcı kurulumu → sonrasında onaysız otonom rebalancing.
- Policy-signer smart wallet: agent yalnızca izin verilen aksiyonları yapabilir (fon drain edemez).
- Frontend'in tüketeceği bir API + aktivite log'u.

**Hedef DEĞİL (MVP'de):**
- Mainnet / gerçek para.
- Atomik (tek-tx) rebalance (1-op-per-tx limiti nedeniyle 2 ardışık tx kabul).
- Production-grade audit, custom Soroban orchestrator/vault kontratı (SEP-56) — "production upgrade" olarak işaretli.
- Çok sayıda protokol; MVP Blend pool'larıyla sınırlı (gerekirse +DeFindex).
- Web frontend (ayrı aşama).

## 3. Mimari (Yaklaşım A: off-chain LLM agent + Blend SDK)

TypeScript/Node tek paket. Off-chain agent backend; Soroban'a SDK'larla doğrudan bağlanır (custom kontrat yok).

```
┌─────────────────────────── orchestrator (loop) ───────────────────────────┐
│  tick (~30s veya on-demand):                                               │
│    scanner.scan() → risk.score(tolerance) → agent.decide()                 │
│       → (rebalance ise) executor.rebalance() → state + log + API feed      │
└────────────────────────────────────────────────────────────────────────────┘
        │            │              │                    │
     scanner        risk          agent (Claude)       executor → wallet
   (Blend SDK,    (deterministik) (tool-use)          (stellar-sdk,
    Soroban RPC)                                        blend-sdk, passkey-kit)
```

## 4. Bileşenler (tek sorumluluk + net arayüz)

| Modül | Sorumluluk | Arayüz (taslak) | Bağımlılık |
|-------|------------|------------------|------------|
| `scanner` | Blend testnet pool'larının USDC supply APY + state'ini çek, normalize et | `scan(): Promise<PoolYield[]>` | `@blend-capital/blend-sdk-js`, Soroban RPC, (ops. DefiLlama API) |
| `risk` | Pool'a risk skoru ata (TVL, utilization, oracle-health flag), toleransa göre filtrele | `score(pools: PoolYield[], tolerance: RiskTolerance): ScoredPool[]` | saf TS |
| `agent` | Claude tool-use loop: scored pool + pozisyon + tolerans → karar + gerekçe | `decide(ctx: DecisionContext): Promise<Decision>` | `@anthropic-ai/sdk` |
| `executor` | Blend withdraw→deposit tx kur/simulate/imzala/submit; tx hash döndür | `rebalance(from: PoolId, to: PoolId, amount: bigint): Promise<TxResult>` | `@stellar/stellar-sdk`, blend-sdk, `wallet` |
| `wallet` | Smart wallet (contract account) + agent policy signer ile kısıtlı otonom imza | `sign(tx)`, `address()`, `setupPolicy(...)` | `passkey-kit` |
| `orchestrator` | Loop + state + aktivite log persist + guard'lar | `tick()`, `start()`, `stop()` | yukarıdakiler + `better-sqlite3` |
| `api` | Pozisyon/tarama/karar/log expose (frontend için) | REST + `/events` (SSE) | orchestrator state |

**Agent tool'ları (Claude'a verilen, zod-valide):** `scan_yields()`, `get_position()`, `rebalance(fromPool, toPool, amount)`.

**Tip taslakları:**
- `PoolYield { poolId, asset:"USDC", apyBase, apyReward?, tvl, utilization }`
- `RiskTolerance = "conservative" | "balanced" | "aggressive"`
- `ScoredPool extends PoolYield { riskScore:number, eligible:boolean, reason?:string }`
- `Decision { action:"hold"|"rebalance", toPool?:PoolId, amount?:bigint, rationale:string }`
- `TxResult { hashes:string[], success:boolean, error?:string }`

## 5. Veri Akışı

1. `orchestrator.tick()` tetiklenir (timer ~30sn veya API on-demand).
2. `scanner.scan()` → tüm aday Blend pool'larının güncel USDC getirisi.
3. `risk.score(pools, tolerance)` → risk skoru + toleransa göre eligible filtresi (örn. oracle-riskli/düşük-TVL pool elenir).
4. `agent.decide()` → Claude, scored pool'lar + mevcut pozisyon + toleransla en iyi hamleyi seçer; `hold` veya `rebalance` + gerekçe döner.
5. Karar `rebalance` ise `executor.rebalance(from,to,amount)`: withdraw(from) tx → deposit(to) tx (simulate → sign(policy signer) → submit). Gerçek tx hash'leri.
6. `orchestrator` state'i ve aktivite log'unu günceller; `api` feed'ine yayar.

## 6. Cüzdan & Yetki Modeli (sistemin güvenlik çekirdeği)

**Tek-seferlik kullanıcı kurulumu:**
1. Kullanıcı passkey ile bir **smart wallet** (Soroban contract account, `passkey-kit`) oluşturur.
2. Smart wallet'a USDC (testnet) yatırır.
3. Agent'a bir **policy signer** yetkilendirir: yalnızca **kayıtlı Blend pool kontratlarına `submit` (deposit/withdraw)** + per-tx & günlük USDC cap. (Tek passkey onayı.)
4. **Risk toleransını** seçer (`conservative` / `balanced` / `aggressive`). State'te saklanır; `risk.score` ve `agent.decide` bu değeri tüketir. (Kurulumdan sonra istenirse değiştirilebilir, ama akış için "bir kez ayarla" yeterli.)

**Sonrasında (otonom):**
- Agent, policy sınırları içinde kullanıcı onayı olmadan rebalance eder.
- Sunucu/agent ele geçirilse bile fon **sadece kayıtlı Blend pool'ları arasında** hareket edebilir, dışarı çıkamaz (drain koruması).
- **Gas kullanıcıdan soyutlanır:** MVP'de cüzdan/işlem ücreti sistem tarafında karşılanır (testnet XLM ile fonlama; fee-bump/sponsored). Kullanıcı tek-seferlik yatırım dışında XLM/gas ile uğraşmaz. (Production'da OpenZeppelin Relayer.)

> `passkey-kit` legacy/deprecated ise `smart-account-kit` (audited OZ stellar-contracts) kullanılır — build başında teyit.

## 7. Somut Demo Senaryosu (testnet'te gerçekten olan)

1. Smart wallet'ta 1.000 test-USDC, Blend Pool A'da (örn. %X).
2. Agent tarar: Pool B %X+Δ veriyor ve risk uygun.
3. Claude: "Risk-ayarlı en iyi getiri Pool B (+Δ%). Taşıyorum." → `rebalance(A, B, 1000)`.
4. Executor: `withdraw(A)` tx + `deposit(B)` tx → **gerçek testnet tx hash'leri**.
5. Pozisyon + aktivite log güncellenir (frontend gösterecek).

## 8. Hata Yönetimi & Guard'lar (MVP-grade)

- Her tx submit öncesi **simulate**; hata → logla, loop'u çökertme.
- Pool scan hatası → o pool'u atla, devam et.
- LLM tool argümanları **zod** ile valide; geçersizse execute yok.
- Guard'lar: **min-yield-delta eşiği** (önemsiz fark için taşıma yok), **rebalance cooldown**, **per-tx & günlük cap** (policy signer ile zincirde de zorlanır).
- Idempotency: pending tx varken yeni rebalance başlatma.

## 9. Test (MVP-grade)

- **Unit:** scanner parse, risk skor, karar-eşiği mantığı (deterministik kısımlar).
- **Integration:** Soroban testnet'e karşı bir **gerçek deposit/withdraw smoke testi** (tx success + bakiye değişimi assert).
- **LLM mock'lanır:** testlerde deterministik karar enjekte edilir → testler Claude'a/şebekeye bağlı olmaz.

## 10. Stack

`@stellar/stellar-sdk` · `@blend-capital/blend-sdk-js` · `passkey-kit` (veya `smart-account-kit`) · `@anthropic-ai/sdk` (Claude tool-use) · Soroban RPC (testnet) · `better-sqlite3` (state/log) · Node + TypeScript.

## 11. İnşa Anında Doğrulanacak Riskler

1. **Blend testnet pool kullanılabilirliği:** Demo için ≥2 USDC pool gerekiyor (taşınacak yer olsun). Yoksa kendi test pool'larımızı deploy ederiz — **build'in ilk adımı bunu teyit eder**.
2. **passkey-kit vs smart-account-kit:** policy-signer kurulumunun güncel/canonical yolu hangisiyse onu kullan; testnet'te policy-signer akışını erken bir spike ile doğrula.
3. **Blend APR hesabı:** APR doğrudan dönmüyor; `Reserve` struct'tan off-chain hesaplanıyor (+BLND emisyonu ayrı) — scanner bunu içermeli.
4. **Anthropic API anahtarı / model:** Claude tool-use için env config; testte mock.

## 12. Açık Kapsam Notu

Frontend (web dashboard) bu spec'in dışında, sonraki aşama. Backend `api` katmanı, daha önce taslağı çıkarılan dashboard'u (pozisyon, canlı tarama tablosu, agent kararı, aktivite log, chat) besleyecek şekilde tasarlanır.
