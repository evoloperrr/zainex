"use client";

import {
  useState,
} from "react";

type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d";

type Analysis = {
  recommendation:
    | "BUY"
    | "SELL"
    | "WAIT";
  suggestedAction:
    | "LONG"
    | "SHORT"
    | "NO_TRADE";
  trend:
    | "BULLISH"
    | "BEARISH"
    | "SIDEWAYS";
  confidence: number;
  price: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskLevel:
    | "LOW"
    | "MEDIUM"
    | "HIGH";
  signalScore: number;
  reasons: string[];
  warnings: string[];
  indicators: {
    ema9: number;
    ema21: number;
    rsi14: number;
    macdHistogram: number;
    atr14: number;
    support: number;
    resistance: number;
    relativeVolume: number;
    volumeDirection: string;
  };
  candleCount: number;
  timeframe: Timeframe;
  provider: string;
  model: string;
  source:
    | "openai"
    | "fallback";
  autoExecute: false;
};

type ApiResponse = {
  ok: boolean;
  analysis?: Analysis;
  error?: {
    message?: string;
  };
};

type FuturesSignal =
  | "LONG"
  | "SHORT"
  | "WAIT";

const TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "1h",
  "4h",
  "1d",
];

const cardStyle = {
  border:
    "1px solid rgba(139,116,255,.28)",
  borderRadius: 12,
  background:
    "rgba(10,15,30,.96)",
  padding: 15,
} as const;

function price(
  value: number,
): string {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return "--";
  }

  return value.toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

function toFuturesSignal(
  analysis: Analysis,
): FuturesSignal {
  if (
    analysis.recommendation ===
    "BUY"
  ) {
    return "LONG";
  }

  if (
    analysis.recommendation ===
    "SELL"
  ) {
    return "SHORT";
  }

  return "WAIT";
}

function toPositionBias(
  analysis: Analysis,
): FuturesSignal {
  if (
    analysis.suggestedAction ===
    "LONG"
  ) {
    return "LONG";
  }

  if (
    analysis.suggestedAction ===
    "SHORT"
  ) {
    return "SHORT";
  }

  return "WAIT";
}

export function FuturesAiSignalPanel({
  symbol = "BTCUSDT",
  symbolLabel = "BTCUSDT",
  onApplyLevels,
}: {
  symbol?: string;
  symbolLabel?: string;
  onApplyLevels?: (levels: {
    stopLoss: number;
    takeProfit: number;
  }) => void;
}) {
  const [
    timeframe,
    setTimeframe,
  ] = useState<Timeframe>("15m");

  const [
    analysis,
    setAnalysis,
  ] = useState<Analysis | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  const analyze = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/trading/futures/ai/analyze",
        {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            timeframe,
            symbol,
          }),
        },
      );

      const payload =
        (await response.json()) as
          ApiResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.analysis
      ) {
        throw new Error(
          payload.error?.message ??
            "Futures AI analysis failed.",
        );
      }

      setAnalysis(payload.analysis);

      if (
        onApplyLevels &&
        payload.analysis.recommendation !==
          "WAIT" &&
        payload.analysis.stopLoss > 0 &&
        payload.analysis.takeProfit > 0
      ) {
        onApplyLevels({
          stopLoss:
            payload.analysis.stopLoss,
          takeProfit:
            payload.analysis.takeProfit,
        });
      }
    }
    catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Futures AI analysis failed.",
      );
    }
    finally {
      setLoading(false);
    }
  };

  const futuresSignal =
    analysis
      ? toFuturesSignal(analysis)
      : "WAIT";

  const positionBias =
    analysis
      ? toPositionBias(analysis)
      : "WAIT";

  const signalColor =
    futuresSignal === "LONG"
      ? "#6ce5b5"
      : futuresSignal === "SHORT"
        ? "#c48cff"
        : "#ffd36f";

  const confidenceText =
    analysis?.source === "openai"
      ? `${analysis.confidence}%`
      : "N/A";

  return (
    <section
      style={{
        ...cardStyle,
        display: "grid",
        gap: 14,
        padding: 18,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent:
            "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <span
            style={{
              display: "block",
              color: "#9d8cff",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 1.2,
            }}
          >
            GPT FUTURES ANALYST
          </span>

          <strong
            style={{
              display: "block",
              marginTop: 5,
              color: "#f5f6ff",
              fontSize: 23,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            INTELIBRAIN V1
          </strong>

          <small
            style={{
              display: "block",
              marginTop: 7,
              color: "#9aa4bd",
              fontSize: 13,
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            {symbolLabel} · USDT-M
            PERPETUAL · MANUAL
            FUTURES SIGNAL
          </small>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <select
            aria-label="Futures analysis timeframe"
            value={timeframe}
            disabled={loading}
            onChange={(event) => {
              setTimeframe(
                event.target
                  .value as Timeframe,
              );
            }}
            style={{
              minHeight: 42,
              border:
                "1px solid rgba(145,126,255,.35)",
              borderRadius: 9,
              color: "#e2e5f5",
              background: "#12182b",
              padding: "0 13px",
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {TIMEFRAMES.map(
              (option) => (
                <option
                  value={option}
                  key={option}
                >
                  {option}
                </option>
              ),
            )}
          </select>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              void analyze();
            }}
            style={{
              minHeight: 42,
              border: 0,
              borderRadius: 9,
              padding: "0 18px",
              color: "#111426",
              background:
                "linear-gradient(135deg,#72dcff,#9b7cff)",
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 0.3,
              cursor: loading
                ? "wait"
                : "pointer",
            }}
          >
            {loading
              ? "ANALYZING..."
              : "ANALYZE"}
          </button>
        </div>
      </header>

      {error ? (
        <div
          style={{
            ...cardStyle,
            borderColor:
              "rgba(255,100,130,.38)",
            color: "#ff9eb5",
            background:
              "rgba(255,70,110,.055)",
            fontSize: 14,
            fontWeight: 500,
            lineHeight: 1.65,
          }}
        >
          FUTURES AI UNAVAILABLE:
          {" "}
          {error}
        </div>
      ) : null}

      {!analysis && !error ? (
        <div
          style={{
            ...cardStyle,
            color: "#b3bdd3",
            fontSize: 15,
            fontWeight: 400,
            lineHeight: 1.75,
          }}
        >
          Click ANALYZE.
          InteliBrain will inspect
          Binance Futures closed
          candles, volatility, trend,
          momentum, volume, support,
          resistance and risk metrics
          before returning a
          LONG, SHORT, or WAIT signal.
        </div>
      ) : null}

      {analysis ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(190px,1fr))",
              gap: 10,
            }}
          >
            {[
              [
                "FUTURES SIGNAL",
                futuresSignal,
              ],
              [
                "POSITION BIAS",
                positionBias,
              ],
              [
                "CONFIDENCE",
                confidenceText,
              ],
              [
                "MARKET TREND",
                analysis.trend,
              ],
              [
                "RISK LEVEL",
                analysis.riskLevel,
              ],
              [
                "TECHNICAL SCORE",
                String(
                  analysis.signalScore,
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={cardStyle}
              >
                <span
                  style={{
                    display: "block",
                    color: "#909bb6",
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: 0.35,
                  }}
                >
                  {label}
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: 8,
                    color:
                      label ===
                        "FUTURES SIGNAL" ||
                      label ===
                        "POSITION BIAS"
                        ? signalColor
                        : "#f0f2ff",
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 1.25,
                  }}
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit,minmax(230px,1fr))",
              gap: 10,
            }}
          >
            {[
              [
                "MARK PRICE",
                price(analysis.price),
              ],
              [
                "SUGGESTED ENTRY",
                price(analysis.entry),
              ],
              [
                "STOP LOSS",
                price(
                  analysis.stopLoss,
                ),
              ],
              [
                "TAKE PROFIT",
                price(
                  analysis.takeProfit,
                ),
              ],
              [
                "SUPPORT",
                price(
                  analysis.indicators
                    .support,
                ),
              ],
              [
                "RESISTANCE",
                price(
                  analysis.indicators
                    .resistance,
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                style={cardStyle}
              >
                <span
                  style={{
                    display: "block",
                    color: "#929db8",
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  {label}
                </span>

                <strong
                  style={{
                    display: "block",
                    marginTop: 8,
                    color: "#f0f2ff",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  {value}
                </strong>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <span
              style={{
                display: "block",
                color: "#a5afc8",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              FUTURES ANALYSIS
            </span>

            <ul
              style={{
                display: "grid",
                gap: 8,
                margin:
                  "11px 0 0 21px",
                padding: 0,
                color: "#d0d5e5",
                fontSize: 14,
                fontWeight: 400,
                lineHeight: 1.7,
              }}
            >
              {analysis.reasons.map(
                (reason) => (
                  <li key={reason}>
                    {reason}
                  </li>
                ),
              )}
            </ul>
          </div>

          {analysis.warnings.length >
          0 ? (
            <div
              style={{
                ...cardStyle,
                borderColor:
                  "rgba(255,199,92,.3)",
                color: "#f2cf83",
                background:
                  "rgba(255,179,61,.045)",
                fontSize: 14,
                fontWeight: 500,
                lineHeight: 1.7,
              }}
            >
              <strong
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 12,
                  letterSpacing: 0.5,
                }}
              >
                SYSTEM STATUS
              </strong>

              {analysis.warnings.join(
                " | ",
              )}
            </div>
          ) : null}

          <footer
            style={{
              display: "grid",
              gap: 5,
              color: "#99a4bd",
              fontSize: 12,
              fontWeight: 400,
              lineHeight: 1.6,
            }}
          >
            <span>
              {analysis.provider} ·{" "}
              {symbolLabel} USDT-M
              PERPETUAL ·{" "}
              {analysis.timeframe} ·{" "}
              {analysis.candleCount}{" "}
              closed candles
            </span>

            <span>
              SOURCE:{" "}
              {analysis.source ===
              "openai"
                ? `${analysis.model} GPT ANALYSIS`
                : "SAFE WAIT FALLBACK"}
            </span>

            {onApplyLevels &&
            analysis.recommendation !==
              "WAIT" &&
            analysis.stopLoss > 0 &&
            analysis.takeProfit > 0 ? (
              <span
                style={{
                  color: "#6ce5b5",
                }}
              >
                Stop loss and take
                profit were auto-filled
                into your order form
                below.
              </span>
            ) : null}

            <strong
              style={{
                color: "#a99aff",
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 0.45,
              }}
            >
              MANUAL FUTURES SIGNAL
              ONLY — AI DOES NOT
              EXECUTE TRADES
            </strong>
          </footer>
        </>
      ) : null}
    </section>
  );
}