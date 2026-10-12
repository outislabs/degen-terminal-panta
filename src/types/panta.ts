// Shapes returned by Panta (via panta-proxy). Amounts are strings because
// Panta returns decimals/base units as strings; parse at the edge of display.

export type PantaPhase = "primary" | "secondary" | "resolved" | "cancelled";

export type PantaMarket = {
  marketId: string;
  category: string | null;
  title: string;
  description?: string;
  images?: string[];
  phase: PantaPhase;
  startTime: number;
  endTime: number;
  resolutionTime: number;
  resolved: boolean;
  status: string;
  volumeUsdc: string | null;
  yesPrice: string | null;
  noPrice: string | null;
};

export type PantaPosition = {
  marketId: string;
  category: string | null;
  side: "yes" | "no";
  shares: string;
  phase: PantaPhase;
  claimable: boolean;
  claimed: boolean;
  outcome: "yes" | "no" | null;
};

/** One unsigned Solana instruction as Panta returns it (data is base64). */
export type PantaIx = {
  programId: string;
  data: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
};

/** buyBuild / claimBuild / creatorFeesBuild: instructions we compile and sign ourselves. */
export type PantaInstructionsBuild = {
  orderId?: string;
  instructions: PantaIx[];
  recentBlockhash: string;
};

export type BuyQuote = {
  quoteId: string;
  shares: string;
  avgPrice: string;
  feeUsdc: string;
  expiresAt: string;
  amountUsdc: string;
  side: string;
};

/** createQuote: USDC base units (6 decimals). injection + revenue must equal payment. */
export type CreateQuote = {
  createId: string;
  paymentUsdc: string;
  liquidityInjectionUsdc: string;
  platformRevenueUsdc: string;
};

/** createBuild: a full serialized (base64) unsigned transaction. */
export type CreateBuild = { transaction: string };

export type CreateRegister = { marketId: string };

/** imageUpload: a signed direct-upload form (the image never passes through us). */
export type ImageUploadSigned = { uploadUrl: string; fields?: Record<string, unknown> };

/** Deep-link prefill for "Predict on this token". */
export type TokenPrefill = {
  address: string;
  symbol: string;
  mcapUsd?: number;
  priceUsd?: number;
  logo?: string;
  pumpfun?: boolean;
};
