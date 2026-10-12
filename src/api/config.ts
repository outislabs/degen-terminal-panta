// Panta feature flags and endpoints. Only public values live here; the
// Panta API key exists solely as a server secret on panta-proxy.

/** Deployed panta-proxy edge function, e.g. https://<project>.supabase.co/functions/v1/panta-proxy */
export const PANTA_PROXY_URL: string = import.meta.env.VITE_PANTA_PROXY_URL ?? "";

// Panta prediction markets (Predict tab, "Predict on this token"). Off by
// default in production; visible in local dev so it can be built and checked.
// Real USDC moves on mainnet — signing is separately locked by
// PANTA_BROADCAST_ALLOWED below.
export const PANTA_ENABLED = import.meta.env.VITE_PANTA_ENABLED === "true" || import.meta.env.DEV;

// Panta has no testnet: any signed create/buy/claim moves real mainnet USDC.
// Dev and preview builds never sign or broadcast (the flow stops at the built,
// unsigned transaction) unless VITE_PANTA_ALLOW_DEV_BROADCAST=true is set.
export const PANTA_BROADCAST_ALLOWED =
  import.meta.env.PROD || import.meta.env.VITE_PANTA_ALLOW_DEV_BROADCAST === "true";

export const PANTA_URL = "https://panta.market";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const PANTA_CATEGORIES = ["crypto", "finance", "sports", "politics", "entertainment", "science", "world", "other"] as const;
