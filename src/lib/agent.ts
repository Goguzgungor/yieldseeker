import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import type { ScoredPool, Position, Decision, RiskTolerance } from "./types";

export interface ToolDef { name: string; description: string; schema: object; validate: (raw: unknown) => any; }
export interface LlmClient {
  runToolLoop(system: string, user: string, tools: ToolDef[]):
    Promise<{ toolName: string | null; input: any; text: string }>;
}

const rebalanceInput = z.object({ toPool: z.string(), amountUsdc: z.coerce.bigint() });

export interface DecisionContext { pools: ScoredPool[]; position: Position; tolerance: RiskTolerance; }

export async function decide(llm: LlmClient, ctx: DecisionContext): Promise<Decision> {
  const tools: ToolDef[] = [{
    name: "rebalance",
    description: "Move the user's USDC from the current pool into a better eligible pool.",
    schema: { type: "object", properties: { toPool: { type: "string" }, amountUsdc: { type: "string", description: "amount in stroops (7 decimals)" } }, required: ["toPool", "amountUsdc"] },
    validate: (raw) => rebalanceInput.parse(raw),
  }];

  const system = [
    "You are an autonomous DeFi yield agent on Stellar.",
    "Only move funds into pools marked eligible. Prefer the highest apyBps among eligible pools.",
    "If the current pool is already the best eligible one, do NOT rebalance — just explain why.",
    `User risk tolerance: ${ctx.tolerance}.`,
  ].join(" ");
  // Convert tvlUsdc from stroops (7 decimals) to whole USDC so the LLM reasons
  // with the correct scale (e.g. $48.2M, not $481.8B).
  const user = JSON.stringify({
    position: { ...ctx.position, amountUsdc: ctx.position.amountUsdc.toString() },
    pools: ctx.pools.map((p) => ({
      ...p,
      tvlUsdc: (Number(p.tvlUsdc) / 1e7).toFixed(2) + " USDC",
    })),
  });

  const r = await llm.runToolLoop(system, user, tools);
  if (r.toolName === "rebalance" && r.input) {
    return { action: "rebalance", toPool: r.input.toPool, amountUsdc: r.input.amountUsdc, rationale: r.text || "rebalance" };
  }
  return { action: "hold", rationale: r.text || "hold" };
}

export function createAnthropicLlm(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async runToolLoop(system, user, tools) {
      const msg = await client.messages.create({
        model, max_tokens: 1024, system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as any })),
        messages: [{ role: "user", content: user }],
      });
      const toolUse = msg.content.find((c) => c.type === "tool_use") as any;
      const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join(" ").trim();
      if (toolUse) {
        const def = tools.find((t) => t.name === toolUse.name);
        return { toolName: toolUse.name, input: def ? def.validate(toolUse.input) : toolUse.input, text };
      }
      return { toolName: null, input: null, text };
    },
  };
}
