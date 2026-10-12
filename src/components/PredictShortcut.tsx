import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import { PANTA_ENABLED } from "../api/config";

// stub: lives in private Degen Terminal codebase
// The real token-page model has many more fields and chains; the app also
// asks its chain registry which chains have a predictions provider (Panta
// is Solana-only), and resolves the logo from its own token-logo cache.
type TokenPageData = {
  chain: string;
  tokenAddress: string;
  ticker?: string;
  logo?: string;
  source?: string;
  curveState?: "bonding" | "graduated";
};

/** "Predict on this token" — deep-links into the create form with a prefill. */
export function PredictShortcut({ token }: { token: TokenPageData }) {
  if (!PANTA_ENABLED || token.chain !== "solana" || !token.tokenAddress) return null;
  const logo = token.logo;
  const qs = new URLSearchParams({
    token: token.tokenAddress,
    sym: token.ticker ?? "",
    ...(logo && logo.startsWith("https://") ? { logo } : {}),
    ...(/pump/i.test(token.source ?? "") && token.curveState === "bonding" ? { pf: "1" } : {}),
  });
  return (
    <Link
      to={`/predict?${qs}`}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
    >
      <Target className="h-4 w-4" />
      Predict on ${token.ticker}
      <span className="font-mono text-[10px] text-muted-foreground">Powered by Panta</span>
    </Link>
  );
}
