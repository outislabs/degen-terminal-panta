// stub: lives in private Degen Terminal codebase
// The real helper rotates across private RPC endpoints with retries.
import { Connection } from "@solana/web3.js";

export async function withSolConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
  return fn(new Connection(import.meta.env.VITE_SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed"));
}
