// Compile Panta's unsigned payloads, sign with the user's Solana wallet and
// broadcast on OUR RPC. Panta never broadcasts. Every signing path goes
// through signAndSend, which refuses to run outside production builds.
import {
  PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { decodeBase64 } from "tweetnacl-util";
import type { SolanaTxSigner } from "../stubs/signer";
import { withSolConnection } from "../stubs/rpc";
import { PANTA_BROADCAST_ALLOWED, USDC_MINT } from "./config";
import type { PantaIx } from "../types/panta";

export function compileInstructions(ixs: PantaIx[], recentBlockhash: string, payer: string): VersionedTransaction {
  const instructions = ixs.map((ix) => new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    data: Buffer.from(decodeBase64(ix.data)),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
  }));
  const msg = new TransactionMessage({ payerKey: new PublicKey(payer), recentBlockhash, instructions }).compileToV0Message();
  return new VersionedTransaction(msg);
}

export function deserializeTx(base64: string): VersionedTransaction {
  return VersionedTransaction.deserialize(decodeBase64(base64));
}

export class BroadcastLockedError extends Error {
  constructor() {
    super("Preview build: the transaction was built but not signed. Panta has no testnet, so signing only works on the live site.");
  }
}

/** Sign with the user's signer, send on our RPC, wait for confirmation. */
export async function signAndSend(tx: VersionedTransaction, signer: SolanaTxSigner): Promise<string> {
  if (!PANTA_BROADCAST_ALLOWED) throw new BroadcastLockedError();
  await signer.signTransaction(tx);
  return withSolConnection(async (conn) => {
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
    const bh = tx.message.recentBlockhash;
    const { lastValidBlockHeight } = await conn.getLatestBlockhash();
    const res = await conn.confirmTransaction({ signature: sig, blockhash: bh, lastValidBlockHeight }, "confirmed");
    if (res.value.err) throw new Error("The transaction failed on-chain. No shares were bought.");
    return sig;
  });
}

/** USDC balance (human units) for a Solana owner; null when unreadable. */
export async function usdcBalance(owner: string): Promise<number | null> {
  try {
    return await withSolConnection(async (conn) => {
      const r = await conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(USDC_MINT) });
      return r.value.reduce((s, a) => s + Number(a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0);
    });
  } catch {
    return null;
  }
}
