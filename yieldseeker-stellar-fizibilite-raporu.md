# YieldSeeker'ı Stellar (Soroban) Üzerinde İnşa Etmek — Fizibilite & Mimari Raporu

> **Soru:** "Atıl USDC için en iyi DeFi getirisini avlayan, lending vault'larını sürekli tarayıp pozisyonu kullanıcının risk toleransına göre en yüksek getiriye otomatik taşıyan otonom AI agent" (YieldSeeker; orijinali Base üzerinde Coinbase AgentKit + AWS Bedrock + Morpho/Spark.fi + The Graph) **Stellar/Soroban'da nasıl inşa edilir?**
> **Tarih:** 2 Haziran 2026

---

## ⚠️ Metodoloji & Bu Raporun Provenance'ı

Bu rapor, çok-agent'lı bir deep-research workflow'undan **kurtarılan (salvaged)** veriyle yazıldı. Workflow ~119 agent başlattıktan sonra (yanıt vermeyen bir web-fetch'te) **takıldı** ve final sentez agent'ı çalışamadı. Senin talimatınla yeniden çalıştırmadık; bunun yerine **tamamlanan 80 `StructuredOutput`** çıktısını transcript'lerden çıkardık:

- **6 arama açısı** + ~30 kaynak (resmi Stellar Docs, GitHub repo'ları, DefiLlama API, Messari, Stellar Community Fund)
- **28 kaynaktan çıkarılmış iddia** (claim) + **45 adversarial doğrulama oyu** → **38 doğrulanmış, 7 çürütülmüş**
- Final sentezi (bu rapor) **ben** yazdım; workflow'un kendi sentez katmanı çalışmadı.

**Güven etiketleri:** `[✓ doğrulandı]` (verify'da refuted=false), `[⚠ çürütüldü/çekişmeli]` (refuted=true), `[? doğrulanamadı]` (kaynakta teyit edilemedi). Canlı metrikler (TVL/APR) bu tarihten sonra değişir.

---

## Yönetici Özeti — Fizibilite Kararı: **YAPILABİLİR** (orta-yüksek olgunluk maliyetiyle)

Stellar/Soroban, YieldSeeker'ın **tüm temel primitiflerini** sağlıyor — ve bir noktada Base'den **daha güçlü**:

| Boyut | Durum | Not |
|-------|-------|-----|
| **Getiri kaynağı** | ✅ Güçlü | Blend Capital USDC supply APY **~%8+** — Base'deki Aave V3 / SparkLend %2-5'in belirgin üstünde `[✓]`. Yield-arbitraj tezi Stellar'da daha güçlü. |
| **USDC + token arayüzü** | ✅ Hazır | Native Circle USDC + SAC (CAP-46-6) + SEP-41 token interface; Soroban kontratından programatik `transfer`/`approve`/`transfer_from` `[✓]`. |
| **Vault standardı** | 🟡 Taslak | SEP-56 (ERC-4626 muadili) var ama erken draft (v0.1.2, Kas 2025), benimsenme garantisi yok `[✓]`. |
| **Agent cüzdan modeli** | ✅ Olgun primitifler | Soroban smart wallets (contract accounts) + passkey + **policy signers** + fee-bump/sponsored reserves; "tam kontrol asla agent'ta değil" prensibi yerli `[✓]`. |
| **AgentKit muadili** | 🟠 En zayıf halka | Coinbase-kalibre bir AgentKit YOK. En yakını **Stellar AI Agent Kit** (tek geliştirici, SCF ~$108K, MCP-tabanlı) ve birkaç açık-kaynak MCP server — hepsi erken aşama `[✓]`. |
| **DeFi action kütüphanesi** | 🔴 Yok | AgentKit'in hazır Morpho/Compound adapter'larının Stellar karşılığı yok; **Blend/Soroswap adapter'larını sıfırdan yazmak** gerekir `[✓]`. |
| **Veri/indexing** | ✅ Birden çok seçenek | Mercury (Retroshades), Goldsky, SubQuery + hızlı yol olarak DefiLlama API `[✓]`. |
| **Agentic ödeme rayları** | ✅ Canlı | x402 settlement Stellar mainnet'te canlı; MPP (Stripe+Tempo) 3 Nisan 2026'da canlı, XLM gas sponsorluğu yapıyor `[✓]`. |

**Sonuç:** Teknik fizibilite yüksek; asıl iş **eksik tooling'i kapatmak** (DeFi adapter'ları + agent action katmanı) ve **küçük DeFi yüzeyiyle** (~$235M toplam TVL, ağırlıklı Blend + birkaç DEX) çalışmak. Hackathon-MVP birkaç günde ayağa kalkar; production audit + orchestrator kontrat + indexer + oracle-risk modeli ister.

---

## Bölüm 0 — Referans Ürün (YieldSeeker) Teardown

YieldSeeker'ın **doğrulanmış** bileşen yığını (ETHGlobal Agentic Ethereum 2025 Finalisti, AgentKit Pool Prize) `[✓]`:

| Bileşen | Rol | Kaynak |
|---------|-----|--------|
| **Coinbase AgentKit** | Agent cüzdanı + on-chain action framework'ü; API Autonome'da Docker container'da host | [ethglobal showcase](https://ethglobal.com/showcase/yieldseeker-crg12) |
| **AWS Bedrock LLM** | Akıl yürütme/risk skorlama (zincirden bağımsız, **taşınabilir**) | a.g.e. |
| **Morpho + Spark.fi** | Base üzerinde USDC lending/yield vault'ları (genişletilebilir) | a.g.e. |
| **The Graph** | Yield seçeneklerini ve token'ları indeksleyip sorgulama | a.g.e. |
| **Proprietary risk score** | Her yield seçeneğine on-chain veriden risk puanı; kullanıcının risk toleransına eşleme | a.g.e. |
| **Cüzdan güvenliği** | "Coinbase TEE isolated accounts", non-custodial; "yalnızca sen ve agent'ın fon taşıyabilir"; Nethermind Security + AuditAgent denetimi | [yieldseeker.xyz](https://www.yieldseeker.xyz/) |
| **Framework seçimi** | elizaOS yerine **el-kodlu** agent | [ethglobal showcase](https://ethglobal.com/showcase/yieldseeker-crg12) |

> ⚠️ **Çürütülen iddia:** Bir kaynak "AgentWalletKit, YieldSeeker'ın cüzdan altyapısıdır" dedi; bu **çürütüldü** `[⚠ 0-3 yakını]`. YieldSeeker'ın kendi sitesi cüzdan güvenliğini "Coinbase TEE isolated accounts" olarak tanımlıyor, AgentWalletKit'ten hiç bahsetmiyor. **AgentWalletKit** aynı ekip tarafından yapılmış *ayrı* bir referans tasarımdır (EVM-only, Base) — YieldSeeker'ın canlı altyapısı olarak teyit EDİLMEDİ. Yine de güvenlik deseni (parametre-seviyesi adres doğrulama, immutable AdapterRegistry, admin freeze) Stellar policy-signer eşlemesi için iyi bir referans. Kaynak: [agentwalletkit.tokenpage.xyz](https://agentwalletkit.tokenpage.xyz/).

---

## Bölüm 1 — Stellar DeFi Yield Landscape

Stellar toplam DeFi TVL: **~$235–241M** (1-2 Haziran 2026, DefiLlama) `[✓]`; Messari'ye göre Q1 2026 sonunda $174.4M idi (büyüyor) `[✓]`.

| Protokol | Tip | TVL | USDC getirisi | Programatik erişim | Kaynak |
|----------|-----|-----|---------------|--------------------|--------|
| **Blend Capital** | Lending (ana hedef; Morpho/Spark muadili) | **~$155M** (DefiLlama Haz'26) / $100.6M (Messari Q1) | **USDC ~%8+** (pool-ortalama %4.45) | ✅ `PoolContract.submit()` / `submit_with_allowance()`; `@blend-capital/blend-sdk-js` | [DefiLlama](https://defillama.com/protocol/blend) · [Blend docs](https://docs.blend.capital/tech-docs/integrations/integrate-pool) |
| **Aquarius (Aqua)** | AMM/DEX | ~$34–37M | LP getirisi | ✅ Soroswap üzerinden | [DefiLlama Stellar](https://defillama.com/chain/stellar) |
| **DeFindex** | **Yield Aggregator** (vault-routing; Morpho'ya en yakın) | ~$1.4M | — | ✅ (Soroban vault) | [DefiLlama Stellar](https://defillama.com/chain/stellar) |
| **Soroswap** | DEX **aggregator** (swap/routing katmanı) | ~$1.33M | — | ✅ API quote + XDR build + submit | [soroswap.finance](https://soroswap.finance/) |
| **Phoenix** | DEX | ~$1.82M | LP | ✅ Soroswap üzerinden | [DefiLlama Stellar](https://defillama.com/chain/stellar) |
| **FxDAO** | CDP stablecoin (USDx/EURx) | ~$4.3M borç | Stability-pool | ✅ Soroban | [fxdao.io/docs](https://fxdao.io/docs/borrowing/) |
| **YieldBlox** | ⚠️ Artık bağımsız değil | — | — | Blend V2'nin **YBX-DAO/Yieldblox V2 pool**'u | [Messari Q1'26](https://messari.io/report/state-of-stellar-q1-2026) |

**Kritik bulgular:**
- **Getiri arbitrajı tezi Stellar'da daha güçlü:** Blend USDC APY aylardır **>%8** (vs Base/EVM Aave V3 & SparkLend %2-5) `[✓]`. Büyüme token-teşviki değil; tokenize Hazine/RWA (Spiko, Ondo, Franklin Templeton) kaynaklı `[✓]`.
- **Likidite mevcut:** Stellar'da ~$727M dolaşan USD-stablecoin; USDC mcap ~$256M (Q1'26 sonu), ~$10.2M/gün smart-contract hacmi `[✓]`.
- **Rebalancing yüzeyi dar:** Gerçekçi olarak agent ağırlıklı **Blend pool'ları arası** + birkaç DEX/DeFindex arası rebalance eder. EVM'deki onlarca venue yok — bu hem basitleştirir hem getiri-çeşitliliğini sınırlar.
- ⚠️ **Oracle riski gerçek:** Blend Pools V2 (~$10.97M, 22 Şub 2026) ve YieldBlox (~$10.2M) **oracle manipülasyon** saldırıları yaşadı `[✓]`. Otonom agent'ın risk modeli **oracle/likidite-derinliği filtresi** içermek ZORUNDA. Kaynak: [Halborn](https://www.halborn.com/blog/post/explained-the-yieldblox-hack-february-2026).

---

## Bölüm 2 — USDC & Soroban Token Arayüzü

- **Native USDC** (Circle) + PYUSD + USDY Stellar'da yerli destekli `[✓]` ([x402 on Stellar](https://stellar.org/blog/foundation-news/x402-on-stellar)).
- **SAC (Stellar Asset Contract)** — CAP-46-6 + SEP-41'i implement eder; klasik Stellar varlıklarını (USDC dahil) Soroban kontratından çağrılabilir yapar. Mevcut varlığı **yeniden deploy etmeden** sarmalar; SAC adresi rezerve, herkes deploy edebilir `[✓]` ([SAC docs](https://developers.stellar.org/docs/tokens/stellar-asset-contract)).
- **SEP-41 Token Interface** (Draft v0.4.1, Ağu 2025) — `transfer`, `transfer_from`, `approve`, `allowance`, `balance`, `burn` + metadata. `require_auth()` yetki modeli; `transfer_from` için `spender.require_auth()` → **agent'ın smart wallet/policy signer'ının rebalancing hareketlerini yetkilendirdiği mekanizma** `[✓]` ([SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md)).
- Pratik desen: vault/rebalancer kontratı **`approve` + `transfer_from`** (allowance-tabanlı) kullanır — ERC-20'deki gibi.

---

## Bölüm 3 — Soroban Akıllı Kontrat Yetenekleri & SINIRLARI

Bu, mimarinin en kritik kısıtları:

- 🔴 **İşlem başına TEK operasyon** (fee-bump hariç) `[✓]`. Klasik Stellar 100 op'a izin verir; Soroban vermez. Yani **"vault A'dan çek + vault B'ye yatır"** rebalance'ı tek klasik multi-op tx olarak yapılamaz. Çözüm: bir **orchestrator/vault kontratı** içinde **nested cross-contract call'lar** ile tek invocation'da, atomik (all-or-nothing) yürütülür `[✓]` ([fees & limits](http://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering) · [cross-contract call](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/cross-contract-call)).
- **Kaynak metering 6 boyut:** CPU instruction, ledger read/write sayısı, I/O byte, tx boyutu, event/return boyutu, **ledger rent (TTL)**. Bu boyutlar tek atomik rebalance'ın kaç protokole dokunabileceğini sınırlar `[✓]`.
- **Ledger başına 100 smart-contract tx** (vs 1000 klasik op); daha sık surge pricing `[✓]`. Otonom agent'ın işlem sıklığı/maliyeti bundan etkilenir.
- Fazla beyan edilen kaynak için **geri ödeme yok** → agent resource fee'yi doğru tahmin etmeli `[✓]`. TTL/state-rent maliyeti bütçelenmeli.
- **SEP-56 Tokenized Vault Standard** (ERC-4626 muadili, Draft v0.1.2, Kas 2025, OpenZeppelin) — `deposit/mint`, `withdraw/redeem`, `convert_to_shares/assets`, `preview_*`, `total_assets`. **Strateji/rebalancing/yetki mantığını dayatmaz** → otonom yield-routing'i bu vault'un deposit/withdraw akışı üstüne sen yazarsın `[✓]` ([SEP-56](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0056.md)).
- 🔴 **Native scheduling/cron YOK.** "Sürekli tarama + zamanlı rebalance" off-chain bir scheduler (cron/worker) gerektirir; on-chain otomasyon yok.

---

## Bölüm 4 — AI-Agent Tooling (AgentKit Muadili) — En Kritik Boşluk

**Coinbase AgentKit** Stellar'ı DESTEKLEMEZ (yalnızca EVM + Solana) `[✓]`. 50+ TS/30+ Python action, hazır Morpho/Compound/Moonwell/Jupiter adapter'ları, framework-agnostic (LangChain, OpenAI Agents SDK, Vercel AI, MCP, ElizaOS). **LLM/orkestrasyon katmanı taşınabilir; cüzdan + on-chain-action katmanı zincire özgü** `[✓]` ([coinbase/agentkit](https://github.com/coinbase/agentkit)).

Stellar tarafındaki muadiller (hepsi erken aşama):

| Araç | Ne sağlar | Olgunluk | Kaynak |
|------|-----------|----------|--------|
| **Stellar AI Agent Kit** (`stellar-mcp`, Jose C. Toscano) | Soroban→MCP toolkit; herhangi bir kontrattan production-ready MCP server üretir (TS/Python). **Policy Signer Generator CLI** + Smart Wallet template (PasskeyKit) + Policy Signer Sandbox. 3 app template (Telegram bot, passkey wallet, CLI agent). | 🟠 Tek geliştirici, SCF #37 ~**$108K** fonlu. **MCP-tabanlı**, LangChain/AgentKit klonu değil. LangChain/ElizaOS entegrasyonu **dokümante değil** `[? ]` | [SCF projesi](https://communityfund.stellar.org/project/stellar-ai-agent-kit-mr6) · [DoraHacks buidl](https://dorahacks.io/buidl/25271) |
| **syronlabs/stellar-mcp** | Çalışan açık-kaynak MCP server (MIT); Stellar Classic + Soroban; account/payment/contract build-deploy-invoke. | 🔴 18 yıldız/19 commit. **İmzalama secret key'i parametre alıyor → otonom production için KABUL EDİLEMEZ**, yalnızca prototip `[✓]` | [github](https://github.com/syronlabs/stellar-mcp/) |
| **stellar-mcp-cli / -server** (DoraHacks 25271) | Soroban kontratını tek komutla MCP server'a çevirir; agent **tam hesap erişimi olmadan** passkey-tabanlı policy signer + Passkey Kit + LaunchTube ile XDR imzalar/submit eder. "Hesabımın %5'ini en iyi getiriye taşı" demo'su = **birebir YieldSeeker senaryosu** `[✓]` | [DoraHacks](https://dorahacks.io/buidl/25271) |

**Agentic ödeme rayları (canlı):**
- **x402 on Stellar** — SDF resmi girişimi; settlement **mainnet'te canlı** (Mayıs 2025'ten beri milyonlarca ödeme); OpenZeppelin'in **non-custodial x402 Facilitator**'ı; native USDC/PYUSD/USDY. x402-**MCP** server hâlâ aktif geliştirmede `[✓]`. ⚠️ Nüans: `awesome-x402` listesi x402 production ağlarını EVM+Solana sayıyor, Stellar'ı saymıyor `[✓]` — yani **genel x402 ekosistemi Base/Coinbase-merkezli**, ama **SDF'nin Stellar-x402 settlement'ı ayrıca canlı**. ElizaOS x402 plugin'i (ag402) var ama EVM-bağlı.
- **MPP (Machine Payments Protocol)** — Stripe + Tempo; **3 Nisan 2026'da Stellar'da canlı**; SDK **XLM gas sponsorluğu** yapıyor (agent XLM tutmak zorunda değil); session-tabanlı (limit yetkilendir → mikro-ödeme → toplu settle); 100+ servis (Stripe, Anthropic, OpenAI, Visa) `[✓]` ([Messari Q1'26](https://messari.io/report/state-of-stellar-q1-2026) · [agentic-payments docs](https://developers.stellar.org/docs/build/agentic-payments)).

> **Boşluk özeti:** Hazır bir "Stellar AgentKit + DeFi action library" YOK. En yakını tek-kişilik MCP toolkit'i. **Blend/Soroswap/DeFindex action'larını sen yazacaksın.** Bu, projenin en büyük iş kalemi.

---

## Bölüm 5 — Otonom Agent Cüzdan/Hesap Modeli (Güvenli İmzalama)

Stellar burada güçlü ve olgun primitifler sunuyor:

- **Contract accounts / Smart wallets** — `CustomAccountInterface` + `__check_auth` implement eden kontrat = C-address akıllı cüzdan. `require_auth` çağrılınca Soroban host `__check_auth`'u çalıştırır; "kim, hangi şartla işlem yapabilir" tamamen kontratta. Signer tipleri: **passkey/WebAuthn (secp256r1), ed25519, policy signer, session key**. On-chain spend-cap/allowlist/timelock layer'lanabilir → **"tam kontrol asla agent'ta değil"** `[✓]` ([contract-accounts docs](https://developers.stellar.org/docs/build/guides/contract-accounts)). (Protocol 21, 18 Haz 2024, secp256r1'i native getirdi.)
- **passkey-kit** (kalepail) — TS SDK; 3 signer tipi; **policy signer'lar** signer'ı belirli kontrata kısıtlar + co-signer (`SignerLimits`). ⚠️ **Artık deprecated/legacy** → bakımcı yeni projeleri **`smart-account-kit`**'e (audited OpenZeppelin stellar-contracts üstüne) yönlendiriyor; demo kodu denetlenmemiş, gerçek değer için kullanılmamalı `[✓]` ([passkey-kit](https://github.com/kalepail/passkey-kit)).
- **OpenZeppelin stellar-contracts/accounts** — `SmartAccount` trait + context rules; **production-grade**, per-action granular policy. Custom `__check_auth` yazmak yerine denetlenmiş bileşenler `[✓ /? olgunluk]` ([OZ accounts](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/accounts)).
- **Gasless/sponsored:**
  - **fee-bump** — bir hesap, başka hesabın imzaladığı tx'in ücretini öder (sponsor/relayer modeli); inner tx'i outer envelope sarar `[✓]` ([fee-bump docs](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions)).
  - **sponsored reserves** — `BeginSponsoringFutureReserves`/`End` sandwich'i.
  - ⚠️ **Launchtube** (Soroban op submit + fee sponsorship) — **9 Mart 2026'da arşivlendi (read-only)**, yerini **OpenZeppelin Relayer + Channels Plugin** aldı (önerilen çözüm) `[✓]` ([launchtube](https://github.com/stellar/launchtube)).
  - **MPP SDK** XLM gas sponsorluğu (Bölüm 4).
- ⚠️ **Önemli Soroban kısıtı:** Soroban kontratları Stellar tx ücretini ödeyemez ve sequence number değil **nonce** tutar; iki imza yolu — G-account full-tx signing, G/C-account sponsored-fee'li **auth-entry signing** `[✓]`.

**Önerilen agent imza modeli:** Kullanıcı passkey ile bir smart wallet (contract account) açar; agent'a **kısıtlı bir policy signer** verilir (yalnızca "kayıtlı Blend/Soroswap kontratlarına deposit/withdraw" aksiyonları + per-tx/daily cap + allowlist). Agent XDR üretir, policy signer ile imzalar, OZ Relayer/MPP ile gasless submit eder. Sunucu ele geçirilse bile fonlar **yalnızca önceden onaylı vault adresleri** arasında hareket edebilir (AgentWalletKit deseninin Stellar karşılığı).

---

## Bölüm 6 — Veri / Indexing (The Graph Karşılığı)

| Katman | Araç | Kullanım | Kaynak |
|--------|------|----------|--------|
| **Hızlı APR feed (MVP)** | **DefiLlama API** (`api.llama.fi/v2/chains`, `/protocol/blend`, `/overview/dexs/stellar`) | Indexer kurmadan Blend/Stellar TVL+APY çek; `apyBase/apyReward` normalize | [DefiLlama](https://defillama.com/chain/stellar) |
| **Soroban-native indexer** | **Mercury Retroshades** (paralel SVM-fork, custom data structures, dakikada indexer) + Mercury Classic (GraphQL contract event) | Vault deposit/withdraw/rate event'lerini zengin yapıda indeksle | [Mercury docs](https://docs.mercurydata.app/retroshades/introduction-to-retroshades) |
| **ETL → kendi DB** | **Goldsky** Mirror/Turbo Pipelines (Postgres/ClickHouse'a push, reorg-safe) | Düşük gecikmeli APR pipeline | [Goldsky Stellar](https://goldsky.com/chains/stellar) |
| **Decentralized (The Graph-vari)** | **SubQuery** (300+ zincir, OnFinality hosting) | The Graph'a en yakın model | [Stellar indexer providers](https://developers.stellar.org/docs/data/indexers/indexer-providers) |
| **Tarihsel/backtest** | **Hubble** (SDF BigQuery dataset) | Geçmiş APR trend analizi/backtest — **real-time DEĞİL** (intraday batch) `[✓]` | [Hubble docs](https://developers.stellar.org/docs/data/analytics/hubble) |
| **DIY (en ucuz)** | **Soroban RPC `getEvents`** + cron + SQLite | RPC event'i **yalnızca ~7 gün** tutar → kendi DB'ne ingest ZORUNLU | [event ingest docs](https://developers.stellar.org/docs/build/guides/events/ingest) |

⚠️ **Horizon deprecate ediliyor** — Horizon'daki veri bile gelecekte indexing servisi gerektirecek → production'da **adanmış indexer opsiyonel değil, zorunlu** `[✓]`.
⚠️ Blend'de **APR doğrudan dönmüyor**; `Reserve` struct'tan off-chain hesaplanır + BLND emisyon APR'si ayrı `[✓]`.

---

## Bölüm 7 — Mimari Eşleme Tablosu (YieldSeeker → Stellar)

| YieldSeeker (Base) | Stellar/Soroban Karşılığı | Durum |
|--------------------|---------------------------|-------|
| **Coinbase AgentKit** (agent wallet + action) | **Stellar AI Agent Kit (stellar-mcp)** / syronlabs-mcp + **custom Blend/Soroswap action katmanı** | 🟠 Kısmi; action'lar yazılacak |
| **AWS Bedrock LLM** | Aynı (herhangi LLM) — **taşınabilir** | ✅ Değişmez |
| **Morpho / Spark.fi vaults** | **Blend Capital** (ana) + **DeFindex** (aggregator) + SEP-56 vault'lar | ✅ Mevcut (dar) |
| **The Graph** | **Mercury (Retroshades) / Goldsky / SubQuery** + **DefiLlama API** (hızlı yol) | ✅ Birden çok seçenek |
| **Proprietary risk score** | Aynı off-chain mantık + **oracle/likidite-derinliği filtresi** (Blend/YieldBlox hack'leri sonrası zorunlu) | ✅ Taşınabilir + güçlendir |
| **Coinbase TEE wallet** | **Soroban smart wallet (contract account)** + **smart-account-kit/passkey** + **policy signers** | ✅ Olgun primitif |
| **Swap/routing** | **Soroswap API** (quote + XDR + submit) | ✅ Hazır |
| **Gasless tx** | **fee-bump + OpenZeppelin Relayer** (Launchtube arşivlendi) / **MPP gas sponsorluğu** | ✅ Hazır |
| **Atomik multi-step işlem** | **Orchestrator kontrat + nested cross-contract call** (1-op-per-tx limiti) | 🟡 Ekstra kontrat işi |
| **Scheduling/cron** | **Off-chain worker** (Soroban'da native cron yok) | 🟡 Off-chain |
| **Vault standardı (ERC-4626)** | **SEP-56** (erken draft) | 🟡 Taslak |

---

## Bölüm 8 — Önerilen Mimari: Hackathon-MVP vs Production

### 🏃 Hackathon-MVP (günler)
1. **Veri:** DefiLlama API ile Blend USDC APY + birkaç pool tara (indexer kurma).
2. **Agent:** Off-chain Node/TS worker + LLM (Bedrock/herhangi) ile basit risk skorlama; **stellar-mcp** (Jose Toscano veya syronlabs) ile Soroban tool katmanı.
3. **Cüzdan:** passkey-kit/smart-account-kit ile smart wallet; agent'a tek **policy signer** (Blend deposit/withdraw + cap).
4. **Yürütme:** `@blend-capital/blend-sdk-js` ile `submit()` deposit/withdraw; swap gerekirse Soroswap API. Tek protokol (Blend) içi pool-rebalance yeterli.
5. **Gasless:** OZ Relayer veya MPP.
> Risk: syronlabs-mcp'nin secret-key imzalaması production'a uygun değil — MVP'de demo cüzdanı kullan, gerçek fon koyma.

### 🏗️ Production (haftalar–aylar)
1. **Orchestrator/Vault kontratı (Rust):** SEP-56 uyumlu; atomik rebalance'ı **nested cross-contract call** ile tek invocation'da; per-protocol **immutable, audited adapter**'lar (AdapterRegistry deseni); admin pause/freeze.
2. **Cüzdan:** **smart-account-kit** (audited OZ stellar-contracts) + granular policy signer'lar + parametre-seviyesi hedef-adres doğrulama.
3. **Veri:** Mercury Retroshades veya Goldsky ile kendi indexer'ı + Hubble'da backtest; RPC `getEvents` fallback.
4. **Risk modeli:** oracle-sağlık + likidite-derinliği + TVL-eşiği + protokol-audit filtreleri (Blend/YieldBlox oracle hack'leri dersi).
5. **Gasless/fee:** OZ Relayer (Channels Plugin) + MPP; resource-fee tahmini (geri ödeme yok).
6. **Audit:** Nethermind-tarzı + AuditAgent (YieldSeeker'ın izlediği yol).
7. **Fonlama yolu:** Stellar Community Fund (Stellar AI Agent Kit'in $108K aldığı kanal).

---

## Bölüm 9 — Boşluklar, Riskler & Doğrulanamayanlar

**Net boşluklar `[✓]`:**
- Coinbase-kalibre AgentKit + hazır DeFi action library YOK → en büyük geliştirme yükü.
- LangChain/ElizaOS Stellar plugin'i **dokümante değil** `[?]` (MCP yolu mevcut).
- SEP-56 vault standardı erken draft, benimsenme garantisiz.
- DeFi yüzeyi dar (~$235M; ağırlıklı Blend + birkaç DEX) → rebalancing çeşitliliği sınırlı.
- 1-op-per-tx + 7-günlük RPC event retention + Horizon deprecation + Launchtube arşivi → ekstra altyapı kararları.

**Riskler `[✓]`:** Oracle manipülasyon (Blend $10.97M, YieldBlox $10.2M, Şub 2026); surge pricing; state-rent (TTL) maliyeti; tek-geliştirici tooling bağımlılığı.

**Avantajlar `[✓]`:** Blend USDC ~%8+ (Base'in 2-3x'i) → güçlü yield-arbitraj tezi; olgun smart-wallet/passkey/policy-signer primitifleri; canlı x402+MPP agentic ödeme rayları; DefiLlama API ile hızlı MVP; DeFindex hazır aggregator primitifi; SCF fonlama yolu.

**⚠️ Çürütülen / çekişmeli iddialar (şeffaflık için):**
- "AgentWalletKit = YieldSeeker'ın cüzdan altyapısı" → **çürütüldü** (birden çok oy). YieldSeeker resmi sitesi "Coinbase TEE isolated accounts" diyor.
- Coinbase Agentic Wallets'ın **"true self-custody"** ifadesi **çekişmeli** — bağımsız kaynaklar (dev.to, Cobo) modeli "custodial/MPC, anahtarlar Coinbase'de" diye nitelendiriyor.
- Coinbase'in **"3am otomatik rebalancing"** anlatısı bağımsız basında (Yahoo Finance) **"aspirational/infrastructure-mode"** olarak çerçeveleniyor, sevk edilmiş özellik olarak değil.

**`[? doğrulanamadı]`:** Soroswap kesin USDC APR/TVL; FxDAO/YieldBlox güncel bağımsız durumu; StellarYield ([github](https://github.com/edehvictor/StellarYield) — Stellar'da AI yield-aggregator, *bağımsız topluluk repo'su*, canlı mı hackathon-aşaması mı belirsiz) olgunluğu; OZ stellar-contracts audit durumu; bazı x402-Stellar facilitator detayları; Lumexo/MPP üçüncü-parti iddiaları.

---

## Kaynakça (Birincil & İkincil)

**Referans ürün:** [ethglobal.com/showcase/yieldseeker-crg12](https://ethglobal.com/showcase/yieldseeker-crg12) · [yieldseeker.xyz](https://www.yieldseeker.xyz/) · [agentwalletkit.tokenpage.xyz](https://agentwalletkit.tokenpage.xyz/) · [coinbase/agentkit](https://github.com/coinbase/agentkit) · [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets)

**Stellar DeFi/yield:** [DefiLlama Stellar](https://defillama.com/chain/stellar) · [DefiLlama Blend](https://defillama.com/protocol/blend) · [Blend integrate-pool](https://docs.blend.capital/tech-docs/integrations/integrate-pool) · [Soroswap](https://soroswap.finance/) · [FxDAO docs](https://fxdao.io/docs/borrowing/) · [Messari State of Stellar Q1 2026](https://messari.io/report/state-of-stellar-q1-2026) · [Halborn YieldBlox hack](https://www.halborn.com/blog/post/explained-the-yieldblox-hack-february-2026)

**Token/Soroban:** [SAC docs](https://developers.stellar.org/docs/tokens/stellar-asset-contract) · [SEP-41](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md) · [SEP-56 vault](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0056.md) · [fees/resource limits](http://developers.stellar.org/docs/learn/fundamentals/fees-resource-limits-metering) · [cross-contract call](https://developers.stellar.org/docs/build/smart-contracts/example-contracts/cross-contract-call)

**Agent tooling/ödeme:** [Stellar AI Agent Kit (SCF)](https://communityfund.stellar.org/project/stellar-ai-agent-kit-mr6) · [syronlabs/stellar-mcp](https://github.com/syronlabs/stellar-mcp/) · [DoraHacks stellar-mcp](https://dorahacks.io/buidl/25271) · [x402 on Stellar](https://stellar.org/blog/foundation-news/x402-on-stellar) · [agentic-payments docs](https://developers.stellar.org/docs/build/agentic-payments) · [awesome-x402](https://github.com/xpaysh/awesome-x402)

**Cüzdan/imza:** [contract-accounts](https://developers.stellar.org/docs/build/guides/contract-accounts) · [passkey-kit](https://github.com/kalepail/passkey-kit) · [OZ stellar-contracts/accounts](https://github.com/OpenZeppelin/stellar-contracts/tree/main/packages/accounts) · [fee-bump](https://developers.stellar.org/docs/build/guides/transactions/fee-bump-transactions) · [launchtube (arşiv)](https://github.com/stellar/launchtube)

**Veri/indexing:** [indexer providers](https://developers.stellar.org/docs/data/indexers/indexer-providers) · [Mercury Retroshades](https://docs.mercurydata.app/retroshades/introduction-to-retroshades) · [Goldsky Stellar](https://goldsky.com/chains/stellar) · [event ingest](https://developers.stellar.org/docs/build/guides/events/ingest) · [Hubble](https://developers.stellar.org/docs/data/analytics/hubble)

---

*Bu rapor, takılan bir deep-research workflow'undan kurtarılan 80 yapılandırılmış agent çıktısı (38 doğrulanmış + 7 çürütülmüş iddia, 6 arama açısı, ~30 kaynak) üzerine elle sentezlendi. Final otomatik-sentez katmanı çalışmadı; güven etiketleri ve "doğrulanamadı" işaretleri korundu. Production kararları için işaretli birincil kaynakları (özellikle Blend SDK, smart-account-kit, SEP-56) doğrudan teyit et.*
