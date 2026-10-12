// stub: lives in private Degen Terminal codebase
// The real helpers live in supabase/functions/_shared (CORS, JSON responses,
// service-role Supabase client, Privy JWT verification against Privy's JWKS).

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

export function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...init.headers },
  });
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, { status });
}

export class PrivyAuthError extends Error {
  status?: number;
}

/** Verifies the Bearer Privy access token and returns the Privy user id. */
export async function verifyPrivyRequest(_req: Request): Promise<{ privyUserId: string }> {
  const err = new PrivyAuthError("stub: Privy verification lives in the private Degen Terminal codebase");
  err.status = 401;
  throw err;
}

/** Looks up the caller's own Solana wallet (user_wallets.public_key) with the service-role client. */
export async function callerWallet(_privyUserId: string): Promise<string | null> {
  return null;
}
