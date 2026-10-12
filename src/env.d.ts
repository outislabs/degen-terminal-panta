// Vite's import.meta.env, typed for the variables this extract reads.
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_PANTA_PROXY_URL?: string;
  readonly VITE_PANTA_ENABLED?: string;
  readonly VITE_PANTA_ALLOW_DEV_BROADCAST?: string;
  readonly VITE_SOLANA_RPC_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
