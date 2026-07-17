import type {
  AssetClass,
  MarketPriceProvider,
  MarketPriceQuote,
} from "./contracts";
import { TradingError } from "./errors";

const REQUEST_TIMEOUT_MS = 7_000;

export async function fetchJsonWithTimeout<T>(
  providerId: string,
  url: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "ZAINEX-InteliTrader/1.0",
      },
    });

    if (!response.ok) {
      throw new TradingError(
        "PRICE_PROVIDER_HTTP_ERROR",
        `${providerId} returned HTTP ${response.status}.`,
        502,
        {
          provider: providerId,
          httpStatus: response.status,
        },
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TradingError) {
      throw error;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown provider error";

    throw new TradingError(
      "PRICE_PROVIDER_REQUEST_FAILED",
      `${providerId} market-price request failed.`,
      502,
      {
        provider: providerId,
        reason: message,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export class MarketPriceProviderRegistry {
  constructor(
    private readonly providers: readonly MarketPriceProvider[],
  ) {}

  async getPrice(
    assetClass: AssetClass,
    symbol: string,
  ): Promise<MarketPriceQuote> {
    const compatibleProviders = this.providers.filter((provider) =>
      provider.supports(assetClass, symbol),
    );

    if (compatibleProviders.length === 0) {
      throw new TradingError(
        "UNSUPPORTED_MARKET",
        "No market-price provider supports this asset.",
        400,
        {
          assetClass,
          symbol,
        },
      );
    }

    const attempts: Array<{
      provider: string;
      reason: string;
    }> = [];

    for (const provider of compatibleProviders) {
      try {
        return await provider.getPrice(assetClass, symbol);
      } catch (error) {
        attempts.push({
          provider: provider.id,
          reason:
            error instanceof Error
              ? error.message
              : "Unknown provider error",
        });
      }
    }

    throw new TradingError(
      "MARKET_PRICE_UNAVAILABLE",
      "All compatible market-price providers failed.",
      502,
      {
        assetClass,
        symbol,
        attempts,
      },
    );
  }
}
