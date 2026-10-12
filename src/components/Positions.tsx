import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../stubs/ui";
import { panta, pantaMessage } from "../api/pantaClient";
import { compileInstructions, signAndSend, BroadcastLockedError } from "../api/pantaTx";
import { useSolSigner } from "../hooks/useSolSigner";
import type { PantaInstructionsBuild, PantaMarket, PantaPosition } from "../types/panta";
import { PreviewLockBanner, fmtUsd } from "./shared";

export function Positions() {
  const { wallet, request, modal } = useSolSigner();
  const [rows, setRows] = useState<PantaPosition[] | null>(null);
  const [mine, setMine] = useState<PantaMarket[]>([]);
  const [markets, setMarkets] = useState<Record<string, PantaMarket>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wallet) return;
    setError(null);
    try {
      const r = await panta<{ positions: PantaPosition[] }>("positions", { wallet });
      setRows(r.positions);
      const created = await panta<{ items: PantaMarket[] }>("markets", { createdBy: wallet, limit: 50 }).catch(() => ({ items: [] }));
      setMine(created.items ?? []);
      // One detail call per distinct market (spot prices), not per row.
      const ids = [...new Set(r.positions.map((p) => p.marketId))];
      const details = await Promise.all(ids.map((id) => panta<PantaMarket>("market", { marketId: id }).catch(() => null)));
      setMarkets(Object.fromEntries(details.filter(Boolean).map((m) => [m!.marketId, m!])));
    } catch (e) { setError(pantaMessage(e)); }
  }, [wallet]);

  useEffect(() => { void load(); }, [load]);

  const claim = (action: "claimBuild" | "creatorFeesBuild", marketId: string) => {
    if (!wallet) return;
    request(async (kp) => {
      setBusy(action + marketId); setError(null);
      try {
        const built = await panta<PantaInstructionsBuild>(action, { wallet, marketId });
        const sig = await signAndSend(compileInstructions(built.instructions, built.recentBlockhash, wallet), kp);
        if (action === "claimBuild") await panta("report", { signature: sig, wallet, marketId }).catch(() => {});
        toast.success(action === "claimBuild" ? "Winnings claimed" : "Creator fees claimed");
        void load();
      } catch (e) { setError(e instanceof BroadcastLockedError ? e.message : pantaMessage(e)); }
      finally { setBusy(null); }
    });
  };

  if (!wallet) return <p className="text-sm text-muted-foreground">Sign in and create your Solana wallet to see positions.</p>;

  const value = (p: PantaPosition) => {
    const s = Number(p.shares);
    if (p.outcome) return p.outcome === p.side ? s : 0;
    const m = markets[p.marketId];
    const price = Number(p.side === "yes" ? m?.yesPrice : m?.noPrice);
    return Number.isFinite(price) && m ? s * price : null;
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-loss">{error}</p>}
      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading positions…</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No positions yet. New buys can take a minute to appear.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {rows.map((p) => {
            const v = value(p);
            const m = markets[p.marketId];
            return (
              <div key={p.marketId + p.side} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m?.title ?? `${p.marketId.slice(0, 6)}…`}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    <span className={p.side === "yes" ? "text-profit" : "text-loss"}>{p.side.toUpperCase()}</span>
                    {" · "}{Number(p.shares).toFixed(2)} shares · {p.outcome ? `resolved ${p.outcome.toUpperCase()}` : p.phase}
                  </p>
                </div>
                <div className="text-right font-mono text-sm">
                  {fmtUsd(v)}
                  <p className="text-[10px] text-muted-foreground">{p.outcome ? "settles at" : "est. value, can't sell"}</p>
                </div>
                {p.claimable && !p.claimed && (
                  <Button size="sm" disabled={!!busy} onClick={() => claim("claimBuild", p.marketId)}>
                    {busy === "claimBuild" + p.marketId && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Claim winnings
                  </Button>
                )}
                {p.claimed && <span className="text-xs text-muted-foreground">Claimed</span>}
              </div>
            );
          })}
        </div>
      )}

      {mine.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Markets you created</h3>
          <div className="divide-y divide-border rounded-lg border border-border">
            {mine.map((m) => (
              <div key={m.marketId} className="flex items-center gap-3 p-3">
                <p className="min-w-0 flex-1 truncate text-sm">{m.title}</p>
                <span className="font-mono text-xs text-muted-foreground">{m.phase}</span>
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => claim("creatorFeesBuild", m.marketId)}>
                  {busy === "creatorFeesBuild" + m.marketId && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}Claim creator fees
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Creator fees unlock once a market graduates.</p>
        </div>
      )}
      <PreviewLockBanner />
      {modal}
    </div>
  );
}
