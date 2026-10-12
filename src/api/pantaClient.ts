// Browser client for panta-proxy. No Panta key ever lives here.
import { getAccessToken } from "../stubs/auth";
import { PANTA_PROXY_URL } from "./config";

export class PantaError extends Error {
  code: string;
  status: number;
  retryAfter?: number;
  field?: string;
  constructor(code: string, message: string, status: number, retryAfter?: number, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
    this.field = field;
  }
}

// Shared across every panel: once Panta says "slow down" for a family, no
// component calls it again until the window passes.
const cooldown: Record<string, number> = {};
const FAMILY: Record<string, string> = {
  markets: "read", market: "read", categories: "read", positions: "positions",
  buyQuote: "quote", createQuote: "quote",
  buyBuild: "build", createBuild: "build", claimBuild: "build", creatorFeesBuild: "build",
  buySubmit: "register", buyVerify: "register", createRegister: "register", report: "register",
  imageUpload: "upload",
};

export function cooldownLeft(action: string): number {
  const until = cooldown[FAMILY[action]] ?? 0;
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export async function panta<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const left = cooldownLeft(action);
  if (left > 0) throw new PantaError("RATE_LIMITED", "Panta is busy for everyone on DGN right now.", 429, left);

  let token: string | null = null;
  try { token = await getAccessToken(); } catch { token = null; }

  const res = await fetch(PANTA_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action, ...payload }),
  });
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    const code = body?.code ?? "INTERNAL_ERROR";
    if (code === "RATE_LIMITED") {
      const ra = Number(body?.retryAfter) || 30;
      cooldown[FAMILY[action]] = Date.now() + ra * 1000;
      throw new PantaError(code, body?.message ?? "Rate limited", 429, ra);
    }
    throw new PantaError(code, body?.message ?? `Request failed (${res.status})`, res.status, undefined, body?.field);
  }
  return body as T;
}

/** Plain-language message for every documented Panta error code. */
export function pantaMessage(e: unknown): string {
  if (!(e instanceof PantaError)) return (e as Error)?.message || "Something went wrong.";
  switch (e.code) {
    case "RATE_LIMITED": return `Panta's limit is shared by everyone on DGN and it's busy right now. Try again in ${e.retryAfter ?? 30}s.`;
    case "QUOTE_EXPIRED": return "That quote expired. Get a fresh one.";
    case "QUOTE_STALE": return "The price moved since your quote. Get a fresh one.";
    case "CREATE_EXPIRED": return "This create session expired (they last about 5 minutes). Start the quote again.";
    case "MARKET_NOT_IN_PRIMARY": return "This market isn't taking new buys any more.";
    case "AMOUNT_TOO_SMALL": return "That amount is below Panta's minimum. Try a larger amount.";
    case "MARKET_NOT_FOUND": return "Panta can't find this market.";
    case "DUPLICATE_MARKET": return "You already created a market with this exact question.";
    case "CREATE_NOT_PERMITTED": return "Market creation is switched off for DGN's Panta account.";
    case "NOT_CLAIMABLE": return "Nothing to claim here yet.";
    case "NOT_MARKET_CREATOR": return "Only the market's creator can claim its fees.";
    case "MARKET_NOT_GRADUATED": return "Creator fees unlock once the market graduates.";
    case "NO_CREATOR_FEES": return "No creator fees have built up yet.";
    case "UNAUTHORIZED": return "Sign in to continue.";
    case "NO_WALLET": return "Create your Solana wallet first.";
    case "NOT_CONFIGURED": return "Prediction markets aren't configured on the server yet.";
    case "TX_NOT_FOUND": return "Panta hasn't seen the transaction yet. It will retry.";
    case "INVALID_MARKET_PARAMS": return e.message;
    default: return e.message;
  }
}
