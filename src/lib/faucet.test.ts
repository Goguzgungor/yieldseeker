import { describe, it, expect } from "vitest";
import { Address, Keypair, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  deriveOwnerKeypair,
  parseFaucetRequest,
  buildMintOp,
  mintUsdc,
  FAUCET_DEFAULT_USDC,
  FAUCET_MAX_USDC,
  STROOPS_PER_USDC,
} from "./faucet";

// A deterministic C-address recipient (a smart account stand-in).
const SMART_ACCOUNT = StrKey.encodeContract(Buffer.alloc(32, 5));
const USDC_SAC = StrKey.encodeContract(Buffer.alloc(32, 3));
const PASS = "Test SDF Network ; September 2015";

describe("deriveOwnerKeypair (SEP-5)", () => {
  it("derives the documented owner G-address from the known test mnemonic", () => {
    const prev = process.env.STELLAR_WALLET_MNEMONIC;
    process.env.STELLAR_WALLET_MNEMONIC =
      "relief crouch arrest strong own source choice elevator borrow card merry medal";
    try {
      const kp = deriveOwnerKeypair();
      // SEP-5 m/44'/148'/0' of this mnemonic — the USDC SAC admin/issuer.
      expect(kp.publicKey()).toBe("GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2");
    } finally {
      if (prev === undefined) delete process.env.STELLAR_WALLET_MNEMONIC;
      else process.env.STELLAR_WALLET_MNEMONIC = prev;
    }
  });

  it("is robust to surrounding whitespace in the mnemonic", () => {
    const prev = process.env.STELLAR_WALLET_MNEMONIC;
    process.env.STELLAR_WALLET_MNEMONIC =
      "  relief crouch arrest strong own source choice elevator borrow card merry medal\n";
    try {
      expect(deriveOwnerKeypair().publicKey()).toBe(
        "GBXDHEVCWZCP45D5VCBLYEQFX33DTHULU6KMH5YPJ54XXOJ6DO2P3MU2",
      );
    } finally {
      if (prev === undefined) delete process.env.STELLAR_WALLET_MNEMONIC;
      else process.env.STELLAR_WALLET_MNEMONIC = prev;
    }
  });

  it("throws a clear error when the mnemonic is missing", () => {
    const prev = process.env.STELLAR_WALLET_MNEMONIC;
    delete process.env.STELLAR_WALLET_MNEMONIC;
    try {
      expect(() => deriveOwnerKeypair()).toThrow(/STELLAR_WALLET_MNEMONIC is not set/);
    } finally {
      if (prev !== undefined) process.env.STELLAR_WALLET_MNEMONIC = prev;
    }
  });
});

describe("parseFaucetRequest", () => {
  it("defaults amount to FAUCET_DEFAULT_USDC and converts to stroops", () => {
    const r = parseFaucetRequest({ to: SMART_ACCOUNT });
    expect(r.to).toBe(SMART_ACCOUNT);
    expect(r.amountUsdc).toBe(FAUCET_DEFAULT_USDC);
    expect(r.amountStroops).toBe(BigInt(FAUCET_DEFAULT_USDC) * STROOPS_PER_USDC);
  });

  it("converts whole + fractional USDC to stroops (7 decimals)", () => {
    expect(parseFaucetRequest({ to: SMART_ACCOUNT, amount: 1 }).amountStroops).toBe(10_000_000n);
    expect(parseFaucetRequest({ to: SMART_ACCOUNT, amount: 250 }).amountStroops).toBe(2_500_000_000n);
    expect(parseFaucetRequest({ to: SMART_ACCOUNT, amount: 0.5 }).amountStroops).toBe(5_000_000n);
    expect(parseFaucetRequest({ to: SMART_ACCOUNT, amount: 1.2345678 }).amountStroops).toBe(12_345_678n);
  });

  it("accepts a numeric string amount", () => {
    expect(parseFaucetRequest({ to: SMART_ACCOUNT, amount: "250" }).amountStroops).toBe(2_500_000_000n);
  });

  it("accepts a classic G-address recipient", () => {
    const g = Keypair.random().publicKey();
    expect(parseFaucetRequest({ to: g, amount: 10 }).to).toBe(g);
  });

  it("caps the amount at FAUCET_MAX_USDC", () => {
    expect(() => parseFaucetRequest({ to: SMART_ACCOUNT, amount: FAUCET_MAX_USDC + 1 })).toThrow(
      /exceeds the faucet cap/,
    );
    // exactly at the cap is allowed
    expect(parseFaucetRequest({ to: SMART_ACCOUNT, amount: FAUCET_MAX_USDC }).amountUsdc).toBe(
      FAUCET_MAX_USDC,
    );
  });

  it("rejects a missing / non-string `to`", () => {
    expect(() => parseFaucetRequest({ to: undefined })).toThrow(/`to` is required/);
    expect(() => parseFaucetRequest({ to: 123 as unknown as string })).toThrow(/`to` is required/);
    expect(() => parseFaucetRequest({ to: "   " })).toThrow(/`to` is required/);
  });

  it("rejects a malformed `to` address", () => {
    expect(() => parseFaucetRequest({ to: "not-an-address" })).toThrow(/valid Stellar address/);
  });

  it("rejects non-positive / non-finite amounts", () => {
    expect(() => parseFaucetRequest({ to: SMART_ACCOUNT, amount: 0 })).toThrow(/positive number/);
    expect(() => parseFaucetRequest({ to: SMART_ACCOUNT, amount: -5 })).toThrow(/positive number/);
    expect(() => parseFaucetRequest({ to: SMART_ACCOUNT, amount: NaN })).toThrow(/positive number/);
    expect(() => parseFaucetRequest({ to: SMART_ACCOUNT, amount: "abc" })).toThrow(/positive number/);
  });
});

describe("mintUsdc (network mocked)", () => {
  const owner = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7));

  it("rejects a non-positive amount before touching the network", async () => {
    await expect(
      mintUsdc({
        to: SMART_ACCOUNT,
        amountStroops: 0n,
        rpcUrl: "http://localhost",
        networkPassphrase: PASS,
        usdcSac: USDC_SAC,
        ownerKeypair: owner,
        server: {} as never,
      }),
    ).rejects.toThrow(/must be positive/);
  });

  it("rejects a malformed recipient address", async () => {
    await expect(
      mintUsdc({
        to: "garbage",
        amountStroops: 100n,
        rpcUrl: "http://localhost",
        networkPassphrase: PASS,
        usdcSac: USDC_SAC,
        ownerKeypair: owner,
        server: {} as never,
      }),
    ).rejects.toThrow();
  });

  it("throws a clear error when the mint simulation fails (uses the owner as tx source)", async () => {
    const { Account } = await import("@stellar/stellar-sdk");
    let sourceAddr: string | undefined;
    const server = {
      getAccount: async (id: string) => {
        sourceAddr = id;
        return new Account(id, "10");
      },
      simulateTransaction: async () => ({ error: "boom: not the admin" }),
    };
    await expect(
      mintUsdc({
        to: SMART_ACCOUNT,
        amountStroops: 250n * STROOPS_PER_USDC,
        rpcUrl: "http://localhost",
        networkPassphrase: PASS,
        usdcSac: USDC_SAC,
        ownerKeypair: owner,
        server: server as never,
      }),
    ).rejects.toThrow(/mint simulate failed/);
    // The mint is signed/sourced by the SAC admin (owner) — never a user key.
    expect(sourceAddr).toBe(owner.publicKey());
  });
});

describe("buildMintOp", () => {
  it("builds mint(to = contract C…, amount = i128) on the SAC", () => {
    const op = buildMintOp(USDC_SAC, SMART_ACCOUNT, 250n * STROOPS_PER_USDC);
    const host = (op.body().value() as xdr.InvokeHostFunctionOp).hostFunction();
    const invoke = host.invokeContract();
    expect(Address.fromScAddress(invoke.contractAddress()).toString()).toBe(USDC_SAC);
    expect(invoke.functionName().toString()).toBe("mint");
    const args = invoke.args();
    // arg0 = the recipient Address (a CONTRACT account, no trustline needed)
    expect(Address.fromScAddress(args[0].address()).toString()).toBe(SMART_ACCOUNT);
    // arg1 = i128 amount
    const expectedAmt = nativeToScVal(250n * STROOPS_PER_USDC, { type: "i128" });
    expect(args[1].toXDR("hex")).toBe(expectedAmt.toXDR("hex"));
  });

  it("also accepts a classic G… recipient", () => {
    const g = Keypair.random().publicKey();
    const op = buildMintOp(USDC_SAC, g, 10n * STROOPS_PER_USDC);
    const host = (op.body().value() as xdr.InvokeHostFunctionOp).hostFunction();
    const args = host.invokeContract().args();
    expect(Address.fromScAddress(args[0].address()).toString()).toBe(g);
  });

  it("throws on a malformed recipient address", () => {
    expect(() => buildMintOp(USDC_SAC, "garbage", 1n)).toThrow();
  });
});
