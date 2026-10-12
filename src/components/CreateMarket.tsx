import { useEffect, useMemo, useState } from "react";
import { fetchLiveSnapshot, niceRound, type LiveSnapshot } from "../api/liveToken";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Textarea, cn } from "../stubs/ui";
import { panta, pantaMessage } from "../api/pantaClient";
import { PANTA_CATEGORIES } from "../api/config";
import { deserializeTx, signAndSend, usdcBalance, BroadcastLockedError } from "../api/pantaTx";
import { useSolSigner } from "../hooks/useSolSigner";
import type { CreateBuild, CreateQuote, CreateRegister, ImageUploadSigned, TokenPrefill } from "../types/panta";
import { PoweredByPanta, PreviewLockBanner, fmtUsd } from "./shared";

type Template = {
  id: string;
  label: string;
  source: (t: TokenPrefill) => string;
  available: (t: TokenPrefill, s: LiveSnapshot) => boolean;
  build: (t: TokenPrefill, s: LiveSnapshot, date: string) => { q: string; rule: string };
};

const compact = (n: number) =>
  n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}K` : `$${+n.toPrecision(3)}`;
const ds = (t: TokenPrefill) => `https://dexscreener.com/solana/${t.address}`;

// "Predict on this token" templates. Every threshold comes from a live
// snapshot read when the form opens, and each template only appears when its
// data exists. Defaults aim for a market someone would take the other side of.
const TEMPLATES: Template[] = [
  {
    id: "mcap",
    label: "Market cap",
    source: (t) => `https://www.geckoterminal.com/solana/tokens/${t.address}\n${ds(t)}`,
    available: (_t, s) => s.marketCap !== null,
    build: (t, s, d) => {
      const target = compact(niceRound(s.marketCap! * 1.5));
      return {
        q: `Will $${t.symbol} reach a ${target} market cap by ${d}?`,
        rule: `Resolves YES if the market cap (not FDV) of $${t.symbol} (Solana mint ${t.address}) is at or above ${target} at any point before ${d} 23:59 UTC, as shown on ${s.marketCapSource === "GeckoTerminal" ? "GeckoTerminal's token page" : "DexScreener for its highest-liquidity pair"}. Otherwise NO.`,
      };
    },
  },
  {
    id: "grad",
    label: "pump.fun graduation",
    source: (t) => `https://pump.fun/coin/${t.address}`,
    available: (t) => !!t.pumpfun,
    build: (t, _s, d) => ({
      q: `Will $${t.symbol} graduate from pump.fun by ${d}?`,
      rule: `Resolves YES if $${t.symbol} (Solana mint ${t.address}) completes its pump.fun bonding curve and migrates to a DEX pool before ${d} 23:59 UTC, as shown on pump.fun. Otherwise NO.`,
    }),
  },
  {
    id: "holders",
    label: "Holder count",
    source: () => "https://gopluslabs.io/token-security/solana",
    available: (_t, s) => s.holders !== null,
    build: (t, s, d) => {
      const n = niceRound(s.holders! * 1.25).toLocaleString("en-US");
      return {
        q: `Will $${t.symbol} pass ${n} holders by ${d}?`,
        rule: `Resolves YES if the holder_count reported by the GoPlus Security token API for $${t.symbol} (Solana mint ${t.address}) is above ${n} at any check before ${d} 23:59 UTC. Otherwise NO.`,
      };
    },
  },
  {
    id: "volume",
    label: "24h volume",
    source: ds,
    available: (_t, s) => s.volume24h !== null,
    build: (t, s, d) => {
      const target = compact(niceRound(s.volume24h! * 1.5));
      return {
        q: `Will $${t.symbol} do over ${target} in 24h volume before ${d}?`,
        rule: `Resolves YES if the 24h trading volume of $${t.symbol} (Solana mint ${t.address}) exceeds ${target} at any point before ${d} 23:59 UTC, as shown on DexScreener for its highest-liquidity pair. Otherwise NO.`,
      };
    },
  },
  {
    id: "liq",
    label: "Liquidity floor",
    source: ds,
    available: (t, s) => s.liquidityUsd !== null && !t.pumpfun,
    build: (t, s, d) => {
      const target = compact(niceRound(s.liquidityUsd! * 0.5, "down"));
      return {
        q: `Will $${t.symbol} still have over ${target} liquidity on ${d}?`,
        rule: `Resolves YES if the liquidity of the highest-liquidity pair for $${t.symbol} (Solana mint ${t.address}) is above ${target} at ${d} 23:59 UTC, as shown on DexScreener. Otherwise NO.`,
      };
    },
  },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function CreateMarket({ prefill, onCreated }: { prefill?: TokenPrefill | null; onCreated?: (marketId: string) => void }) {
  const { wallet, hasKey, request, modal } = useSolSigner();
  const defaultClose = isoDay(new Date(Date.now() + 7 * 86400_000));
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [snapErr, setSnapErr] = useState(false);
  const templates = prefill && snap ? TEMPLATES.filter((t) => t.available(prefill, snap)) : [];
  const [tpl, setTpl] = useState("");
  const [closeDay, setCloseDay] = useState(defaultClose);
  const [question, setQuestion] = useState("");
  const [rule, setRule] = useState("");
  const [sources, setSources] = useState(prefill ? ds(prefill) : "");
  const [category, setCategory] = useState<string>("crypto");
  const [imageUrl, setImageUrl] = useState(prefill?.logo ?? "");
  const [uploading, setUploading] = useState(false);
  const [quote, setQuote] = useState<(CreateQuote & { balance: number | null }) | null>(null);
  const [busy, setBusy] = useState<"quote" | "create" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyTemplate = (id: string, day = closeDay, s = snap) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t || !prefill || !s) return;
    const r = t.build(prefill, s, day);
    setTpl(id); setQuestion(r.q); setRule(r.rule); setSources(t.source(prefill));
    setQuote(null);
  };

  useEffect(() => {
    if (!prefill) return;
    let live = true;
    fetchLiveSnapshot(prefill.address).then((s) => {
      if (!live) return;
      setSnap(s);
      const first = TEMPLATES.find((t) => t.available(prefill, s));
      if (first) applyTemplate(first.id, defaultClose, s);
    }).catch(() => live && setSnapErr(true));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.address]);

  // Panta rule: startTime must be >= ~1h ahead; close must come after start.
  const times = useMemo(() => {
    const start = Math.floor(Date.now() / 1000) + 65 * 60;
    const end = Math.floor(Date.parse(`${closeDay}T23:59:00Z`) / 1000);
    return { start, end, resolution: end + 3600, ok: Number.isFinite(end) && end > start + 600 };
  }, [closeDay]);

  const valid = question.trim().length >= 10 && question.length <= 512 && rule.trim().length >= 20 && rule.length <= 2048
    && sources.trim().length > 0 && /^https?:\/\//.test(imageUrl) && times.ok;

  const upload = async (file: File) => {
    setUploading(true); setError(null);
    try {
      const signed = await panta<ImageUploadSigned>("imageUpload", {});
      const fd = new FormData();
      Object.entries(signed.fields ?? {}).forEach(([k, v]) => fd.append(k, String(v)));
      fd.append("file", file);
      const r = await fetch(signed.uploadUrl, { method: "POST", body: fd });
      const j = await r.json();
      if (!j.secure_url) throw new Error("Image upload failed.");
      setImageUrl(j.secure_url); setQuote(null);
    } catch (e) { setError(pantaMessage(e)); }
    finally { setUploading(false); }
  };

  const getQuote = async () => {
    if (!wallet) return;
    setBusy("quote"); setError(null);
    try {
      const q = await panta<CreateQuote>("createQuote", {
        wallet, question: question.trim(), resolutionRule: rule.trim(),
        sourcesOfTruth: sources.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
        category, startTime: times.start, endTime: times.end, resolutionTime: times.resolution, imageUrl,
      });
      const bal = await usdcBalance(wallet);
      setQuote({ ...q, balance: bal });
    } catch (e) { setError(pantaMessage(e)); }
    finally { setBusy(null); }
  };

  const fee = quote ? Number(quote.paymentUsdc) / 1e6 : 0;
  const short = quote && quote.balance !== null && quote.balance < fee;
  const sumOk = (() => {
    try { return !quote || BigInt(quote.liquidityInjectionUsdc) + BigInt(quote.platformRevenueUsdc) === BigInt(quote.paymentUsdc); }
    catch { return false; }
  })();

  const create = () => {
    if (!quote || !wallet) return;
    request(async (kp) => {
      setBusy("create"); setError(null);
      try {
        const built = await panta<CreateBuild>("createBuild", { createId: quote.createId, wallet });
        const sig = await signAndSend(deserializeTx(built.transaction), kp);
        let reg: CreateRegister | null = null;
        for (let i = 0; i < 4 && !reg; i++) {
          reg = await panta<CreateRegister>("createRegister", { createId: quote.createId, signature: sig }).catch(async (e) => {
            if (i === 3) throw e;
            await new Promise((r) => setTimeout(r, 3000));
            return null;
          });
        }
        toast.success("Market created");
        setQuote(null);
        onCreated?.(reg!.marketId);
      } catch (e) {
        setError(e instanceof BroadcastLockedError ? e.message : pantaMessage(e));
      } finally { setBusy(null); }
    });
  };

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{prefill ? `Predict on $${prefill.symbol}` : "Create a market"}</h2>
        <PoweredByPanta />
      </div>

      {prefill && !snap && !snapErr && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Reading live data for ${prefill.symbol}…</p>
      )}
      {prefill && snapErr && <p className="text-xs text-loss">Couldn't read live data for ${prefill.symbol}. Write the question yourself.</p>}
      {prefill && snap && templates.length === 0 && <p className="text-xs text-muted-foreground">No live data for templates on this token. Write the question yourself.</p>}
      {prefill && snap && templates.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Start from a template</p>
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground">
            Live as of {new Date(snap.asOf).toISOString().slice(11, 16)} UTC
            {snap.marketCap !== null && ` · mcap ${compact(snap.marketCap)}`}
            {snap.volume24h !== null && ` · 24h vol ${compact(snap.volume24h)}`}
            {snap.liquidityUsd !== null && ` · liq ${compact(snap.liquidityUsd)}`}
            {snap.holders !== null && ` · ${snap.holders.toLocaleString("en-US")} holders`}
          </p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button key={t.id} onClick={() => applyTemplate(t.id)}
                className={cn("min-h-10 rounded-md border px-3 text-sm", tpl === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="Question (YES/NO)"><Textarea rows={2} value={question} maxLength={512} onChange={(e) => { setQuestion(e.target.value); setQuote(null); }} /></Field>
      <Field label="How it resolves"><Textarea rows={4} value={rule} maxLength={2048} onChange={(e) => { setRule(e.target.value); setQuote(null); }} /></Field>
      <Field label="Source of truth (links, one per line)"><Textarea rows={2} value={sources} onChange={(e) => { setSources(e.target.value); setQuote(null); }} className="font-mono text-xs" /></Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Closes (UTC, end of day)">
          <Input type="date" value={closeDay} min={isoDay(new Date(Date.now() + 86400_000))}
            onChange={(e) => { setCloseDay(e.target.value); if (tpl) applyTemplate(tpl, e.target.value); else setQuote(null); }} />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(e) => { setCategory(e.target.value); setQuote(null); }}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm capitalize">
            {PANTA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      {!times.ok && <p className="text-xs text-loss">The market must close after it opens. Panta opens markets at least 1 hour from now.</p>}
      <p className="text-xs text-muted-foreground">Panta opens new markets about 1 hour after creation. Trading closes at the date above.</p>

      <Field label="Market image (square, public link)">
        <div className="flex items-center gap-3">
          {imageUrl && <img src={imageUrl} alt="" className="h-12 w-12 rounded-md border border-border object-cover" />}
          <Input value={imageUrl} onChange={(e) => { setImageUrl(e.target.value); setQuote(null); }} placeholder="https://…" className="font-mono text-xs" />
        </div>
        <label className="mt-2 inline-block cursor-pointer text-xs text-primary underline">
          {uploading ? "Uploading…" : "Upload an image instead"}
          <input type="file" accept="image/*" className="hidden" disabled={uploading || !wallet}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </Field>

      {!wallet || !hasKey ? (
        <p className="text-sm text-muted-foreground">Sign in and create your Solana wallet to create a market.</p>
      ) : !quote ? (
        <Button className="w-full" disabled={!valid || busy !== null} onClick={getQuote}>
          {busy === "quote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          See creation fee
        </Button>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-y-1 rounded-md border border-border bg-background p-3 font-mono text-xs">
            <dt className="text-muted-foreground">Creation fee</dt><dd className="text-right font-bold">{fmtUsd(fee)}</dd>
            <dt className="text-muted-foreground">Seeds the market</dt><dd className="text-right">{fmtUsd(Number(quote.liquidityInjectionUsdc) / 1e6)}</dd>
            <dt className="text-muted-foreground">Panta keeps</dt><dd className="text-right">{fmtUsd(Number(quote.platformRevenueUsdc) / 1e6)}</dd>
            <dt className="text-muted-foreground">Your USDC</dt><dd className="text-right">{quote.balance === null ? "—" : fmtUsd(quote.balance)}</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            The fee is paid in USDC from your Solana wallet and is not refundable. As creator you can claim the market's creator fees once it graduates. This session lasts about 5 minutes.
          </p>
          {short && <p className="text-sm text-loss">Not enough USDC. You need {fmtUsd(fee)}.</p>}
          {!sumOk && <p className="text-sm text-loss">Panta's fee parts don't add up to the total. Creation is blocked until this is checked.</p>}
          <Button className="w-full" disabled={!!short || !sumOk || busy !== null} onClick={create}>
            {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create market for {fmtUsd(fee)}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-loss">{error}</p>}
      <PreviewLockBanner />
      {modal}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
