// panta-proxy — the ONLY path from DGN Terminal to the Panta prediction-market
// API. PANTA_API_KEY is a pk_live_ key shared by every user (its rate limits
// are per account, not per user), so it never reaches the browser.
//
// - Allowlisted actions only; each maps to one Panta route (trailing slash).
// - Catalog reads are public and cached in-isolate so the 120/min read budget
//   is not spent per visitor.
// - Every write requires a verified Privy token; any `wallet` in the request
//   must equal the caller's own stored Solana wallet.
// - On 429 we remember the cooldown per family and answer locally until it
//   passes, so a burst of users cannot keep hammering the shared key.
// - Panta never broadcasts and neither does this function: it only relays
//   quotes, unsigned instructions and post-broadcast signatures.
import { callerWallet, corsHeaders, errorResponse, jsonResponse, PrivyAuthError, verifyPrivyRequest } from "./_shared.ts";

const BASE = "https://live-api.panta.market/api/v1";
type Family = "read" | "positions" | "quote" | "build" | "register" | "upload";

type Action = {
  method: "GET" | "POST";
  path: (p: Record<string, unknown>) => string;
  family: Family;
  auth: boolean;
  cacheMs?: number;
  /** Body/query keys forwarded upstream. */
  keys: string[];
};

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const id = (v: unknown) => (typeof v === "string" && B58.test(v) ? v : "");

const ACTIONS: Record<string, Action> = {
  // Panta filters phase via the `status` query param (`phase` is ignored).
  markets: { method: "GET", path: () => "/markets/", family: "read", auth: false, cacheMs: 30_000, keys: ["status", "category", "cursor", "limit", "createdBy"] },
  categories: { method: "GET", path: () => "/categories/", family: "read", auth: false, cacheMs: 600_000, keys: [] },
  market: { method: "GET", path: (p) => `/markets/${id(p.marketId)}/`, family: "read", auth: false, cacheMs: 15_000, keys: [] },
  positions: { method: "GET", path: () => "/positions/", family: "positions", auth: true, keys: ["wallet"] },
  buyQuote: { method: "POST", path: () => "/primaryorderquote/", family: "quote", auth: true, keys: ["wallet", "marketId", "side", "amountUsdc"] },
  buyBuild: { method: "POST", path: () => "/primaryorderbuild/", family: "build", auth: true, keys: ["quoteId", "wallet", "maxSlippageBps"] },
  buySubmit: { method: "POST", path: () => "/primaryordersubmit/", family: "register", auth: true, keys: ["orderId", "signature", "wallet"] },
  buyVerify: { method: "POST", path: () => "/primaryorderverify/", family: "register", auth: true, keys: ["orderId", "signature", "wallet"] },
  createQuote: {
    method: "POST", path: () => "/markets/create/quote/", family: "quote", auth: true,
    keys: ["wallet", "question", "resolutionRule", "sourcesOfTruth", "category", "startTime", "endTime", "resolutionTime", "imageUrl", "title", "description"],
  },
  createBuild: { method: "POST", path: () => "/markets/create/build/", family: "build", auth: true, keys: ["createId", "wallet"] },
  createRegister: { method: "POST", path: () => "/markets/register/", family: "register", auth: true, keys: ["createId", "signature"] },
  imageUpload: { method: "POST", path: () => "/markets/create/image-upload/", family: "upload", auth: true, keys: [] },
  claimBuild: { method: "POST", path: () => "/claim/build/", family: "build", auth: true, keys: ["wallet", "marketId"] },
  creatorFeesBuild: { method: "POST", path: () => "/claim/creator-fees/build/", family: "build", auth: true, keys: ["wallet", "marketId"] },
  report: { method: "POST", path: () => "/trades/", family: "register", auth: true, keys: ["signature", "wallet", "marketId", "quoteId"] },
};

const cache = new Map<string, { at: number; status: number; body: unknown }>();
const cooldownUntil: Partial<Record<Family, number>> = {};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const apiKey = Deno.env.get("PANTA_API_KEY");
  if (!apiKey) return jsonResponse({ code: "NOT_CONFIGURED", message: "Prediction markets are not configured yet." }, { status: 503 });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  const name = String(payload.action ?? "");
  if (name === "markets" && payload.phase && !payload.status) payload.status = payload.phase;
  const action = ACTIONS[name];
  if (!action) return jsonResponse({ code: "UNKNOWN_ACTION", message: "Unknown action" }, { status: 400 });
  if (name === "market" && !id(payload.marketId)) return jsonResponse({ code: "INVALID_MARKET_PARAMS", message: "Invalid market id" }, { status: 400 });

  let userId: string | null = null;
  if (action.auth) {
    try {
      userId = (await verifyPrivyRequest(req)).privyUserId;
    } catch (e) {
      const err = e as PrivyAuthError;
      return jsonResponse({ code: "UNAUTHORIZED", message: "Sign in to continue." }, { status: err.status ?? 401 });
    }
    if ("wallet" in payload || action.keys.includes("wallet")) {
      const own = await callerWallet(userId);
      if (!own) return jsonResponse({ code: "NO_WALLET", message: "Create your Solana wallet first." }, { status: 400 });
      if (payload.wallet !== undefined && payload.wallet !== own) {
        return jsonResponse({ code: "WALLET_MISMATCH", message: "That wallet is not yours." }, { status: 403 });
      }
      payload.wallet = own;
    }
  }

  const until = cooldownUntil[action.family] ?? 0;
  if (until > Date.now()) {
    const retryAfter = Math.ceil((until - Date.now()) / 1000);
    return jsonResponse({ code: "RATE_LIMITED", family: action.family, retryAfter, message: "Panta is busy for everyone on DGN right now." }, { status: 429 });
  }

  const fwd: Record<string, unknown> = {};
  for (const k of action.keys) if (payload[k] !== undefined && payload[k] !== null && payload[k] !== "") fwd[k] = payload[k];

  let url = `${BASE}${action.path(payload)}`;
  if (action.method === "GET") {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(fwd)) qs.set(k, String(v));
    if ([...qs].length) url += `?${qs}`;
  }

  const cacheKey = action.cacheMs ? url : "";
  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < action.cacheMs!) return jsonResponse(hit.body, { status: hit.status, headers: { "x-cache": "hit" } });
  }

  const headers: Record<string, string> = { "X-Api-Key": apiKey, Accept: "application/json" };
  if (userId) headers["X-User-Id"] = userId;
  if (action.method === "POST") headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, { method: action.method, headers, body: action.method === "POST" ? JSON.stringify(fwd) : undefined });
  } catch (e) {
    console.error("[panta-proxy] upstream", name, e);
    return jsonResponse({ code: "UPSTREAM_UNREACHABLE", message: "Panta could not be reached." }, { status: 502 });
  }

  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { body = { code: "INTERNAL_ERROR", message: text.slice(0, 200) }; }

  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after")) || 30;
    cooldownUntil[action.family] = Date.now() + ra * 1000;
    return jsonResponse({ code: "RATE_LIMITED", family: action.family, retryAfter: ra, message: "Panta is busy for everyone on DGN right now." }, { status: 429 });
  }
  const remaining = res.headers.get("x-ratelimit-remaining");
  if (cacheKey && res.ok) cache.set(cacheKey, { at: Date.now(), status: res.status, body });
  if (!res.ok) console.warn("[panta-proxy]", name, res.status, text.slice(0, 300));
  return jsonResponse(body, { status: res.status, headers: remaining ? { "x-panta-remaining": remaining } : {} });
});
