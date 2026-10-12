// Live token snapshot for "Predict on this token" templates. Read fresh when
// the create form opens — never from the token-page link or any cache, since
// the pre-filled thresholds are shown on screen and written into resolution
// rules. Each field is null when its source has no data; templates that need
// it are then hidden rather than guessed.

export type LiveSnapshot = {
  marketCap: number | null;   // circulating market cap (never FDV)
  marketCapSource: "GeckoTerminal" | "DexScreener" | null;
  volume24h: number | null;   // DexScreener deepest pool `volume.h24`
  liquidityUsd: number | null; // DexScreener deepest pool `liquidity.usd`
  holders: number | null;     // GoPlus Security `holder_count`
  asOf: number;
};

const pos = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

export async function fetchLiveSnapshot(mint: string): Promise<LiveSnapshot> {
  const [dex, goplus, gecko] = await Promise.allSettled([
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=${mint}`, { cache: "no-store" }).then((r) => r.json()),
    fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}`, { cache: "no-store" }).then((r) => r.json()),
  ]);
  let marketCap: number | null = null, volume24h = null, liquidityUsd = null, holders = null;
  if (dex.status === "fulfilled") {
    const pairs: any[] = (dex.value?.pairs ?? []).filter((p: any) => p?.chainId === "solana" && p?.baseToken?.address === mint);
    const best = pairs.sort((a, b) => (b?.liquidity?.usd ?? 0) - (a?.liquidity?.usd ?? 0))[0];
    if (best) {
      marketCap = pos(best.marketCap);
      volume24h = pos(best.volume?.h24);
      liquidityUsd = pos(best.liquidity?.usd);
    }
  }
  // DexScreener's `marketCap` has been seen flipping to equal FDV on the same
  // pool minutes apart ($PUMP: 2.97B -> 5.32B). GeckoTerminal's
  // market_cap_usd is circulating-only, so it wins when present.
  let marketCapSource: LiveSnapshot["marketCapSource"] = marketCap !== null ? "DexScreener" : null;
  if (gecko.status === "fulfilled") {
    const g = pos(gecko.value?.data?.attributes?.market_cap_usd);
    if (g !== null) { marketCap = g; marketCapSource = "GeckoTerminal"; }
  }
  if (goplus.status === "fulfilled") holders = pos(goplus.value?.result?.[mint]?.holder_count);
  return { marketCap, marketCapSource, volume24h, liquidityUsd, holders, asOf: Date.now() };
}

/** Round to 2 significant figures (up or down). */
export function niceRound(n: number, dir: "up" | "down" = "up"): number {
  if (!(n > 0)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return (dir === "up" ? Math.ceil(n / mag) : Math.floor(n / mag)) * mag;
}
