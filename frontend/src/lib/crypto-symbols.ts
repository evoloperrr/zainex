export const SUPPORTED_CRYPTO_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
] as const;

export type CryptoSymbol =
  (typeof SUPPORTED_CRYPTO_SYMBOLS)[number];

export const CRYPTO_SYMBOL_LABELS: Record<
  CryptoSymbol,
  string
> = {
  BTCUSDT: "BTC / USDT",
  ETHUSDT: "ETH / USDT",
  SOLUSDT: "SOL / USDT",
  BNBUSDT: "BNB / USDT",
  XRPUSDT: "XRP / USDT",
  ADAUSDT: "ADA / USDT",
  DOGEUSDT: "DOGE / USDT",
};

export const CRYPTO_ASSET_NAMES: Record<
  CryptoSymbol,
  string
> = {
  BTCUSDT: "Bitcoin",
  ETHUSDT: "Ethereum",
  SOLUSDT: "Solana",
  BNBUSDT: "BNB",
  XRPUSDT: "XRP",
  ADAUSDT: "Cardano",
  DOGEUSDT: "Dogecoin",
};

export function isSupportedCryptoSymbol(
  value: string,
): value is CryptoSymbol {
  return (
    SUPPORTED_CRYPTO_SYMBOLS as readonly string[]
  ).includes(value);
}
