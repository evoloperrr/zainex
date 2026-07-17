import type {
  AssetClass,
  MarketPriceProvider,
  MarketPriceQuote,
} from "../contracts";
import {
  fetchJsonWithTimeout,
} from "../market-price-provider";
import { TradingError } from "../errors";

interface OkxTickerItem {
  instId?: string;
  last?: string;
  ts?: string;
}

interface OkxTickerResponse {
  code?: string;
  msg?: string;
  data?: OkxTickerItem[];
}

const QUOTE_CURRENCIES = [
  "USDT",
  "USDC",
  "USD",
  "BTC",
  "ETH",
] as const;

function toOkxInstrumentId(symbol: string): string | null {
  for (const quote of QUOTE_CURRENCIES) {
    if (
      symbol.endsWith(quote) &&
      symbol.length > quote.length
    ) {
      const base = symbol.slice(0, -quote.length);
      return `${base}-${quote}`;
    }
  }

  return null;
}

export class OkxPublicPriceProvider
  implements MarketPriceProvider
{
  readonly id = "okx-public";

  supports(assetClass: AssetClass, symbol: string): boolean {
    return (
      assetClass === "crypto" &&
      toOkxInstrumentId(symbol) !== null
    );
  }

  async getPrice(
    assetClass: AssetClass,
    symbol: string,
  ): Promise<MarketPriceQuote> {
    const instrumentId = toOkxInstrumentId(symbol);

    if (assetClass !== "crypto" || !instrumentId) {
      throw new TradingError(
        "OKX_SYMBOL_UNSUPPORTED",
        "OKX public pricing does not support this request.",
        400,
      );
    }

    const url =
      "https://www.okx.com/api/v5/market/ticker" +
      `?instId=${encodeURIComponent(instrumentId)}`;

    const payload = await fetchJsonWithTimeout<OkxTickerResponse>(
      this.id,
      url,
    );

    const price = Number(payload.data?.[0]?.last);

    if (
      payload.code !== "0" ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new TradingError(
        "OKX_PRICE_INVALID",
        "OKX returned an invalid market price.",
        502,
        {
          symbol,
          instrumentId,
          providerCode: payload.code,
          providerMessage: payload.msg,
        },
      );
    }

    const timestampNumber = Number(payload.data?.[0]?.ts);
    const timestamp =
      Number.isFinite(timestampNumber) && timestampNumber > 0
        ? new Date(timestampNumber).toISOString()
        : new Date().toISOString();

    return {
      provider: this.id,
      assetClass,
      symbol,
      price,
      timestamp,
    };
  }
}
