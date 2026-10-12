import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Checkbox, Input, cn } from "../stubs/ui";
import { panta, pantaMessage, PantaError } from "../api/pantaClient";
import { compileInstructions, signAndSend, usdcBalance, BroadcastLockedError } from "../api/pantaTx";
import { useSolSigner } from "../hooks/useSolSigner";
import type { BuyQuote as Quote, PantaInstructionsBuild, PantaMarket } from "../types/panta";
import { NoExitNotice, PoweredByPanta, PreviewLockBanner, fmtUsd, pct } from "./shared";

// No quote polling: a quote is fetched only when the user asks for one, and
// the panel never auto-refreshes it. Quote and build budgets are shared by
// every DGN user.
export function BuyPanel({ market, onDone }: { market: PantaMarket; onDone?: () => void }) {
  const { wallet, hasKey, request, modal } = useSolSigner();
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("5");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<"quote" | "buy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [usdc, setUsdc] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => { if (wallet) void usdcBalance(wallet).then(setUsdc); }, [wallet]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { setQuote(null); }, [side, amount]);

  const amt = Number(amount);
  const validAmt = Number.isFinite(amt) && amt > 0;
  const short = usdc !== null && validAmt && amt > usdc;
  const secsLeft = quote ? Math.max(0, Math.floor((Date.parse(quote.expiresAt) - now) / 1000)) : 0;
  const expired = !!quote && secsLeft <= 0;
  const open = market.phase === "primary" && !market.resolved;

  const getQuote = async () => {
    if (!wallet || !validAmt) return;
    setBusy("quote"); setError(null);
    try {
      setQuote(await panta<Quote>("buyQuote", { wallet, marketId: market.marketId, side, amountUsdc: amt.toFixed(2) }));
    } catch (e) { setError(pantaMessage(e)); }
    finally { setBusy(null); }
  };

  const buy = () => {
    if (!quote || !wallet) return;
    request(async (kp) => {
      setBusy("buy"); setError(null);
      try {
        const built = await panta<PantaInstructionsBuild>("buyBuild", { quoteId: quote.quoteId, wallet, maxSlippageBps: 100 });
        const tx = compileInstructions(built.instructions, built.recentBlockhash, wallet);
        const sig = await signAndSend(tx, kp);
        await panta("buySubmit", { orderId: built.orderId, signature: sig, wallet }).catch(() => {});
        await panta("report", { signature: sig, wallet, marketId: market.marketId, quoteId: quote.quoteId }).catch(() => {});
        setDone(sig); setQuote(null); setAck(false);
        toast.success(`Bought ${side.toUpperCase()} shares`);
        onDone?.();
      } catch (e) {
        if (e instanceof BroadcastLockedError) { setError(e.message); }
        else if (e instanceof PantaError && (e.code === "QUOTE_EXPIRED" || e.code === "QUOTE_STALE")) { setQuote(null); setError(pantaMessage(e)); }
        else setError(pantaMessage(e));
      } finally { setBusy(null); }
    });
  };

  if (!open) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <p className="text-sm text-muted-foreground">This market isn't taking new buys ({market.phase}).</p>
        <PoweredByPanta />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Buy a side</h3>
        <PoweredByPanta />
      </div>

      {/* Shown up front, before any amount or quote. */}
      <NoExitNotice />

      <div className="grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={cn(
              "min-h-12 rounded-md border px-3 py-2 text-left transition-colors",
              side === s
                ? s === "yes" ? "border-profit bg-profit/15 text-profit" : "border-loss bg-loss/15 text-loss"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            <div className="font-mono text-sm font-bold uppercase">{s}</div>
            <div className="text-xs">{pct(s === "yes" ? market.yesPrice : market.noPrice)}</div>
          </button>
        ))}
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>Amount (USDC)</span>
          <span>Balance {usdc === null ? "—" : fmtUsd(usdc)}</span>
        </div>
        <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="font-mono" />
        {short && <p className="mt-1 text-xs text-loss">Not enough USDC. You have {fmtUsd(usdc)} on Solana.</p>}
      </div>

      {!wallet || !hasKey ? (
        <p className="text-sm text-muted-foreground">Sign in and create your Solana wallet to buy.</p>
      ) : !quote || expired ? (
        <Button className="w-full" disabled={!validAmt || short || busy !== null} onClick={getQuote}>
          {busy === "quote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {expired ? "Quote expired. Get a new quote" : "Get quote"}
        </Button>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-y-1 rounded-md border border-border bg-background p-3 font-mono text-xs">
            <dt className="text-muted-foreground">You pay</dt><dd className="text-right">{fmtUsd(Number(quote.amountUsdc))}</dd>
            <dt className="text-muted-foreground">Shares ({side.toUpperCase()})</dt><dd className="text-right">{Number(quote.shares).toFixed(2)}</dd>
            <dt className="text-muted-foreground">Avg price</dt><dd className="text-right">{fmtUsd(Number(quote.avgPrice), 4)}</dd>
            <dt className="text-muted-foreground">Panta fee</dt><dd className="text-right">{fmtUsd(Number(quote.feeUsdc))}</dd>
            <dt className="text-muted-foreground">Pays if {side.toUpperCase()} wins</dt><dd className="text-right">≈ {fmtUsd(Number(quote.shares))}</dd>
            <dt className="text-muted-foreground">Quote valid</dt><dd className="text-right">{secsLeft}s</dd>
          </dl>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-warning/50 bg-warning/5 p-3 text-sm">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            <span>I understand I can't sell before the market resolves, and I could lose the full {fmtUsd(Number(quote.amountUsdc))}.</span>
          </label>
          <Button className="w-full" disabled={!ack || busy !== null} onClick={buy}>
            {busy === "buy" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Buy {side.toUpperCase()} for {fmtUsd(Number(quote.amountUsdc))}
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-loss">{error}</p>}
      {done && (
        <a className="block text-xs text-primary underline" href={`https://solscan.io/tx/${done}`} target="_blank" rel="noopener noreferrer">
          View transaction
        </a>
      )}
      <PreviewLockBanner />
      {modal}
    </div>
  );
}
