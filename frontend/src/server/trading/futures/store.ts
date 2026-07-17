import type {
  FuturesAccountState,
} from "./contracts";

import {
  FUTURES_INITIAL_BALANCE,
} from "./contracts";

type SessionTask<T> =
  () => Promise<T>;

export class FuturesAccountStore {
  private readonly accounts =
    new Map<string, FuturesAccountState>();

  private readonly locks =
    new Map<string, Promise<void>>();

  readOrCreate(
    sessionId: string,
  ): FuturesAccountState {
    const existing =
      this.accounts.get(sessionId);

    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();

    const account: FuturesAccountState = {
      sessionId,
      currency: "USDT",
      initialBalance:
        FUTURES_INITIAL_BALANCE,
      availableBalance:
        FUTURES_INITIAL_BALANCE,
      realizedPnl: 0,
      positions: {},
      orders: [],
      trades: [],
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(
      sessionId,
      account,
    );

    return account;
  }

  save(
    account: FuturesAccountState,
  ): void {
    this.accounts.set(
      account.sessionId,
      account,
    );
  }

  async withSessionLock<T>(
    sessionId: string,
    task: SessionTask<T>,
  ): Promise<T> {
    const previous =
      this.locks.get(sessionId) ??
      Promise.resolve();

    let release:
      | (() => void)
      | undefined;

    const gate = new Promise<void>(
      (resolve) => {
        release = resolve;
      },
    );

    const tail = previous.then(
      () => gate,
    );

    this.locks.set(
      sessionId,
      tail,
    );

    await previous;

    try {
      return await task();
    }
    finally {
      release?.();

      if (
        this.locks.get(sessionId) ===
        tail
      ) {
        this.locks.delete(sessionId);
      }
    }
  }
}

const globalWithFuturesStore =
  globalThis as typeof globalThis & {
    __zainexFuturesAccountStore?:
      FuturesAccountStore;
  };

export const futuresAccountStore =
  globalWithFuturesStore
    .__zainexFuturesAccountStore ??
  new FuturesAccountStore();

globalWithFuturesStore
  .__zainexFuturesAccountStore =
  futuresAccountStore;