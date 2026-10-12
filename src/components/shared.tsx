import { ArrowUpRight, Lock, ShieldAlert } from "lucide-react";
import { PANTA_BROADCAST_ALLOWED, PANTA_URL } from "../api/config";
import { cn } from "../stubs/ui";

/** Mandatory attribution — exact wording, linked, never minimized. */
export function PoweredByPanta({ className }: { className?: string }) {
  return (
    <a
      href={PANTA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs font-semibold text-foreground transition-colors hover:border-primary/60",
        className,
      )}
    >
      Powered by Panta
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
    </a>
  );
}

/** The most important copy in the feature: no exit before resolution. */
export function NoExitNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg border-2 border-warning/60 bg-warning/10 p-3 text-left">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-bold text-foreground">You can't sell this position.</p>
          <p className="mt-1 text-sm leading-5 text-foreground/90">
            There is no way to exit before the market resolves. Your USDC is locked until then.
            {!compact && " If your side wins, each share pays about $1. If it loses, you get nothing."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PreviewLockBanner() {
  if (PANTA_BROADCAST_ALLOWED) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Preview build: quotes are live, but nothing is signed or sent. Panta runs on Solana mainnet only,
        so real buys and market creation work on the live site.
      </span>
    </div>
  );
}

export const fmtUsd = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `$${n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const pct = (p: string | null | undefined) => (p == null ? "—" : `${Math.round(Number(p) * 100)}%`);
