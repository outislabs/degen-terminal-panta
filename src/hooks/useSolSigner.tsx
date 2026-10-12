import { useCallback, useState } from "react";
import { toast } from "sonner";
import { UnlockWalletModal, useWallet } from "../stubs/wallet";
import { getWalletSigner, type SolanaTxSigner as Keypair } from "../stubs/signer";

/** Ask for the wallet password, then run an action with the Solana keypair. */
export function useSolSigner() {
  const { solAddress, encryptedSolKey, privySol } = useWallet();
  const [pending, setPending] = useState<((kp: Keypair) => Promise<void>) | null>(null);

  const request = useCallback((fn: (kp: Keypair) => Promise<void>) => {
    // Privy Solana wallet: no password step, sign straight away via Privy.
    if (privySol) {
      void (async () => fn(await getWalletSigner({ password: null }).solana()))().catch((e) =>
        toast.error(e instanceof Error ? e.message : "Signing failed"),
      );
      return;
    }
    setPending(() => fn);
  }, [privySol]);

  const modal = (
    <UnlockWalletModal
      open={!!pending}
      onClose={() => setPending(null)}
      onUnlocked={async (pw) => {
        const fn = pending;
        setPending(null);
        if (!fn || !encryptedSolKey) return;
        const signer = await getWalletSigner({ password: pw, encryptedSolKey }).solana();
        await fn(signer);
      }}
    />
  );
  return { wallet: solAddress as string | null, hasKey: !!encryptedSolKey || privySol, request, modal };
}
