import type { ExchangeAdapter } from "./contracts";
import { TradingError } from "./errors";

export class TradingAdapterRegistry {
  private readonly adapters = new Map<string, ExchangeAdapter>();

  constructor(adapters: readonly ExchangeAdapter[]) {
    for (const adapter of adapters) {
      if (this.adapters.has(adapter.id)) {
        throw new Error(
          `Duplicate trading adapter registered: ${adapter.id}`,
        );
      }

      this.adapters.set(adapter.id, adapter);
    }
  }

  get(adapterId: string): ExchangeAdapter {
    const adapter = this.adapters.get(adapterId);

    if (!adapter) {
      throw new TradingError(
        "TRADING_ADAPTER_NOT_FOUND",
        "The requested trading adapter is not available.",
        404,
        {
          adapterId,
          availableAdapters: [...this.adapters.keys()],
        },
      );
    }

    return adapter;
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }
}
