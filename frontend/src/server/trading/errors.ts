export type TradingErrorDetails = Record<string, unknown>;

export class TradingError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: TradingErrorDetails;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: TradingErrorDetails,
  ) {
    super(message);
    this.name = "TradingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface NormalizedTradingError {
  status: number;
  body: {
    ok: false;
    error: {
      code: string;
      message: string;
      details?: TradingErrorDetails;
    };
  };
}

export function normalizeTradingError(
  error: unknown,
): NormalizedTradingError {
  if (error instanceof TradingError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
    };
  }

  console.error("[zainex-trading] unhandled error", error);

  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: "INTERNAL_TRADING_ERROR",
        message: "The trading service could not complete the request.",
      },
    },
  };
}
