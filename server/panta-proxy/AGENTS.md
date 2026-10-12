# Panta rules

- Panta prediction markets are reached only through the `panta-proxy` edge function (allowlisted actions, Privy-verified, caller's own Solana wallet enforced, cached reads, per-family 429 cooldown); the browser never sees PANTA_API_KEY — it is one live key whose rate limits are shared by every user.
- Panta signing/broadcast is gated by PANTA_BROADCAST_ALLOWED (production only unless explicitly overridden), because Panta has no testnet and every signed transaction moves real mainnet USDC.
- Deploy with `verify_jwt = false`: the function verifies Privy tokens itself (Supabase JWT checks would reject them).
