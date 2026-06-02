# YieldSeeker · Çoklu Yield Kaynağı (read-side) + DeFindex — Tasarım Spec'i

- **Tarih:** 2026-06-02
- **Durum:** Tasarım onaylandı; implementation plan'a (writing-plans) geçilecek
- **Bağlam kaynağı:** Deep-research raporu (Stellar yield kaynakları, 25 kaynak / 25 çapraz-doğrulanmış iddia) + mevcut kod haritası
- **İlgili spec:** `2026-06-02-yieldseeker-stellar-mvp-design.md` (bu, oradaki §2 "gerekirse +DeFindex" notunun hayata geçirilmesidir)

---

## 1. Amaç & Özet

Bugün YieldSeeker tek yield kaynağı olarak **Blend**'i kullanıyor ve Blend, scanner/discovery/executor içinde **hardcoded**. Amaç: yield kaynaklarını bir arayüz arkasına alıp **ikinci bir kaynak (DeFindex)** eklemek; böylece agent, farklı protokollerin getirilerini tek bir karşılaştırmada görüp seçebilsin.

**Kapsam (onaylandı): sadece TARAMA.** DeFindex vault'ları mainnet'te okunur ve scan/karşılaştırmaya katılır. **İşlem (deposit/withdraw) yine testnet Blend pool'unda kalır** — `executor` değişmez, "gerçek para yok" demo modeli korunur. Soyutlama yalnızca **okuma (read-side)** tarafındadır.

## 2. Hedefler / Hedef-Olmayanlar

**Hedefler:**
- `YieldSource` arayüzü: her protokol kendi native okumasını yapıp normalize `PoolYield` döner.
- Blend, davranışı **birebir korunarak** bu arayüzün arkasına alınır (mevcut testler yeşil kalır).
- DeFindex ikinci bir **tarama kaynağı** olarak eklenir (mainnet vault APY/TVL).
- `PoolYield` satırları `protocol` ile etiketlenir.
- Geriye tam uyumluluk: DeFindex config'i boşsa sistem bugünküyle aynı davranır.

**Hedef DEĞİL:**
- DeFindex'e gerçek deposit/withdraw (executor değişmez; mainnet imzalama / gerçek para yok).
- `executor`, `agent`, `orchestrator`, `wallet`, Blend `discovery` refactor'u.
- AMM kaynakları (Soroswap/Aquarius), liquid staking — sonraki fazlar.
- Frontend'de `protocol` rozeti gösterimi (opsiyonel, kapsam dışı).

## 3. Mimari (Yaklaşım A) ve neden

**Yaklaşım A — `YieldSource` arayüzü (seçildi):** Her protokol kendi okuma mantığının sahibi; çıktısı zaten protokol-nötr olan `PoolYield`. Scanner bir kaynak listesi üzerinde döner.

Reddedilen alternatifler:
- **B (ayrı scanner fonksiyonları + runtime'da concat):** Daha az soyutlama; kaynak arttıkça runtime dağılır.
- **C (mevcut `RawReserve`/`BlendReader` kalıbına DeFindex'i sok):** `RawReserve` Blend-spesifik (`supplyApr`, `utilization`); bir vault'a doğal uymaz, yanlış soyutlama.

```
scan ─┬─ blendSource.readPool   × (discovered Blend ids)      [mainnet, read-only]
      └─ defindexSource.readPool × (config vault ids)         [mainnet, read-only]
        → PoolYield[] (protocol etiketli) → scorePools → agent → execute (TESTNET Blend, DEĞİŞMEZ)
```

## 4. Bileşenler & Değişiklikler

| Dosya | Değişiklik | Sorumluluk |
|------|-----------|-----------|
| `src/lib/types.ts` | `PoolYield`'a `protocol: string`; yeni `YieldSource` arayüzü | Tipler |
| `src/lib/scanner.ts` | `scanYields(reader, ids)` → `scanSource(source, ids)`; `createBlendReader` korunur, üstüne `createBlendSource(): YieldSource` sarmalar (`RawReserve→PoolYield` eşlemesi buraya, `protocol:"blend"`) | Blend okuma + normalize |
| `src/lib/defindex.ts` (yeni) | `createDefindexSource(): YieldSource` — vault getter'larını `simulateTransaction` ile oku, `scValToNative` decode, `PoolYield`'a map (`protocol:"defindex"`) | DeFindex okuma |
| `src/lib/config.ts` | `SCAN_DEFINDEX_VAULT_IDS` (opsiyonel, boş=atla); RPC/passphrase scan tarafından gelir | Konfig |
| `src/lib/runtime.ts` | Scan adımı iki kaynağı okuyup birleştirir; `scorePools`'a verir | Kablolama |
| `src/lib/risk.ts` | Vault fairness dokunuşu (§8) | Risk skoru |

**Dokunulmayanlar:** `agent.ts`, `orchestrator.ts`, `executor.ts`, `wallet.ts`, `discovery.ts` (Blend keşfi), DB şeması, frontend.

## 5. Tip Değişiklikleri

```typescript
export interface PoolYield {
  protocol: string;        // YENİ: "blend" | "defindex"
  poolId: string;          // pool / vault contract id
  name: string;
  asset: "USDC";
  apyBps: number;
  tvlUsdc: bigint;
  utilizationBps: number;  // utilization kavramı olmayan kaynaklar için türetilir/0 (§8)
  oracleHealthy: boolean;
}

// Bir yield kaynağı = tek protokolün adaptörü; normalize PoolYield üretir.
export interface YieldSource {
  readonly protocol: string;
  /** Tek pool/vault'u oku → normalize PoolYield, okunamazsa null. */
  readPool(poolId: string): Promise<PoolYield | null>;
}
```

`ScoredPool extends PoolYield` olduğundan `protocol` otomatik akar; `serialize.ts` string alan olduğu için ek dönüşüm gerektirmez (yalnızca yeni alanın taşındığı teyit edilir).

## 6. Veri Akışı (runtime tick)

1. `scan` adımı pool id kümelerini toplar: Blend = mevcut `rt.poolIds` (discovery) || fallback; DeFindex = `cfg.scanDefindexVaultIds`.
2. Her kaynak için `scanSource(source, ids)` → `PoolYield[]` (hatalı id atlanır).
3. Sonuçlar birleştirilir → `scorePools(all, tolerance)` → `rt.lastScan`.
4. Kalan akış (agent decide → execute → DB) **değişmez**. Execute yine `rt.cfg.execPoolId` (testnet Blend).

## 7. Config Değişiklikleri

- Yeni: `SCAN_DEFINDEX_VAULT_IDS` (virgülle ayrılmış vault contract id'leri; **opsiyonel**, default boş).
- `parseConfig` → `scanDefindexVaultIds: string[]` (boşsa `[]`).
- Boş liste ⇒ DeFindex kaynağı hiç okunmaz ⇒ mevcut `.env`'ler **dokunulmadan** çalışır.
- `.env.example` güncellenir (yorum + örnek USDC vault id; entegrasyon anında `paltalabs/defindex` `mainnet.contracts.json`'dan re-validate edilir).

## 8. risk.ts Fairness Notu

`risk.ts` utilization'ı baskın faktör (~%70) olarak kullanıyor. Vault'ta utilization kavramı yok; `utilizationBps=0` verilirse vault haksız "düşük riskli" çıkar.

**Karar:** DeFindex vault'unun riski, **underlying Blend pool'unun utilization'ını yansıtmalı** (DeFindex USDC vault → Blend fixed pool). Faz 2 spike'ı underlying'i okuyabiliyorsa `utilizationBps` oradan türetilir; okunamıyorsa konservatif bir default uygulanır (vault'u yapay olarak "en güvenli" göstermeyecek şekilde). `risk.ts` generic kalır; protokol-spesifik mantık kaynak adaptörüne girer.

## 9. Hata Yönetimi

- Her `readPool` try/catch; okunamayan pool/vault atlanır (mevcut `scanYields` davranışı korunur).
- DeFindex tümüyle erişilemezse scan Blend'le sorunsuz devam eder (kaynak izolasyonu).
- DeFindex config boşsa kaynak hiç kurulmaz.

## 10. Test (TDD)

- `scanSource`: çoklu id okuma + hatalı id atlama (mevcut `scanYields` testleri buna uyarlanır).
- `createBlendSource`: `RawReserve→PoolYield` eşlemesi, `protocol:"blend"`, APY/TVL/utilization ölçeği — mevcut Blend kapsamı korunur.
- `createDefindexSource`: mock RPC `simulateTransaction` cevabı → `scValToNative` decode → `PoolYield`, `protocol:"defindex"`, APY/TVL ölçeği doğru; okunamayan vault → `null`.
- `types`/serialize: `protocol` alanının taşındığı.
- LLM/şebeke testlere girmez (mevcut prensip).

## 11. İnşa Anında Doğrulanacak Riskler (spike'lar)

1. **DeFindex APY okuma getter'ı (ana risk):** Autocompound olduğu için tek bir on-chain "APY" alanı olmayabilir. Faz 2, Blend'de yapıldığı gibi (`scanner.ts`'deki "testnet spike Task 5" notu) küçük bir spike ile getter'ı/encode'u doğrular. **Fallback:** DeFindex USDC vault → Blend fixed pool olduğundan, underlying Blend stratejisinin `supplyApr`'ı kullanılır.
2. **Vault contract id'leri:** `paltalabs/defindex` `public/mainnet.contracts.json`'dan re-validate (deep-research raporu kısmi id verdi; TVL/manifest zamanla değişir).
3. **Bağımlılık kararı:** `@defindex/sdk` **eklenmez** — scan-only için doğrudan `simulateTransaction` daha hafif ve `scanner`'ın mevcut kalıbıyla tutarlı. (SDK çoğunlukla deposit/withdraw tx içindir; bu kapsamda gerekmez.)

## 12. Açık Kapsam / Sonraki Fazlar

- AMM kaynakları (Soroswap published SDK + sabit id'ler; Aquarius daha büyük TVL ama önce id/APY-getter netleşmeli) — farklı yield türü + impermanent-loss → `risk.ts`'e yeni faktör gerektirir.
- DeFindex'e gerçek execution (mainnet) — ayrı güvenlik/risk kararı.
- Frontend'de `protocol` rozeti.
- **Doğrulanamayanlar (deep-research):** YieldSeeker'daki "YieldBlox" aslında bir **Blend pool'u** (scanner zaten kapsıyor); ayrı entegre edilmez ve Şubat 2026 oracle exploit'i `oracleHealthy` kapısının önemini doğrular. Stellar'da üretim seviyesinde **liquid staking yok**.
