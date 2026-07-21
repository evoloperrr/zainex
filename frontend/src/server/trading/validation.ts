import type {
  AssetClass,
  OrderSide,
  OrderType,
  ValidatedOrderRequest,
} from "./contracts";
import { TradingError } from "./errors";

const MAX_QUANTITY = 1_000_000;
const CLIENT_ORDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;
const NORMALIZED_SYMBOL_PATTERN = /^[A-Z0-9]{5,24}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];

  return typeof value === "string" ? value.trim() : undefined;
}

function normalizeCryptoSymbol(rawSymbol: string): string {
  return rawSymbol
    .trim()
    .toUpperCase()
    .replace(/[\s\-_/.:]/g, "");
}

function parseQuantity(value: unknown): number {
  const quantity =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new TradingError(
      "INVALID_QUANTITY",
      "Quantity must be a positive finite number.",
      400,
    );
  }

  if (quantity > MAX_QUANTITY) {
    throw new TradingError(
      "QUANTITY_LIMIT_EXCEEDED",
      `Quantity cannot exceed ${MAX_QUANTITY}.`,
      400,
    );
  }

  return quantity;
}

function parseOptionalPrice(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return undefined;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new TradingError(
      "INVALID_PRICE_LEVEL",
      `${fieldName} must be a positive finite number.`,
      400,
    );
  }

  return parsed;
}

export function parseOrderRequest(
  input: unknown,
): ValidatedOrderRequest {
  if (!isRecord(input)) {
    throw new TradingError(
      "INVALID_REQUEST_BODY",
      "The order request must be a JSON object.",
      400,
    );
  }

  const adapter = (readString(input, "adapter") ?? "paper").toLowerCase();

  if (adapter !== "paper") {
    throw new TradingError(
      "ADAPTER_NOT_AVAILABLE",
      "Only the paper adapter is enabled in Trading Core V1.",
      400,
      {
        requestedAdapter: adapter,
        enabledAdapters: ["paper"],
      },
    );
  }

  const assetClassValue = (
    readString(input, "assetClass") ?? "crypto"
  ).toLowerCase();

  if (
    assetClassValue !== "crypto" &&
    assetClassValue !== "forex" &&
    assetClassValue !== "stocks"
  ) {
    throw new TradingError(
      "INVALID_ASSET_CLASS",
      "Asset class must be crypto, forex, or stocks.",
      400,
    );
  }

  const assetClass = assetClassValue as AssetClass;

  if (assetClass !== "crypto") {
    throw new TradingError(
      "ASSET_CLASS_NOT_AVAILABLE",
      "Trading Core V1 currently enables crypto paper trading only.",
      400,
      {
        requestedAssetClass: assetClass,
        enabledAssetClasses: ["crypto"],
      },
    );
  }

  const rawSymbol = readString(input, "symbol");

  if (!rawSymbol) {
    throw new TradingError(
      "SYMBOL_REQUIRED",
      "A trading symbol is required.",
      400,
    );
  }

  const symbol = normalizeCryptoSymbol(rawSymbol);

  if (!NORMALIZED_SYMBOL_PATTERN.test(symbol)) {
    throw new TradingError(
      "INVALID_SYMBOL",
      "The symbol format is invalid.",
      400,
    );
  }

  const sideValue = readString(input, "side")?.toUpperCase();

  if (sideValue !== "BUY" && sideValue !== "SELL") {
    throw new TradingError(
      "INVALID_ORDER_SIDE",
      "Order side must be BUY or SELL.",
      400,
    );
  }

  const side = sideValue as OrderSide;
  const typeValue = (readString(input, "type") ?? "MARKET").toUpperCase();

  if (typeValue !== "MARKET") {
    throw new TradingError(
      "ORDER_TYPE_NOT_AVAILABLE",
      "Trading Core V1 currently enables MARKET paper orders only.",
      400,
    );
  }

  const type = typeValue as OrderType;
  const quantity = parseQuantity(input.quantity);

  const stopLoss = parseOptionalPrice(
    input.stopLoss,
    "stopLoss",
  );

  const takeProfit = parseOptionalPrice(
    input.takeProfit,
    "takeProfit",
  );

  const clientOrderId = readString(input, "clientOrderId");

  if (
    clientOrderId &&
    !CLIENT_ORDER_ID_PATTERN.test(clientOrderId)
  ) {
    throw new TradingError(
      "INVALID_CLIENT_ORDER_ID",
      "clientOrderId may contain only letters, numbers, dot, underscore, colon, and hyphen.",
      400,
    );
  }

  return {
    adapter,
    assetClass,
    symbol,
    side,
    type,
    quantity,
    ...(stopLoss !== undefined ? { stopLoss } : {}),
    ...(takeProfit !== undefined ? { takeProfit } : {}),
    ...(clientOrderId ? { clientOrderId } : {}),
  };
}
