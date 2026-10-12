// stub: lives in private Degen Terminal codebase
// The real signer layer covers legacy encrypted keys and Privy embedded
// wallets behind one interface. Panta code only needs signTransaction.
import type { VersionedTransaction } from "@solana/web3.js";

export interface SolanaTxSigner {
  publicKey: string;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
}

export function getWalletSigner(_opts: { password: string | null; encryptedSolKey?: string }): { solana(): Promise<SolanaTxSigner> } {
  return {
    async solana() {
      throw new Error("stub: wallet signing lives in the private Degen Terminal codebase");
    },
  };
}
