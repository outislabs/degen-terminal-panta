// stub: lives in private Degen Terminal codebase
// The real useWallet reads the user's wallet record; the real modal asks for
// the wallet password (held in memory only) to unlock a legacy key.

export function useWallet(): { solAddress: string | null; encryptedSolKey: string | null; privySol: boolean } {
  return { solAddress: null, encryptedSolKey: null, privySol: false };
}

export function UnlockWalletModal(_props: { open: boolean; onClose: () => void; onUnlocked: (password: string) => Promise<void> }) {
  return null;
}
