import type {
  FuturesDirection,
  FuturesLeverage,
  ValidatedFuturesCloseRequest,
  ValidatedFuturesOpenRequest,
} from "./contracts";

import {
  FUTURES_ALLOWED_LEVERAGE,
} from "./contracts";

import {
  TradingError,
} from "../errors";

const CLIENT_ORDER_ID_PATTERN =
  /^[A-Za-z0-9._:-]{1,80}$/;

const POSITION_ID_PATTERN =
  /^[A-Za-z0-9-]{8,80}$/;

const MIN_MARGIN = 1;
const MAX_MARGIN = 5_000;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return typeof value === "string"
    ? value.trim()
    : undefined;
}

function readPositiveNumber(
  record: Record<string, unknown>,
  key: string,
): number {
  const raw = record[key];

  const numberValue =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" &&
          raw.trim() !== ""
        ? Number(raw)
        : Number.NaN;

  if (
    !Number.isFinite(numberValue) ||
    numberValue <= 0
  ) {
    throw new TradingError(
      "INVALID_FUTURES_NUMBER",
      `${key} must be a positive finite number.`,
      400,
      {
        field: key,
      },
    );
  }

  return numberValue;
}

function parseClientOrderId(
  record: Record<string, unknown>,
): string | undefined {
  const clientOrderId =
    readString(record, "clientOrderId");

  if (
    clientOrderId &&
    !CLIENT_ORDER_ID_PATTERN.test(
      clientOrderId,
    )
  ) {
    throw new TradingError(
      "INVALID_CLIENT_ORDER_ID",
      "clientOrderId contains unsupported characters.",
      400,
    );
  }

  return clientOrderId;
}

export function parseFuturesOpenRequest(
  input: unknown,
): ValidatedFuturesOpenRequest {
  if (!isRecord(input)) {
    throw new TradingError(
      "INVALID_REQUEST_BODY",
      "The futures order request must be a JSON object.",
      400,
    );
  }

  const rawSymbol =
    readString(input, "symbol") ??
    "BTCUSDT";

  const symbol = rawSymbol
    .toUpperCase()
    .replace(/[\s\-_/.:]/g, "");

  if (symbol !== "BTCUSDT") {
    throw new TradingError(
      "FUTURES_SYMBOL_NOT_AVAILABLE",
      "Paper Futures V1 currently supports BTCUSDT only.",
      400,
      {
        requestedSymbol: symbol,
        supportedSymbols: ["BTCUSDT"],
      },
    );
  }

  const directionValue =
    readString(input, "direction")
      ?.toUpperCase();

  if (
    directionValue !== "LONG" &&
    directionValue !== "SHORT"
  ) {
    throw new TradingError(
      "INVALID_FUTURES_DIRECTION",
      "direction must be LONG or SHORT.",
      400,
    );
  }

  const direction =
    directionValue as FuturesDirection;

  const margin = readPositiveNumber(
    input,
    "margin",
  );

  if (
    margin < MIN_MARGIN ||
    margin > MAX_MARGIN
  ) {
    throw new TradingError(
      "INVALID_FUTURES_MARGIN",
      `margin must be between ${MIN_MARGIN} and ${MAX_MARGIN} USDT.`,
      400,
      {
        minimum: MIN_MARGIN,
        maximum: MAX_MARGIN,
      },
    );
  }

  const leverageNumber =
    readPositiveNumber(
      input,
      "leverage",
    );

  if (
    !FUTURES_ALLOWED_LEVERAGE.includes(
      leverageNumber as FuturesLeverage,
    )
  ) {
    throw new TradingError(
      "INVALID_FUTURES_LEVERAGE",
      "Supported leverage values are 1x, 2x, 5x, 10x and 20x.",
      400,
      {
        supportedLeverage:
          FUTURES_ALLOWED_LEVERAGE,
      },
    );
  }

  const stopLoss =
    readPositiveNumber(
      input,
      "stopLoss",
    );

  const takeProfit =
    readPositiveNumber(
      input,
      "takeProfit",
    );

  return {
    symbol: "BTCUSDT",
    direction,
    margin,
    leverage:
      leverageNumber as FuturesLeverage,
    stopLoss,
    takeProfit,
    clientOrderId:
      parseClientOrderId(input),
  };
}

export function parseFuturesCloseRequest(
  input: unknown,
): ValidatedFuturesCloseRequest {
  if (!isRecord(input)) {
    throw new TradingError(
      "INVALID_REQUEST_BODY",
      "The futures close request must be a JSON object.",
      400,
    );
  }

  const positionId =
    readString(input, "positionId");

  if (
    !positionId ||
    !POSITION_ID_PATTERN.test(positionId)
  ) {
    throw new TradingError(
      "INVALID_FUTURES_POSITION_ID",
      "A valid positionId is required.",
      400,
    );
  }

  return {
    positionId,
    clientOrderId:
      parseClientOrderId(input),
  };
}