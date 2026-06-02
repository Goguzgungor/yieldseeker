# Agentic Crypto Projeleri — Deep Research Raporu

> **Konu:** Son ~12 ayda (Haziran 2025 – Haziran 2026) Ethereum hackathonlarında finalist/kazanan agentic (otonom AI agent) projeleri + genel olarak öne çıkan ticari agentic crypto projeleri (Giza ARMA, Olas, Wayfinder vb.).
> **Tarih:** 1 Haziran 2026
> **Kapsam:** 30 agentic proje, 4 hackathon/etkinlik + 6 flagship/ticari proje, kurumsal sponsorluk bağlamı.

---

## Metodoloji & Güven Notu

Bu rapor iki aşamalı bir araştırma sürecinin çıktısıdır:

1. **Deep-research harness** (otomatik, çok-agent'lı): Soru 5 arama açısına bölündü → **103 alt-agent**, **21 kaynak fetch**, **98 ham iddia çıkarıldı**, en kritik **25 iddia** 3-oylu adversarial doğrulamadan geçirildi (öldürmek için 3'te 2 çürütme gerekti) → **22 onaylandı, 3 reddedildi**. Bu, raporun *doğrulanmış çekirdeğini* oluşturur.
2. **Zenginleştirme turu** (3 paralel araştırma agent'ı): Deep-research'ün "açık sorular" olarak işaretlediği — ismi doğrulanmış ama işlevsel detayı çıkarılmamış — finalistlerin detayları doğrudan **ethglobal.com/showcase** (birincil kaynak) sayfalarından çekildi.

**Güven etiketleri:** Her iddia yanında `[3-0]` (oybirliğiyle onaylı), `[2-1]` (çoğunlukla onaylı ama oybirliği değil) veya `[medium]` (kaynaklar arası tutarsız) etiketi vardır. Etiketsiz finalist detayları birincil ETHGlobal showcase sayfalarından doğrulanmıştır.

> ⚠️ **Canlı veri uyarısı:** Traction rakamları (agent sayısı, işlem hacmi, market cap) bu rapor tarihinden (Haziran 2026) sonra değişir. Market cap değerleri ~2026 başı snapshot'larıdır. Token *fiyatı* bilinçli olarak verilmemiştir; yalnızca yapısal metrikler (raise, market cap, kullanıcı/agent sayısı) kullanılmıştır.

---

## Yönetici Özeti

**Agentic AI, Haziran 2025 – Haziran 2026 döneminde Ethereum hackathonlarının baskın temasıydı.** ETHDenver 2026 katılımcı gözlemlerine göre bir "DeFi etkinliği"nden çok bir **"AI × crypto expo"**suna dönüştü `[3-0]`; ETHGlobal etkinlikleri (Agentic Ethereum 2025, New York 2025, New Delhi 2025, Cannes 2026) otonom AI agent kategorilerinde finalist/kazanan onlarca proje üretti.

**Hackathon tarafında öne çıkanlar:**
- **Etherius** — ETHGlobal NYC 2025'te ASI Alliance track'i 1.lik (Fetch.ai uAgents + x402 ile NFT istihbarat agent'ı) `[3-0]`
- **Agentic Ethereum 2025**'in 518 projeden seçilen 10 finalisti `[3-0]`
- **DIVE** — ETHGlobal Cannes 2026 finalisti, prediction market'ler için çok-agent'lı (AI swarm) oracle `[3-0]`

**Ticari/flagship tarafında doğrulananlar:**
- **Giza ARMA** — Base üzerinde otonom stablecoin yield agent'ı (~$3.96B agentic hacim raporlanıyor) `[3-0 kategori / medium traction]`
- **Olas (Autonolas)** — "AI Agent App Store" (Pearl) + agent-to-agent pazaryeri (Mech Marketplace); on-chain 3.643 agent, 17.4M+ işlem, $13.8M raise `[3-0]`
- **Wayfinder** — Parallel Studios'un omnichain agent protokolü (PROMPT token) `[3-0]`
- **Almanak** — $8.45M kurumsal fonlama (Delphi Labs, HashKey, NEAR Foundation) `[3-0]`

**Kurumsal sponsorluk güçlüydü:** Hedera (ETHDenver 2025'te $50K'lık havuzun $25K'sı "AI & Agents" track'ine) `[3-0]`, ASI Alliance / Fetch.ai+SingularityNET (birden çok ETHGlobal track'i) `[3-0]`, ve Kite AI (Encode Club ile 2026 global hackathon + ETHDenver bounty) `[3-0]` agentic builder'ları finanse etti.

---

## Hızlı Bakış Tablosu

| # | Proje | Kategori | Etkinlik / Bağlam | Ne yapıyor (özet) | Zincir |
|---|-------|----------|-------------------|-------------------|--------|
| 1 | **Etherius** | Hackathon 🏆 | ETHGlobal NYC 2025 — ASI Alliance 1. | NFT istihbarat agent'ı (doğal dil → OpenSea) | Base / uAgents |
| 2 | **MintCondition** | Hackathon 🏆 | ETHGlobal NYC 2025 — ASI Alliance 2. | Çok-agent'lı NFT değerleme | Fetch.ai / MeTTa |
| 3 | **Waterfall** | Hackathon 🏆 | ETHGlobal NYC 2025 — ASI Alliance 3. | OpenSea→Ocean veri yayını agent'ı | Fetch.ai / Ocean |
| 4 | **AIMen** | Hackathon | Agentic Ethereum 2025 Finalist | Doğal dille onchain agent workflow'ları | EVM / AgentKit |
| 5 | **Nimble** | Hackathon | Agentic Ethereum 2025 Finalist | Solver ağı + Morpho yield otomasyonu | Base / AgentKit |
| 6 | **SecretAgent** | Hackathon | Agentic Ethereum 2025 Finalist | Agent'lar için secret yönetimi + kill-switch | Base |
| 7 | **Smol Universe** | Hackathon | Agentic Ethereum 2025 Finalist | Twitter klonu agent'larla dünya simülasyonu | Base Sepolia |
| 8 | **Synapze** | Hackathon | Agentic Ethereum 2025 Finalist | ElizaOS agent'ları için tek-tık hosting | EigenLayer AVS |
| 9 | **bouncer.ai** | Hackathon | Agentic Ethereum 2025 Finalist | AI "fedai" agent'larla token launchpad | Arbitrum |
| 10 | **PvPvAI** | Hackathon | Agentic Ethereum 2025 Finalist | Agentic prediction-market oyunu | Base / Arbitrum |
| 11 | **Shaman** | Hackathon | Agentic Ethereum 2025 Finalist | "Onchain autopilot" agent platformu | Arbitrum / MUD |
| 12 | **Streme.fun** | Hackathon 🏆 | Agentic ETH 2025 — Best Social Agent | Farcaster'da sohbetle token deploy agent'ı | Base |
| 13 | **YieldSeeker** | Hackathon | Agentic Ethereum 2025 Finalist | Atıl USDC için otonom yield avcısı | Base |
| 14 | **DIVE** | Hackathon | ETHGlobal Cannes 2026 Finalist | Prediction market için AI swarm oracle | 0G / Hedera |
| 15 | **ENShell** | Hackathon 🏆 | Cannes 2026 — Chainlink CRE ödülü | Agent'lar için on-chain "firewall" | Sepolia / ENS |
| 16 | **maki** | Hackathon | ETHGlobal Cannes 2026 Finalist | Donanım-izolasyonlu DeFi agent'ı | EVM / ERC-4337 |
| 17 | **ALMA** | Hackathon 🏆 | Cannes 2026 — Uniswap API 3. | Otonom likidite (LP) rebalancing agent'ı | Base / Uniswap v4 |
| 18 | **npmguard** | Hackathon 🏆 | Cannes 2026 — ENS 3. | Agentic npm güvenlik denetçisi | Sepolia / 0G |
| 19 | **Corpus** | Hackathon | ETHGlobal Cannes 2026 Finalist | Ürünü otonom "AI agent şirketi"ne çevirir | Hedera / x402 |
| 20 | **Agent Colony** | Hackathon 🏆 | ETHDenver 2026 — Kite AI bounty 3. | Agent-yerel ödeme/kimlik üzerine agent | Kite / x402 |
| 21 | **Giza ARMA** | Flagship | Ticari (Base ana-ağ) | Otonom stablecoin yield agent'ı | Base |
| 22 | **Olas (Autonolas)** | Flagship | Ticari (8 zincir) | AI Agent App Store + A2A pazaryeri | Multi-chain |
| 23 | **Wayfinder** | Flagship | Ticari (Parallel Studios) | Omnichain otonom agent protokolü | Omnichain |
| 24 | **Almanak** | Flagship | Ticari ($8.45M raise) | DeFi smart-agent platformu | Multi-chain |
| 25 | **Fetch.ai** | Flagship | Ticari (ASI Alliance) | uAgents + Agentverse + ASI:One | EVM |
| 26 | **Virtuals Protocol** | Flagship | Ticari (agent launchpad) | Otonom agent tokenizasyonu + ACP | Base / Solana |
| 27 | **AIXBT** | Flagship | Ticari (Virtuals üzerinde) | Crypto-market istihbarat agent'ı | Ethereum |
| 28 | **Bankr** | Flagship | Ticari (Farcaster/Base) | Sohbetle on-chain trading agent'ı | Base |
| 29 | **Griffain** | Flagship | Ticari (Solana) | Otonom on-chain agent ağı | Solana |
| 30 | **Theoriq (ChainML)** | Flagship | Ticari ($13M+ raise) | AI agent swarm koordinasyon protokolü | Multi-chain |

🏆 = belirli bir track/ödül kazandı &nbsp;·&nbsp; (diğerleri "finalist" statüsünde)

---

# BÖLÜM 1 — Hackathon Finalist/Kazanan Agentic Projeleri

## 1.1 ETHGlobal New York 2025 — ASI Alliance Track (15–17 Ağustos 2025)

> ASI Alliance (Fetch.ai & SingularityNET) **$10.000** ödül havuzlu bir track düzenledi; ilk üç proje aşağıdadır. `[3-0]`
> Kaynak: [ASI Alliance recap](https://superintelligence.io/ethglobal-nyc-winners/) · [ETHGlobal prizes](https://ethglobal.com/events/newyork2025/prizes/artificial-superintelligence-alliance)

### 1. Etherius — 🏆 ASI Alliance 1.lik
- **Ne yapıyor:** AI destekli NFT istihbarat agent'ı; OpenSea verilerini doğal dil sorgularına bağlar ve x402 ödeme entegrasyonuyla otonom çalışır.
- **Takım:** Mikhail Vaysman (@mikwiseman)
- **Tech stack:** Fetch.ai uAgents, ASI:One Mini, OpenSea MCP, x402, Coinbase Programmable Wallets
- **Kaynaklar:** [ethglobal.com/showcase/etherius-hk782](https://ethglobal.com/showcase/etherius-hk782) · [ASI recap](https://superintelligence.io/ethglobal-nyc-winners/)
- **Güven:** `[3-0]`

### 2. MintCondition — 🏆 ASI Alliance 2.lik
- **Ne yapıyor:** Çoklu LLM ve **MeTTa sembolik akıl yürütme** ile çalışan multi-agent NFT değerleme sistemi.
- **Takım:** Alex Lu, Lindsay Zhang
- **Tech stack:** Fetch.ai agent'ları, MeTTa, çoklu LLM
- **Kaynak:** [ASI recap](https://superintelligence.io/ethglobal-nyc-winners/)
- **Güven:** `[3-0]`

### 3. Waterfall — 🏆 ASI Alliance 3.lük
- **Ne yapıyor:** Fetch.ai agent'larını OpenSea MCP sunucusuna bağlayıp Ocean Protocol ile smart-contract anchoring yapan veri yayını.
- **Takım:** Divyansh Goel, Dayitva Goel
- **Tech stack:** Fetch.ai agent'ları, OpenSea MCP, Ocean Protocol
- **Kaynak:** [ASI recap](https://superintelligence.io/ethglobal-nyc-winners/)
- **Güven:** `[3-0]`

---

## 1.2 Agentic Ethereum 2025 — 10 Finalist (Şubat 2025, online)

> ETHGlobal'ın **otonom AI agent'lara adanmış** hackathonu; **518 projeden** 10 finalist seçildi. Bu, Ethereum ekosisteminde agentic AI'ya ayrılmış bir hackathonun doğrudan kanıtıdır. `[3-0]`
> Kaynak: [ETHGlobal resmi tweet](https://x.com/ETHGlobal/status/1890448806975795550)
> *(Aşağıdaki 10 finalistin işlevsel detayları ethglobal.com/showcase birincil sayfalarından doğrulanmıştır.)*

### 4. AIMen — 🏆 Coinbase AgentKit Pool Prize
- **Ne yapıyor:** Doğal dil ("AIM" dili) ile yeniden kullanılabilir, onchain agentic iş akışları yazmayı sağlar; "Uniswap'te token filtrele" gibi komutları otonom blockchain workflow'larına çevirir (boilerplate ve vendor lock-in olmadan).
- **Takım:** microchipgnu (solo)
- **Tech stack:** EVM; AIM dili + AIMX CLI, Coinbase AgentKit, The Graph, Tailwind, fly.io
- **Kaynaklar:** [showcase/aimen-xp5ma](https://ethglobal.com/showcase/aimen-xp5ma) · [GitHub](https://github.com/microchipgnu/agentic-ethereum-aim)

### 5. Nimble — 🏆 Coinbase AgentKit Pool Prize
- **Ne yapıyor:** AI-agent tabanlı intent/solver ağı; auction mantığıyla en iyi swap fiyatını otonom bulur, ayrıca Morpho vault'larına otomatik yield optimizasyonu yapar.
- **Takım:** GitHub: PureBl00d
- **Tech stack:** Base (EVM); Coinbase AgentKit, CDP API, Morpho vaults, OpenAI API, Node.js
- **Kaynak:** [showcase/nimble-d5y6f](https://ethglobal.com/showcase/nimble-d5y6f)

### 6. SecretAgent — 🏆 "Best Combination of AgentKit & OnchainKit" + AgentKit Pool Prize
- **Ne yapıyor:** Crypto-native agent'lar için güvenli secret yönetimi; pay-as-you-go LLM key'leri ile agent kendi LLM erişiminin ücretini cüzdanından öder, proxy ile enjekte edilen secret'lar agent'a görünmez + merkezi izleme & "kill-switch".
- **Takım:** dmno-dev organizasyonu
- **Tech stack:** Base; Coinbase CDP OnchainKit/AgentKit, Privy, Autonome, Next.js, Cloudflare Workers, DMNO
- **Kaynaklar:** [showcase/secretagent-nkz1u](https://ethglobal.com/showcase/secretagent-nkz1u) · [GitHub](https://github.com/dmno-dev/secret-agent)

### 7. Smol Universe
- **Ne yapıyor:** Twitter kişilerinin AI klonlarıyla dolu dünya simülasyonu; her karakter kendi cüzdanına sahip, otonom tweet atıp seyahat eder, NFT mint'ler, iş bulur, para gönderir veya iflas eder.
- **Takım:** Javi Ezpeleta (@javitoshi)
- **Tech stack:** Base Sepolia; Hardhat, Ethers.js, Alchemy (gas sübvansiyonu), Google Gemini 2.0 Flash, Replicate, Next.js, Supabase
- **Kaynaklar:** [showcase/smol-universe-nqh0z](https://ethglobal.com/showcase/smol-universe-nqh0z) · [GitHub](https://github.com/JaviEzpeleta/smoluniverse-website)

### 8. Synapze — 🏆 AgentKit Pool Prize + EigenLayer "Eigen Agents" Prize
- **Ne yapıyor:** ElizaOS tabanlı agent'lar için "tek tıkla" hosting/deploy platformu; agent'ları anında online edip real-time izleme + onchain entegrasyon sağlar.
- **Takım:** GitHub: sekmet
- **Tech stack:** Coinbase AgentKit/OnchainKit, **EigenLayer SDK + AVS**, ElizaOS, TypeScript, Solidity + Rust, PostgreSQL
- **Kaynaklar:** [showcase/synapze-vijh5](https://ethglobal.com/showcase/synapze-vijh5) · [GitHub](https://github.com/sekmet/synapzeai)

### 9. bouncer.ai
- **Ne yapıyor:** AI "fedai" agent'larından oluşan token launchpad; otonom agent'lar her kullanıcıya sesli sorular sorup "vibe"/marka uyumunu gerçek zamanlı puanlayarak token alımını kısıtlar — bot, sniper ve bilgisiz spekülatörleri eler.
- **Takım:** GitHub: GiantDole
- **Tech stack:** Arbitrum (Foundry + linear bonding curve, Uniswap); LangChain ile paralel "Knowledge/Vibe/Question" agent'ları, Autonome, Next.js, Privy, Spline
- **Kaynaklar:** [showcase/bouncer-ai-1sd06](https://ethglobal.com/showcase/bouncer-ai-1sd06) · [GitHub](https://github.com/GiantDole/ethglobal_agent)

### 10. PvPvAI — 🏆 Nethermind "Create your Agentic Future" 3. + AgentKit Pool Prize
- **Ne yapıyor:** Agentic prediction market oyunu; oyuncular farklı kişilikli AI agent'lar yaratıp token'ları tartıştırır, başkaları kararlara bahis oynar. Konuşmalar "attack/mute/poison" aksiyonlarıyla etkilenebilir (PvP modu).
- **Takım:** GitHub org: agentic-2025
- **Tech stack:** Ethereum + Base + Arbitrum (Solidity/Foundry); Eliza tabanlı framework, Autonome, Coinbase AgentKit (oracle)
- **Kaynaklar:** [showcase/pvpvai-d66a8](https://ethglobal.com/showcase/pvpvai-d66a8) · [GitHub](https://github.com/agentic-2025/pvp-ai-contracts)

### 11. Shaman
- **Ne yapıyor:** "Onchain autopilot" — otonom AI agent'lar ("Shaman"lar) oluşturup deploy etme platformu; AI-oracle'lar agent'ın ürettiği TypeScript kodunu güvenli sandbox'ta çalıştırıp smart contract'lar ve API'lerle insan müdahalesi olmadan etkileşir.
- **Takım:** Interstation Research
- **Tech stack:** Arbitrum Sepolia; MUD (ECS World Contract + $ZUG token), Deno sandbox, IPFS/Filebase, Privy, Next.js
- **Kaynaklar:** [showcase/shaman-hyeav](https://ethglobal.com/showcase/shaman-hyeav) · [GitHub](https://github.com/Interstation-Research/shaman)

### 12. Streme.fun — 🏆 Autonome "Best Social Agent" 1.lik
- **Ne yapıyor:** Farcaster'da @streme agent'ı ile konuşarak token deploy ettirir; agent kullanıcının mesajı + profilinden token'ı Base'e otonom deploy eder. Token'lar Superfluid ile saniye-saniye "streamable" ve staking ödüllü.
- **Takım:** @leeknowlton, @mthacks
- **Tech stack:** Base Mainnet; Coinbase AgentKit + OpenAI, Autonome, Neynar (Farcaster), Superfluid, Uniswap v3, Privy, Next.js
- **Kaynaklar:** [showcase/streme-fun-4dppy](https://ethglobal.com/showcase/streme-fun-4dppy) · [GitHub](https://github.com/streme-fun)

### 13. YieldSeeker — 🏆 AgentKit Pool Prize (+ sonradan ETHGlobal "Spotlight")
- **Ne yapıyor:** Atıl USDC için en iyi DeFi getirisini avlayan AI agent'lı Base mini-app'i; lending vault'larını sürekli tarayıp pozisyonu kullanıcının risk toleransına göre en yüksek getiriye otomatik taşır.
- **Tech stack:** Base; Coinbase AgentKit (Docker + Autonome), AWS Bedrock LLM'leri, Morpho + Spark.fi, The Graph, proprietary risk skorlama
- **Kaynaklar:** [showcase/yieldseeker-crg12](https://ethglobal.com/showcase/yieldseeker-crg12) · [yieldseeker.xyz](https://www.yieldseeker.xyz/)
- **Güven (finalist statüsü):** `[3-0]`

---

## 1.3 ETHGlobal Cannes 2026 — Agentic Finalistler (3–5 Nisan 2026)

> Cannes 2026, **10 finalist** açıkladı: ENShell, DIVE, maki, Défi, ALMA, npmguard, VEIL VPN, PaintGlobal, EVM PORST, Corpus. `[3-0]`
> Kaynak: [crypto.news Cannes 2026](https://crypto.news/ai-agents-privacy-and-prediction-markets-define-ethglobal-cannes-2026-finalists/) · [ETHGlobal tweet](https://x.com/ETHGlobal/status/2040805013937877297)
> **Önemli not:** 10 finalistin yalnızca **6'sı gerçekten agentic AI**'dır (aşağıda). Kalan 4'ü (Défi, VEIL VPN, PaintGlobal, EVM PORST) agentic değildir — bölüm sonunda kısaca listelenmiştir. Finalist detayları ethglobal.com/showcase'ten doğrulandı.

### 14. DIVE
- **Ne yapıyor:** "Decentralized Intelligence Verification Engine" — tahmin piyasaları için gerçek-dünya gerçeğini doğrulayan **AI swarm (sürü) oracle**; her sonuç, World ID ile benzersiz insana bağlı (Sybil-dirençli) rastgele AI agent komitesi tarafından commit-reveal oylamayla %70 konsensüsle çözülür.
- **Takım:** @derek2403, @avoisavo, @cedricctf11a, @ilovetofupeach
- **Ödüller:** 🏆 World "Best use of Minikit 2.0" (1.) + Hedera "AI & Agentic Payments" + 0G "Best OpenClaw Agent" (2.)
- **Tech stack:** "No-Solidity"; 0G Network (OpenClaw, iNFT/ERC-7857, 0G Compute TEE), Hedera (HTS, HCS), World ID 4.0 + World Agent Kit
- **Kaynaklar:** [showcase/dive-5hxbp](https://ethglobal.com/showcase/dive-5hxbp) · [GitHub](https://github.com/derek2403/cannes2026)
- **Güven (finalist):** `[3-0]` (deep-research'te işlev tanımı `[2-1]`, sonradan birincil kaynaktan teyit edildi)

### 15. ENShell — 🏆 Chainlink "Best workflow with Chainlink CRE"
- **Ne yapıyor:** AI agent'ların prompt injection saldırıları nedeniyle kötü niyetli işlem yürütmesini engelleyen **on-chain "firewall"**; agent niyeti ile blockchain yürütmesi arasına oturur, her işlem 4 katmandan (Encrypt → Queue → Analyze → Human-in-the-Loop) geçer. Güven skoru ve "strike" sayısı ENS TXT kayıtlarında tutulur.
- **Takım:** @CodeQuillClaim (basında); GitHub org: 0xenshell
- **Tech stack:** Sepolia, Solidity, Chainlink CRE (WebAssembly), ENS (NameWrapper/ERC1155), ECIES, Claude, ERC-7730 clear-signing
- **Kaynaklar:** [showcase/enshell-6t95y](https://ethglobal.com/showcase/enshell-6t95y) · [enshell.xyz](https://enshell.xyz)
- **Doğrulama notu:** Deep-research'te bir secondary-source açıklaması reddedildi `[0-3]` (yanlış "ENS prize track" detayı içeriyordu); birincil showcase fetch'i doğru açıklamayı (Chainlink CRE ödülü) teyit etti.

### 16. maki
- **Ne yapıyor:** On-chain DeFi için AI agent; private key'ler donanımda kilitli ve modelin erişemeyeceği şekilde izole. LLM niyeti yorumlar, hassas işlemleri deterministik yerel kod yürütür; her işlem imzadan önce simüle edilip policy + insan onayından geçer.
- **Takım:** Showcase'de listelenmemiş
- **Tech stack:** TypeScript, viem, ERC-4337, World AgentKit, **Apple Secure Enclave**, Ledger, Uniswap Trading API; Sepolia
- **Kaynak:** [showcase/maki-564eg](https://ethglobal.com/showcase/maki-564eg)

### 17. ALMA — 🏆 Uniswap Foundation "Best Uniswap API Integration" (3.)
- **Ne yapıyor:** "Autonomous Liquidity Management Agent" — Uniswap V4 konsantre likidite pozisyonları için tam otonom rebalancing agent'ı; pozisyon range dışına çıkınca tek atomik batch'te burn → swap → mint döngüsünü yürütür (kullanıcı yalnızca bir kez EIP-712 imzalar).
- **Takım:** @berkani4_yanis, @0xcs361
- **Tech stack:** Base; Uniswap Trading API, Calibur (EIP-7702), V4 SDK, Permit2, The Graph, Express+TS, Next.js
- **Kaynaklar:** [showcase/alma-07pzd](https://ethglobal.com/showcase/alma-07pzd) · [GitHub](https://github.com/yanisepfl/alma)

### 18. npmguard — 🏆 ENS "Most Creative Use of ENS" (3.)
- **Ne yapıyor:** Kötü niyetli npm paketlerine karşı otonom güvenlik platformu; yeni paket sürümünü çekip çok-adımlı AI denetim hattından (yapısal analiz, LLM risk skoru, agentic araştırma, Docker-sandbox exploit testi) geçirir, sonucu ENS alt adları + IPFS'te on-chain yayınlar.
- **Takım:** GitHub: kryczkal
- **Tech stack:** Sepolia (ENS) + 0G Galileo testnet; Gemini 2.5 Flash, TypeScript/Hono, Docker sandbox, IPFS/Pinata, Chainlink CRE (5dk cron)
- **Kaynak:** [showcase/npmguard-aeihd](https://ethglobal.com/showcase/npmguard-aeihd)

### 19. Corpus
- **Ne yapıyor:** Herhangi bir ürünü, senin için GTM (go-to-market) yürüten, ticaret yapan ve kazanç sağlayan **tam otonom "AI agent şirketi"**ne dönüştürür; bir "Prime Agent" deploy edilir, pazar araştırması + GTM + satış yürütür. Her Corpus tokenize varlık; agent'lar x402 USDC mikroödemelerle birbirinden hizmet alır.
- **Takım:** GitHub: spock-mark1
- **Tech stack:** Hedera (HTS, CorpusRegistry), Circle Developer-Controlled Wallets + Arc + Nanopayments (x402), World ID, Next.js, Stagehand+Chrome, OpenAI function-calling (31 araç)
- **Kaynaklar:** [showcase/corpus-j7an5](https://ethglobal.com/showcase/corpus-j7an5) · [demo](https://corpus-protocol-web.vercel.app/)
- **Doğrulama notu:** Deep-research adversarial doğrulamada bu açıklamayı bir secondary kaynaktan reddetti `[0-3]`; birincil showcase fetch'i açıklamayı teyit etti. Çelişki şeffaflık için belirtilmiştir.

> **Cannes 2026'nın agentic OLMAYAN 4 finalisti** (tamlık için): **Défi** (oyunlaştırılmış 1v1 DeFi trading dApp'i), **VEIL VPN** (TEE tabanlı gizlilik/VPN protokolü — 🏆 World ID + Arc + ENS ödülleri), **PaintGlobal** (NFC + NFT sanat/açık artırma platformu), **EVM PORST** (post-quantum kriptografi primitifi). Bunlar AI agent'ı merkeze almadığı için ana sayımın dışındadır.

---

## 1.4 ETHDenver 2026 (17–21 Şubat 2026)

> ETHDenver 2026'da **AI × crypto baskın temaydı**; etkinlik bir DeFi buluşmasından çok bir AI expo'ya benziyordu (Futurllama track'leri, Sentient'ın Open AGI Summit'i, robotik projeler). Jüri AI+crypto'yu kitlesel kullanıma çeviren projeleri ödüllendirdi. `[3-0]`
> Kaynaklar: [crypto.news ETHDenver 2026](https://crypto.news/ethdenver-2026-fewer-side-events-more-ai-agents-and-builder-focus/) · [WuBlockchain gözlemleri](https://wublock.substack.com/p/ethdenver-2026-observations-side)

### 20. Agent Colony — 🏆 Kite AI bounty track 3.lük
- **Ne yapıyor:** Kite AI'nın "agent-yerel ödeme & kimlik, x402-destekli" bounty track'inde 3. olan agentic proje (otonom agent'lar arası ödeme/kimlik üzerine).
- **Bağlam:** Kite AI ETHDenver 2026 bounty ($10K partner track)
- **Tech stack:** Kite L1, x402
- **Kaynaklar:** [Devfolio (Kite AI)](https://ethdenver2026.devfolio.co/prizes?partner=Kite+AI) · [Kite AI YouTube](https://www.youtube.com/watch?v=pPMa0JN4d64)
- **Güven:** `[2-1]` (sağlam ama oybirliği değil; jüri/ödül kaydı YouTube + Devfolio'dan)

> **Diğer ETHDenver 2026 dikkat çekenleri** (jüri ödüllü, isim belirsiz): bahşiş-teşvikli bir "AI girlfriend" agent'ı ve **zincir-üstü validator'larla görev tamamlamayı kanıtlayan bir AI-agent reklam protokolü** (Base sponsor 3.lük, geliştirici "Justin"). `[3-0 tema]`

---

# BÖLÜM 2 — Flagship / Ticari Agentic Crypto Projeleri

> Bunlar hackathon çıktısı değil, ana-ağda canlı (veya kurumsal fonlamalı) ticari agentic crypto projeleridir.

### 21. Giza — ARMA
- **Ne yapıyor:** Otonom AI agent'ların piyasaları analiz etmesini, strateji yürütmesini ve DeFi'de likidite yönetmesini sağlayan altyapı. Amiral gemisi **ARMA**, "Base'in akıllı tasarruf hesabı" olarak tanımlanan bir **stablecoin yield agent'ı**; lending protokollerini izleyip faiz-oranı kaymalarını tespit ederek sermayeyi otonom en yüksek getiriye taşır (Aave, Morpho, Compound, Moonwell).
- **Bağlam:** Ticari (Base ana-ağ); ARMA Ocak 2025'te lanse edildi. Re7 Capital gibi kurumsal kullanım örnekleri raporlandı.
- **Zincir/Tech stack:** Base; periyodik APR taraması ("Smart Strategy Scheduling")
- **Traction:** Finbold'a göre **~$3.96B agentic hacim** (Mart 2026), 7.000+ agent, $300K+ kullanıcı varlığı, 10.000+ işlem; diğer ölçümlerde 60.000+ ARMA agent, $40M+ AUA, 800k+ işlem.
- **Kaynaklar:** [gizatech.xyz](https://www.gizatech.xyz/) · [Chainwire (ARMA lansman)](https://chainwire.org/2025/01/29/gizas-arma-breaks-new-ground-on-base-with-advanced-defi-automation/) · [Chainwire (Re7 Capital kurumsal)](https://chainwire.org/2025/05/29/giza-agents-go-institutional-re7-capital-embraces-self-driving-capital-for-defi-treasury-management/)
- **Güven:** Kategori `[3-0]`; "her lending protokolü"/"gerçek zamanlı" mutlakları `[2-1]`; traction rakamları **`[medium]`** (kaynaklar arası tutarsız, kısmen self-reported).

### 22. Olas (Autonolas)
- **Ne yapıyor:** Kullanıcıların kendi AI agent'larını sahiplenip (tahmin, portföy yönetimi vb.) gelir elde etmesini sağlayan platform. Amiral gemisi tüketici uygulaması **Pearl** "AI Agent App-Store"; ayrıca **Mech Marketplace** adlı, agent'ların beceri sunup başka agent'ların hizmetini kiraladığı merkeziyetsiz **agent-to-agent pazaryeri**.
- **Bağlam:** Ticari, çok-zincirli (8 zincir). Pearl'ü başlatmak için **$13.8M** topladı (1kx liderliğinde; Tioga, Sigil, Zee Prime, Spaceship DAO).
- **Traction (on-chain, doğrulanabilir):** **3.643 agent deploy**, 530 günlük aktif agent, **17.492.536 toplam işlem**, 12.823.809 agent-to-agent işlem (The Graph subgraph'ları + public GraphQL ile doğrulanabilir metodoloji).
- **Kaynaklar:** [olas.network](https://olas.network/) · [Mech Marketplace](https://olas.network/mech-marketplace) · [olas.network/data (metodoloji)](https://olas.network/data) · [SiliconANGLE](https://siliconangle.com)
- **Güven:** `[3-0]` (hem platform tanımı hem on-chain traction).

### 23. Wayfinder
- **Ne yapıyor:** Otonom agent'ların blockchain'lerde gezinmesini, işlem yürütmesini ve zincir-üstü durumu okumasını **Paths** ve **Shells** primitifleriyle sağlayan **omnichain AI agent protokolü** ("self-driving wallet").
- **Bağlam:** Ticari; **Parallel Studios** (Parallel TCG + Echelon Prime ekosistemi) tarafından kuruldu.
- **Token (PROMPT):** üç işlev — (1) premium agent erişimi, (2) Path doğrulamasını güvenceye alan staking (kötü Path'ler için slashing), (3) PRIME token ile Echelon Prime koordinasyonu (arz payı PRIME holder'ları/Parallel oyuncularına airdrop edildi).
- **Kaynaklar:** [DEXTools guide](https://www.dextools.io/tutorials/what-is-wayfinder-prompt-ai-agent-omnichain-protocol-guide-2026) · [Bankless](https://bankless.com/read/wayfinder-prompt-token) · [Tiger Research](https://reports.tiger-research.com/p/wayfinder-eng)
- **Güven:** Protokol/token tanımı `[3-0]`. ⚠️ Spesifik **zincir/roadmap listesi** (Ethereum/Base/Arbitrum/Optimism + Solana/Cosmos) iddiası **reddedildi** `[0-3]` — "omnichain" tanımı doğru, ama o spesifik liste doğrulanamadı.

### 24. Almanak
- **Ne yapıyor:** DeFi smart-agent platformu (AI-destekli DeFi stratejileri).
- **Bağlam:** Ticari; **$8.45M** topladı (tur ~17 Ağustos 2025 kapandı).
- **Yatırımcılar:** Delphi Labs, HashKey Capital, NEAR Foundation (+ BanklessVC, RockawayX, Matrix Partners, AppWorks, Sparkle VC, Shima Capital).
- **Kaynaklar:** [ainvest.com](https://www.ainvest.com/news/almanak-secures-8-45m-accelerate-ai-driven-defi-strategies-2508/) · [PANews](https://www.panewslab.com/en/articles/0a96aec3-8f50-4de0-bd4b-9dacb7237d1a)
- **Güven:** Fonlama `[3-0]`. *(Not: ürün/agent işlevsel detayı bağımsız doğrulanmadı — yalnızca fonlama teyitli.)*

### 25. Fetch.ai (ASI Alliance)
- **Ne yapıyor:** Otonom yazılım agent'larının bağımsız karar alıp görev yürüttüğü platform; agent'lar insan müdahalesi olmadan müzakere edip işlem yapar. **uAgents** (geliştirme framework'ü), **Agentverse** (agent pazaryeri/keşif), **ASI:One** (Web3-yerel LLM).
- **Bağlam:** Ticari; 2024'te Fetch.ai + SingularityNET + Cudos → **Artificial Superintelligence Alliance (ASI)** ve birleşik $ASI (eski FET) tokeni. (Ekim 2025'te Ocean Protocol ittifaktan ayrıldı.)
- **Takım:** Fetch.ai (CEO Humayun Sheikh)
- **Traction:** Market cap ~**$617M** (~#79, CMC). Agentverse 2025 sonu ~2.7M kayıtlı agent, ~160M agent-mesajı (bağımsız kaynak — resmi doküman agent sayısı vermiyor).
- **Kaynaklar:** [docs.agentverse.ai](https://docs.agentverse.ai/documentation/getting-started/agentverse-marketplace) · [CoinMarketCap](https://coinmarketcap.com/currencies/artificial-superintelligence-alliance/)

### 26. Virtuals Protocol
- **Ne yapıyor:** Otonom AI agent'larını tokenize eden en büyük merkeziyetsiz **launchpad** ("AI agent'lar için Shopify"). Agent'lar **GAME** framework'ü ile otonom plan yapar; **ACP** (Agent Commerce Protocol) ile agent'lar birbirini keşfedip kiralayıp on-chain ödeme yapar.
- **Bağlam:** Ticari (PathDAO'dan Ocak 2024'te pivot).
- **Takım:** Jansen Teng (CEO), Weekee Tiew
- **Zincir/Tech stack:** Base (ana), Ethereum, Solana, Ronin, Arbitrum; GAME (Goal-Action-Mind-Engine); Llama 3.3 / DeepSeek / Qwen modelleri; ACP pazaryeri
- **Traction:** Market cap ~**$488M** (~#110). **18.000+** tokenize agent deploy edildi. Tarihsel zirve: >$4.5–5B (Ocak 2025).
- **Kaynaklar:** [virtuals.io](https://www.virtuals.io/) · [whitepaper](https://whitepaper.virtuals.io/about-virtuals/agent-tokenization-platform) · [CoinGecko](https://www.coingecko.com/en/coins/virtual-protocol)

### 27. AIXBT
- **Ne yapıyor:** Virtuals üzerinde çalışan gerçek-zamanlı **crypto-market istihbarat agent'ı**; Crypto Twitter tartışmalarını + sosyal sinyaller, market göstergeleri, haber ve on-chain analitiği analiz ederek yüksek-momentumlu fırsatları erken tespit eder; X'te otonom "influencer" agent olarak içerik üretir.
- **Bağlam:** Ticari; Virtuals ekosisteminde Kasım 2024'te lanse edildi.
- **Zincir:** Ethereum (kontrat); Virtuals altyapısı
- **Traction:** Market cap ~**$28.7M** (~#635). Tarihsel ATH ~$800M (16 Oca 2025); ~$115.7M (9 Eyl 2025, top-5 Virtuals agent tokeni).
- **Kaynaklar:** [CoinMarketCap](https://coinmarketcap.com/currencies/aixbt/) · [Messari profil](https://messari.io/project/aixbt-by-virtuals)
- **Not:** Bağımsız kurucu/ekip ismi ve takipçi sayısı **doğrulanamadı**.

### 28. Bankr
- **Ne yapıyor:** Doğal-dil sohbet komutlarıyla on-chain trading yapan AI agent'ı; "@bankrbot buy $100 ETH" gibi Farcaster/X mesajıyla tüm on-chain işlemleri, cüzdan yetkilendirmelerini ve routing'i halleder.
- **Bağlam:** Ticari; $BNKR token Farcaster'da agent tarafından fair-launch ile çıkarıldı.
- **Zincir:** Base (birincil); bazı kaynaklar Solana/Polygon da bildiriyor (**kısmen doğrulanamadı**). x402 ödeme protokolü.
- **Traction:** 2026'da **217.000+** holder; BNKR 24s hacim ~$21M+.
- **Kaynaklar:** [bankr.bot](https://bankr.bot/) · [KuCoin analiz](https://www.kucoin.com/news/articles/a-deep-dive-into-the-ai-agent-bankr-and-its-ecosystem-token-bankrcoin-bnkr)
- **Not:** Kurucu/şirket ismi ve raise **doğrulanamadı** (fair launch).

### 29. Griffain
- **Ne yapıyor:** Solana üzerinde otonom AI agent ağı / "Agent Engine"; doğal dil komutlarını on-chain işlemlere çevirip cüzdan yönetimi, token trading, NFT mint, DeFi strateji yürütür. Kullanıcılar kendi Personal Agent'larını deploy edebilir (Agent Baxus, GM, Sniper gibi hazır agent'lar).
- **Bağlam:** Ticari (Kasım 2024 lansman); köken olarak bir Solana hackathon'unda doğdu, sonra ana-ağ ürününe dönüştü; Anatoly Yakovenko desteği.
- **Takım:** Kurucu Tony Plasencia (ekibin kalanı kısmen anonim)
- **Traction:** Market cap **$280M+**, günlük hacim **$40M+**; Aralık 2024'te ~$274M ile 2. en büyük AI agent launchpad; 1M+ otomatik işlem.
- **Kaynaklar:** [griffain.com](https://griffain.com/) · [Solana Compass](https://solanacompass.com/projects/griffain)
- **Not:** VC raise **doğrulanamadı**.

### 30. Theoriq (ChainML)
- **Ne yapıyor:** AI agent **swarm**'larını koordine eden merkeziyetsiz protokol; agent'lar/swarm'lar işbirliğiyle on-chain likidite sağlama, yield optimizasyonu gibi finansal görevleri otonom yürütür ("Agentic Economy"/DeFAI).
- **Bağlam:** Ticari altyapı; ChainML (2022), Theoriq onun "agentic base layer"ı.
- **Takım/Yatırımcılar:** ChainML, CEO Ron Bodkin; Hack VC (lead), Chainlink, IOSG, HashKey, Foresight, HTX Ventures vb.
- **Traction/Fonlama:** ~**$13.2M** toplam — $4M Seed (2022), $6.2M Seed+ (Mayıs 2024), ~$3M public sale (Ağustos 2025) @ ~$75M valuation.
- **Kaynaklar:** [theoriq.ai](https://www.theoriq.ai/) · [crypto-fundraising.info](https://crypto-fundraising.info/projects/chainml/)
- **Not:** Public-sale tutarı kaynaklar arası tutarsız ($2M↔$3M) — **kısmen doğrulanamadı**.

---

# BÖLÜM 3 — Hackathon Ekosistemi & Kurumsal Sponsorluk

Agentic builder'lara kurumsal sponsorluk, bu dönemin yapısal hikâyesidir:

- **Hedera** — ETHDenver 2025'te toplam $50.000 ödüllü üç track'ten biri "AI & Agents"ti; **$25.000 ile en büyük tek track** oldu ve Hedera bir Agent Kit SDK tanıttı. `[3-0]` ([Hedera blog](https://hedera.com/blog/announcing-the-winners-of-eth-denver-2025-hedera-bounties/))
- **ASI Alliance (Fetch.ai + SingularityNET)** — ETHGlobal **New York 2025** ($10K) ve **New Delhi 2025** ($10K, 26–28 Eyl) track'leri; uAgents, Agentverse, ASI:One, MeTTa gerektiriyordu. `[3-0]` ([New Delhi kazananlar](https://community.superintelligence.io/t/meet-the-winners-ethglobal-new-delhi-with-fetch-ai-and-singularitynet/123) · [Fetch.ai etkinlik](https://fetch.ai/events/eth-global-new-delhi))
- **Kite AI** — **Kite AI Global Hackathon 2026** (Encode Club ile, ~27 Mart–26 Nisan 2026); üç track: Agentic Commerce, Agentic Trading & Portfolio Management, Novel. Kite, "otonom agent'lar için kimlik, ödeme, yönetişim ve doğrulamayı zincir-üstü sunan" L1 olarak konumlanıyor; Coinbase Ventures fonlamalı. Ayrıca ETHDenver 2026 bounty track'i (Agent Colony 3.lük). `[3-0]` ([Encode Club](https://www.encodeclub.com/programmes/kites-hackathon-ai-agentic-economy))

---

## Doğrulama Metodolojisi & Caveat'lar

**İstatistikler (deep-research):** 5 açı · 21 kaynak fetch · 98 iddia çıkarıldı · 25 iddia doğrulandı · **22 onaylandı, 3 reddedildi** · 103 agent çağrısı · ~2M token · ~23 dk.

**Reddedilen iddialar (şeffaflık için):**
1. ❌ ENShell'in "ENS prize track ($4.000 / Best ENS Integration for AI Agents)" detayı `[0-3]` — yanlış; ENShell gerçekte **Chainlink CRE** ödülü kazandı (birincil kaynaktan düzeltildi).
2. ❌ Corpus'un "otonom AI agent şirketi" tanımı bir secondary kaynaktan `[0-3]` reddedildi — ancak birincil **ethglobal.com/showcase** sayfası bu açıklamayı teyit etti (çelişki yukarıda belirtildi).
3. ❌ Wayfinder'ın spesifik zincir/roadmap listesi (Ethereum/Base/Arbitrum/Optimism + Solana/Cosmos) `[0-3]` — "omnichain" tanımı doğru, ama o liste doğrulanamadı.

**`[2-1]` (sağlam ama oybirliği olmayan) iddialar:** Giza ARMA'nın "her lending protokolü"/"gerçek zamanlı" mutlakları; Agent Colony ETHDenver 2026 3.lük; DIVE'ın işlev tanımı (sonradan birincil kaynaktan teyit).

**Kaynak kalitesi:** Bazı şirket tanımları (Giza, Olas, Wayfinder ana sayfaları) marketing copy'sidir; temel olgular bağımsız gazetecilik (CoinDesk, SiliconANGLE, The Block, crypto.news) veya doğrulanabilir on-chain metodolojiyle (Olas/data) teyit edildi. Bazı birincil URL'ler JS-render nedeniyle yalnızca başlık döndürdü; doğrulama organizatör X/LinkedIn postlarına ve arama-motoru çıkarımlarına dayandı.

**Tarih nüansları:** ETHGlobal NYC bir kaynakta 15–18, resmi takvimde 15–17 Ağustos 2025 (önemsiz). **Cannes'da 2025 (Temmuz) ve 2026 (Nisan) etkinlikleri ayrıdır** — finalist listeleri karıştırılmamalıdır; bu rapordaki liste 2026'ya aittir.

---

## Açık Sorular (Daha Derin Araştırma İçin)

1. **Hackathon → ürünleşme:** Etherius, MintCondition, Waterfall, DIVE, Agent Colony gibi kazananlardan herhangi biri hackathon sonrası fonlama aldı veya ana-ağ traction'ı kazandı mı? (Yalnızca hackathon sonuçları doğrulandı.)
2. **Almanak ürünü:** Almanak'ın yalnızca fonlaması doğrulandı; agent ürün/işlevsel mimarisi ayrıca araştırılmalı.
3. **ETHDenver 2026 isimli kazananlar:** "AI girlfriend" ve "AI-agent reklam protokolü" gibi tema-düzeyinde geçen projelerin tam isim/takım/stack detayları.
4. **Diğer 2025–2026 ETHGlobal etkinlikleri:** Taipei, Bangkok, Brussels gibi etkinliklerdeki agentic finalistler bu turda öne çıkmadı — ayrı bir derinleşme gerektirir.

---

## Kaynakça (Birincil & İkincil)

**Hackathon — birincil:**
- ETHGlobal resmi tweet (Agentic ETH 2025 finalistleri): https://x.com/ETHGlobal/status/1890448806975795550
- ASI Alliance NYC kazananlar: https://superintelligence.io/ethglobal-nyc-winners/
- ASI Alliance New Delhi kazananlar: https://community.superintelligence.io/t/meet-the-winners-ethglobal-new-delhi-with-fetch-ai-and-singularitynet/123
- ETHGlobal Cannes 2026 duyuru tweet: https://x.com/ETHGlobal/status/2040805013937877297
- ethglobal.com/showcase (her finalist proje sayfası — yukarıda link verildi)
- Hedera ETHDenver 2025 bounty kazananları: https://hedera.com/blog/announcing-the-winners-of-eth-denver-2025-hedera-bounties/
- Encode Club / Kite AI Hackathon 2026: https://www.encodeclub.com/programmes/kites-hackathon-ai-agentic-economy

**Hackathon — ikincil/gazetecilik:**
- crypto.news (Cannes 2026 finalistleri): https://crypto.news/ai-agents-privacy-and-prediction-markets-define-ethglobal-cannes-2026-finalists/
- crypto.news (ETHDenver 2026): https://crypto.news/ethdenver-2026-fewer-side-events-more-ai-agents-and-builder-focus/
- WuBlockchain (ETHDenver 2026 gözlemleri): https://wublock.substack.com/p/ethdenver-2026-observations-side

**Flagship projeler:**
- Giza: https://www.gizatech.xyz/ · https://chainwire.org/2025/01/29/gizas-arma-breaks-new-ground-on-base-with-advanced-defi-automation/
- Olas: https://olas.network/ · https://olas.network/data
- Wayfinder: https://reports.tiger-research.com/p/wayfinder-eng · https://bankless.com/read/wayfinder-prompt-token
- Almanak: https://www.ainvest.com/news/almanak-secures-8-45m-accelerate-ai-driven-defi-strategies-2508/
- Fetch.ai: https://docs.agentverse.ai/ · https://coinmarketcap.com/currencies/artificial-superintelligence-alliance/
- Virtuals: https://www.virtuals.io/ · https://www.coingecko.com/en/coins/virtual-protocol
- AIXBT: https://coinmarketcap.com/currencies/aixbt/
- Bankr: https://bankr.bot/
- Griffain: https://griffain.com/ · https://solanacompass.com/projects/griffain
- Theoriq: https://www.theoriq.ai/ · https://crypto-fundraising.info/projects/chainml/
- Sektör genel bakış: https://www.theblock.co/post/344635/research-ai-agent-sector-overview · https://www.dwf-labs.com/research/462-the-rise-of-virtual-consciousness-15-top-ai-agent-projects-to-watch

---

*Rapor, çok-agent'lı deep-research harness (103 agent, adversarial doğrulama) + 3 paralel birincil-kaynak zenginleştirme agent'ı ile üretildi. Güven etiketleri ve "doğrulanamadı" işaretleri korunmuştur — kritik kararlar için işaretli kaynakları doğrudan teyit edin.*
