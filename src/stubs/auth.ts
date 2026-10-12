// stub: lives in private Degen Terminal codebase
// The real app gets this from Privy (`getAccessToken` in @privy-io/react-auth).
// panta-proxy verifies the token server-side before any write.
export async function getAccessToken(): Promise<string | null> {
  return null;
}
