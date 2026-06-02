import type { Position } from "./types";

/**
 * JSON-safe shape of a {@link Position}: the BigInt `amountUsdc` (stroops) is
 * rendered as a decimal string so it survives `JSON.stringify` (BigInt is not
 * natively serializable). Preserves the behaviour of the old Fastify
 * `GET /position` handler.
 */
export interface SerializedPosition {
  poolId: string | null;
  amountUsdc: string;
}

export function serializePosition(p: Position): SerializedPosition {
  return { poolId: p.poolId, amountUsdc: p.amountUsdc.toString() };
}
