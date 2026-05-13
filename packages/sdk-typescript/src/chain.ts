/**
 * Sprint MAOS-A — multi-agent delegation chain helpers.
 *
 * Convention (orchestrator-agnostic):
 *   NOMOS_PARENT_UCAN_CHAIN       — JSON string array of UCAN JWTs (root-first).
 *   NOMOS_PARENT_UCAN_CHAIN_FILE  — fallback path; same JSON shape on disk.
 *                                    Useful when chain depth pushes env-var
 *                                    size past OS limits (~128KB on most).
 *   NOMOS_PARENT_RECEIPT_ID       — receiptId of the parent authorize call
 *                                    (causation back-link).
 *   NOMOS_SWARM_ID                — explicit swarm hint (PDP derives otherwise).
 *
 * Any orchestrator (LangGraph, CrewAI, AutoGen, OpenAI Swarm, Claude
 * sub-agents) can wire these env vars on child-process spawn without
 * importing the SDK.
 */
import { readFileSync } from 'node:fs';

export const ENV_PARENT_CHAIN = 'NOMOS_PARENT_UCAN_CHAIN';
export const ENV_PARENT_CHAIN_FILE = 'NOMOS_PARENT_UCAN_CHAIN_FILE';
export const ENV_PARENT_RECEIPT = 'NOMOS_PARENT_RECEIPT_ID';
export const ENV_SWARM_ID = 'NOMOS_SWARM_ID';
export const ENV_MAX_CHAIN_DEPTH = 'NOMOS_MAX_CHAIN_DEPTH';

export const DEFAULT_MAX_CHAIN_DEPTH = 8;

export interface ParentChainContext {
  /** Root-first JWT array. Empty when no parent chain is set. */
  chain: string[];
  parentReceiptId?: string;
  swarmId?: string;
}

/**
 * Read parent chain context from environment. Process-isolated; safe to
 * call from any agent runtime that inherits env from its parent.
 */
export function readParentChainFromEnv(env: NodeJS.ProcessEnv = process.env): ParentChainContext {
  const ctx: ParentChainContext = { chain: [] };
  const raw = env[ENV_PARENT_CHAIN];
  if (raw) {
    ctx.chain = parseChainJson(raw);
  } else {
    const file = env[ENV_PARENT_CHAIN_FILE];
    if (file) {
      try {
        ctx.chain = parseChainJson(readFileSync(file, 'utf8'));
      } catch {
        // Silent fallback to empty — caller must be tolerant of unset env.
      }
    }
  }
  const receipt = env[ENV_PARENT_RECEIPT];
  if (receipt) ctx.parentReceiptId = receipt;
  const swarm = env[ENV_SWARM_ID];
  if (swarm) ctx.swarmId = swarm;
  return ctx;
}

function parseChainJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((j) => typeof j === 'string')) {
      return parsed;
    }
  } catch {
    // Not JSON — try comma-separated as a convenience for shell users.
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export interface ChildEnvVars {
  [ENV_PARENT_CHAIN]?: string;
  [ENV_PARENT_CHAIN_FILE]?: string;
  [ENV_PARENT_RECEIPT]?: string;
  [ENV_SWARM_ID]?: string;
}

export interface ForkChildInput {
  /** Parent chain (root-first). Pass empty array when forking from root. */
  parentChain: string[];
  /** New leaf UCAN minted for the child (already attenuated). */
  childUcanJwt: string;
  /** Receipt id from the parent's last authorize call (for causation back-link). */
  parentReceiptId?: string;
  swarmId?: string;
  /** Override depth cap; defaults to DEFAULT_MAX_CHAIN_DEPTH. */
  maxChainDepth?: number;
}

export interface ForkChildResult {
  /** Full root-first chain to hand to the child process. */
  chain: string[];
  /** Env vars to merge into child process spawn. */
  env: ChildEnvVars;
}

/**
 * Build the chain + env handoff for a child agent. The child UCAN must
 * already be minted (typically via the control-plane mint endpoint or
 * the `nomos-ucan` CLI for non-TS runtimes).
 *
 * Throws when the resulting chain would exceed `maxChainDepth` — fail-fast
 * before spawn so the caller sees a clear error, not a runtime PDP deny.
 */
export function forkChild(input: ForkChildInput): ForkChildResult {
  const max = input.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
  const chain = [...input.parentChain, input.childUcanJwt];
  if (chain.length > max) {
    throw new Error(`forkChild: chain depth ${chain.length} exceeds NOMOS_MAX_CHAIN_DEPTH=${max}`);
  }
  const env: ChildEnvVars = {
    [ENV_PARENT_CHAIN]: JSON.stringify(chain),
  };
  if (input.parentReceiptId) env[ENV_PARENT_RECEIPT] = input.parentReceiptId;
  if (input.swarmId) env[ENV_SWARM_ID] = input.swarmId;
  return { chain, env };
}

/**
 * Merge a parent-chain context onto an authorize request. The leaf UCAN
 * (`req.ucan`) is appended to the parent chain so PDP sees the full chain
 * root-first. When `req.delegated_chain` is already set the caller wins.
 */
export function applyParentChain<
  T extends {
    ucan: string;
    delegated_chain?: string[];
    parent_receipt_id?: string;
    swarm_id?: string;
  },
>(req: T, ctx: ParentChainContext = readParentChainFromEnv()): T {
  if (req.delegated_chain && req.delegated_chain.length > 0) return req;
  if (ctx.chain.length === 0) return req;
  return {
    ...req,
    delegated_chain: [...ctx.chain, req.ucan],
    ...((req.parent_receipt_id ?? ctx.parentReceiptId)
      ? { parent_receipt_id: req.parent_receipt_id ?? ctx.parentReceiptId }
      : {}),
    ...((req.swarm_id ?? ctx.swarmId) ? { swarm_id: req.swarm_id ?? ctx.swarmId } : {}),
  };
}
