import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Target } from "lucide-react";
import { panta, pantaMessage } from "../api/pantaClient";
import { PANTA_CATEGORIES } from "../api/config";
import type { PantaMarket, TokenPrefill } from "../types/panta";
import { BuyPanel } from "./BuyPanel";
import { CreateMarket } from "./CreateMarket";
import { Positions } from "./Positions";
import { NoExitNotice, PoweredByPanta, pct } from "./shared";
import { cn } from "../stubs/ui";

type View = "markets" | "positions" | "create";

export default function Predict() {
  const [params, setParams] = useSearchParams();
  const prefill = useMemo<TokenPrefill | null>(() => {
    const address = params.get("token");
    if (!address || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return null;
    return {
      address,
      symbol: (params.get("sym") ?? "TOKEN").replace(/[^A-Za-z0-9]/g, "").slice(0, 16) || "TOKEN",
      logo: params.get("logo")?.startsWith("https://") ? params.get("logo")! : undefined,
      pumpfun: params.get("pf") === "1",
    };
  }, [params]);

  const [view, setView] = useState<View>(prefill ? "create" : "markets");
  const [category, setCategory] = useState<string>("");
  const [markets, setMarkets] = useState<PantaMarket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PantaMarket | null>(null);

  const [categories, setCategories] = useState<string[]>([...PANTA_CATEGORIES]);
  useEffect(() => {
    panta<{ categories: string[] }>("categories").then((r) => { if (r.categories?.length) setCategories(r.categories); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (view !== "markets") return;
    setMarkets(null); setError(null);
    panta<{ items: PantaMarket[] }>("markets", { status: "primary", limit: 40, ...(category ? { category } : {}) })
      .then((r) => setMarkets((r.items ?? []).filter((m) => m.phase === "primary" && !m.resolved && m.title?.trim())))
      .catch((e) => setError(pantaMessage(e)));
  }, [view, category]);

  const openMarket = async (id: string) => {
    try { setSelected(await panta<PantaMarket>("market", { marketId: id })); setView("markets"); }
    catch (e) { setError(pantaMessage(e)); }
  };

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 py-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Target className="h-6 w-6 text-primary" />Predict</h1>
          <p className="mt-1 text-sm text-muted-foreground">YES/NO prediction markets on Solana, paid in USDC.</p>
        </div>
        <PoweredByPanta className="px-3 py-1.5 text-sm" />
      </header>

      <NoExitNotice />

      <nav className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {(["markets", "positions", "create"] as View[]).map((v) => (
          <button key={v} onClick={() => { setView(v); setSelected(null); if (v !== "create" && params.get("token")) setParams({}); }}
            className={cn("min-h-10 flex-1 rounded-md text-sm font-medium capitalize", view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
            {v === "create" ? "Create market" : v}
          </button>
        ))}
      </nav>

      {view === "create" && <CreateMarket prefill={prefill} onCreated={(id) => { setParams({}); void openMarket(id); }} />}
      {view === "positions" && <Positions />}

      {view === "markets" && selected && (
        <div className="space-y-3">
          <button onClick={() => setSelected(null)} className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />All markets
          </button>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex gap-3">
                {selected.images?.[0] && <img src={selected.images[0]} alt="" className="h-16 w-16 rounded-md object-cover" />}
                <div>
                  <h2 className="text-lg font-semibold leading-snug">{selected.title}</h2>
                  <p className="font-mono text-xs capitalize text-muted-foreground">{selected.category} · closes {new Date(selected.endTime * 1000).toUTCString().slice(5, 22)} UTC</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono">
                <div className="rounded-md border border-profit/40 bg-profit/10 p-3"><p className="text-xs text-muted-foreground">YES</p><p className="text-xl font-bold text-profit">{pct(selected.yesPrice)}</p></div>
                <div className="rounded-md border border-loss/40 bg-loss/10 p-3"><p className="text-xs text-muted-foreground">NO</p><p className="text-xl font-bold text-loss">{pct(selected.noPrice)}</p></div>
              </div>
              {selected.description && <p className="whitespace-pre-line text-sm text-muted-foreground">{selected.description}</p>}
            </div>
            <BuyPanel market={selected} />
          </div>
        </div>
      )}

      {view === "markets" && !selected && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {["", ...categories].map((c) => (
              <button key={c || "all"} onClick={() => setCategory(c)}
                className={cn("min-h-9 shrink-0 rounded-md border px-3 text-xs capitalize", category === c ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                {c || "All"}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-loss">{error}</p>}
          {!markets && !error && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading markets…</div>}
          {markets?.length === 0 && <p className="text-sm text-muted-foreground">No open markets in this category.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {markets?.map((m) => (
              <button key={m.marketId} onClick={() => openMarket(m.marketId)}
                className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-primary/50">
                {m.images?.[0] && <img src={m.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" loading="lazy" />}
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-medium">{m.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] capitalize text-muted-foreground">
                    {m.category} · ${Number(m.volumeUsdc ?? 0).toLocaleString()} vol · closes {new Date(m.endTime * 1000).toISOString().slice(0, 10)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
