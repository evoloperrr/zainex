import type {
  AssetClass,
  MarketPriceProvider,
  MarketPriceQuote,
} from "../contracts";
import {
  fetchJsonWithTimeout,
} from "../market-price-provider";
import { TradingError } from "../errors";

interface BinanceTickerResponse {
  symbol?: string;
  price?: string;
  code?: number;
  msg?: string;
}

export class BinancePublicPriceProvider
  implements MarketPriceProvider
{
  readonly id = "binance-public";

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
        "BINANCE_SYMBOL_UNSUPPORTED",
        "Binance public pricing does not support this request.",
        400,
      );
    }

    const url =
      "https://api.binance.com/api/v3/ticker/price" +
      `?symbol=${encodeURIComponent(symbol)}`;

    const payload = await fetchJsonWithTimeout<BinanceTickerResponse>(
      this.id,
      url,
    );

    const price = Number(payload.price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new TradingError(
        "BINANCE_PRICE_INVALID",
        "Binance returned an invalid market price.",
        502,
        {
          symbol,
          providerMessage: payload.msg,
        },
      );
    }

    return {
      provider: this.id,
      assetClass,
      symbol,
      price,
      timestamp: new Date().toISOString(),
    };
  }
}
