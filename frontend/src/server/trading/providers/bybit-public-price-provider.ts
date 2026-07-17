import type {
  AssetClass,
  MarketPriceProvider,
  MarketPriceQuote,
} from "../contracts";
import {
  fetchJsonWithTimeout,
} from "../market-price-provider";
import { TradingError } from "../errors";

interface BybitTickerItem {
  symbol?: string;
  lastPrice?: string;
}

interface BybitTickerResponse {
  retCode?: number;
  retMsg?: string;
  time?: number;
  result?: {
    category?: string;
    list?: BybitTickerItem[];
  };
}

export class BybitPublicPriceProvider
  implements MarketPriceProvider
{
  readonly id = "bybit-public";

  supports(assetClass: AssetClass, symbol: string): boolean {
    return (
      assetClass === "crypto" &&
      /^[A-Z0-9]{5,24}$/.test(symbol)
    );
  }

  async getPrice(
    assetClass: AssetClass,
    symbol: string,
  ): Promise<MarketPriceQuote> {
    if (!this.supports(assetClass, symbol)) {
      throw new TradingError(
        "BYBIT_SYMBOL_UNSUPPORTED",
        "Bybit public pricing does not support this request.",
        400,
      );
    }

    const url =
      "https://api.bybit.com/v5/market/tickers" +
      `?category=spot&symbol=${encodeURIComponent(symbol)}`;

    const payload = await fetchJsonWithTimeout<BybitTickerResponse>(
      this.id,
      url,
    );

    const price = Number(payload.result?.list?.[0]?.lastPrice);

    if (
      payload.retCode !== 0 ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      throw new TradingError(
        "BYBIT_PRICE_INVALID",
        "Bybit returned an invalid market price.",
        502,
        {
          symbol,
          providerCode: payload.retCode,
          providerMessage: payload.retMsg,
        },
      );
    }

    const timestamp =
      Number.isFinite(payload.time) && Number(payload.time) > 0
        ? new Date(Number(payload.time)).toISOString()
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
