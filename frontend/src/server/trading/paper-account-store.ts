import {
  PAPER_TRADING_INITIAL_BALANCE,
  type PaperAccountState,
} from "./contracts";

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createAccount(sessionId: string): PaperAccountState {
  const now = new Date().toISOString();

  return {
    sessionId,
    currency: "USD",
    initialBalance: PAPER_TRADING_INITIAL_BALANCE,
    cashBalance: PAPER_TRADING_INITIAL_BALANCE,
    realizedPnl: 0,
    positions: {},
    orders: [],
    trades: [],
    createdAt: now,
    updatedAt: now,
  };
}

export class PaperAccountStore {
  private readonly accounts = new Map<string, PaperAccountState>();
  private readonly locks = new Map<string, Promise<void>>();

  readOrCreate(sessionId: string): PaperAccountState {
    const existing = this.accounts.get(sessionId);

    if (existing) {
      return cloneValue(existing);
    }

    const created = createAccount(sessionId);
    this.accounts.set(sessionId, cloneValue(created));

    return created;
  }

  save(account: PaperAccountState): void {
    this.accounts.set(account.sessionId, cloneValue(account));
  }

  async withAccountLock<T>(
    sessionId: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const previous = this.locks.get(sessionId) ?? Promise.resolve();

    let releaseCurrent: () => void = () => undefined;

    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });

    this.locks.set(
      sessionId,
      previous.then(() => current),
    );

    await previous;

    try {
      return await task();
    } finally {
      releaseCurrent();
    }
  }
}

const globalWithPaperStore = globalThis as typeof globalThis & {
  __zainexPaperAccountStore?: PaperAccountStore;
};

export const paperAccountStore =
  globalWithPaperStore.__zainexPaperAccountStore ??
  new PaperAccountStore();

globalWithPaperStore.__zainexPaperAccountStore =
  paperAccountStore;
