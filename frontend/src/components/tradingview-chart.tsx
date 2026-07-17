"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  type CandlestickData,
  type UTCTimestamp,
} from "lightweight-charts";

export type TradingMarket =
  | "crypto"
  | "forex"
  | "stocks";

type ChartInterval =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "4h"
  | "1d";

type TradingViewChartProps = {
  market: TradingMarket;
  compact?: boolean;
};

type ApiCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

type CandleResponse = {
  ok: boolean;
  data?: ApiCandle[];
  error?: string;
};

type BinanceMessage = {
  k?: {
    t: number;
    o: string;
    h: string;
    l: string;
    c: string;
    x: boolean;
  };
};

const labels: Record<
  TradingMarket,
  string
> = {
  crypto: "BTC / USDT",
  forex: "EUR / USD",
  stocks: "NVDA",
};

const intervalOptions:
  ChartInterval[] = [
    "1m",
    "5m",
    "15m",
    "1h",
    "4h",
    "1d",
  ];

function normalize(
  rows: ApiCandle[],
): CandlestickData<UTCTimestamp>[] {
  return rows.map((row) => ({
    time: row.time as UTCTimestamp,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
  }));
}

export function TradingViewChart({
  market,
  compact = false,
}: TradingViewChartProps) {
  const canvasRef =
    useRef<HTMLDivElement>(null);

  const [chartInterval, setChartInterval] =
    useState<ChartInterval>(
      compact ? "15m" : "1h",
    );

  const [status, setStatus] =
    useState("LOADING");

  const [error, setError] =
    useState("");

  const visibleIntervals = useMemo(
    () =>
      compact
        ? intervalOptions.filter(
            (item) =>
              item === "5m" ||
              item === "15m" ||
              item === "1h" ||
              item === "4h",
          )
        : intervalOptions,
    [compact],
  );

  useEffect(() => {
    const container = canvasRef.current;

    if (!container) {
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pollingTimer: number | null = null;

    const abortController =
      new AbortController();

    const chart = createChart(
      container,
      {
        width: Math.max(
          container.clientWidth,
          320,
        ),

        height: Math.max(
          container.clientHeight,
          compact ? 230 : 450,
        ),

        layout: {
          background: {
            type: ColorType.Solid,
            color: "#070a14",
          },

          textColor: "#8994b6",

          fontFamily:
            "Inter, Arial, Helvetica, sans-serif",

          attributionLogo: false,
        },

        grid: {
          vertLines: {
            color:
              "rgba(47,216,255,0.045)",
          },

          horzLines: {
            color:
              "rgba(201,92,255,0.045)",
          },
        },

        crosshair: {
          mode: CrosshairMode.Normal,

          vertLine: {
            color:
              "rgba(47,216,255,0.42)",

            labelBackgroundColor:
              "#164f66",
          },

          horzLine: {
            color:
              "rgba(201,92,255,0.38)",

            labelBackgroundColor:
              "#5c2c72",
          },
        },

        rightPriceScale: {
          borderColor:
            "rgba(126,92,255,0.22)",

          scaleMargins: {
            top: 0.08,
            bottom: 0.08,
          },
        },

        timeScale: {
          borderColor:
            "rgba(47,216,255,0.16)",

          timeVisible: true,
          secondsVisible: false,

          rightOffset: 5,

          barSpacing:
            compact ? 7 : 9,

          minBarSpacing: 2,
        },

        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },

        handleScale: {
          axisPressedMouseMove: true,
          axisDoubleClickReset: true,
          mouseWheel: true,
          pinch: true,
        },
      },
    );

    const series = chart.addSeries(
      CandlestickSeries,
      {
        upColor: "#2fd8ff",
        downColor: "#c95cff",

        borderVisible: true,

        borderUpColor: "#80ebff",
        borderDownColor: "#ee8dff",

        wickUpColor: "#2fd8ff",
        wickDownColor: "#c95cff",

        priceLineVisible: true,
        lastValueVisible: true,

        priceLineColor: "#7c5cff",

        priceFormat: {
          type: "price",

          precision:
            market === "forex"
              ? 5
              : 2,

          minMove:
            market === "forex"
              ? 0.00001
              : 0.01,
        },
      },
    );

    const resizeObserver =
      new ResizeObserver(
        (entries) => {
          const bounds =
            entries[0]?.contentRect;

          if (
            !bounds ||
            bounds.width <= 0 ||
            bounds.height <= 0
          ) {
            return;
          }

          chart.applyOptions({
            width: Math.floor(bounds.width),
            height: Math.floor(bounds.height),
          });
        },
      );

    resizeObserver.observe(container);

    async function requestCandles(
      limit: number,
    ) {
      const endpoint = new URL(
        "/api/market/candles",
        window.location.origin,
      );

      endpoint.searchParams.set(
        "market",
        market,
      );

      endpoint.searchParams.set(
        "interval",
        chartInterval,
      );

      endpoint.searchParams.set(
        "limit",
        String(limit),
      );

      const response = await fetch(
        endpoint,
        {
          cache: "no-store",
          signal: abortController.signal,
        },
      );

      const payload =
        (await response.json()) as
          CandleResponse;

      if (
        !response.ok ||
        !payload.ok ||
        !payload.data
      ) {
        throw new Error(
          payload.error ??
            "Unable to load candles.",
        );
      }

      return normalize(payload.data);
    }

    async function refreshLatest() {
      try {
        const candles =
          await requestCandles(5);

        if (disposed) {
          return;
        }

        for (const candle of candles) {
          series.update(candle);
        }

        setStatus("DELAYED LIVE");
        setError("");
      }
      catch (reason) {
        if (
          disposed ||
          abortController.signal.aborted
        ) {
          return;
        }

        setStatus("DATA ERROR");

        setError(
          reason instanceof Error
            ? reason.message
            : "Refresh failed.",
        );
      }
    }

    function connectCryptoSocket() {
      if (
        disposed ||
        market !== "crypto"
      ) {
        return;
      }

      socket = new WebSocket(
        "wss://stream.binance.com:9443/ws/" +
          `btcusdt@kline_${chartInterval}`,
      );

      socket.onopen = () => {
        if (!disposed) {
          setStatus("LIVE");
          setError("");
        }
      };

      socket.onmessage = (event) => {
        if (disposed) {
          return;
        }

        const payload =
          JSON.parse(
            String(event.data),
          ) as BinanceMessage;

        const candle = payload.k;

        if (!candle) {
          return;
        }

        series.update({
          time: Math.floor(
            candle.t / 1000,
          ) as UTCTimestamp,

          open: Number(candle.o),
          high: Number(candle.h),
          low: Number(candle.l),
          close: Number(candle.c),
        });

        setStatus(
          candle.x
            ? "LIVE / CLOSED"
            : "LIVE",
        );
      };

      socket.onerror = () => {
        if (!disposed) {
          setStatus("RECONNECTING");
        }
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }

        setStatus("RECONNECTING");

        reconnectTimer =
          window.setTimeout(
            connectCryptoSocket,
            2500,
          );
      };
    }

    void requestCandles(
      compact ? 250 : 500,
    )
      .then((candles) => {
        if (
          disposed ||
          candles.length === 0
        ) {
          return;
        }

        series.setData(candles);
        chart.timeScale().fitContent();

        if (market === "crypto") {
          setStatus("CONNECTING");
          connectCryptoSocket();
          return;
        }

        setStatus("DELAYED LIVE");

        pollingTimer =
          window.setInterval(
            () => {
              void refreshLatest();
            },
            300000,
          );
      })
      .catch((reason) => {
        if (
          disposed ||
          abortController.signal.aborted
        ) {
          return;
        }

        setStatus("DATA ERROR");

        setError(
          reason instanceof Error
            ? reason.message
            : "Chart loading failed.",
        );
      });

    return () => {
      disposed = true;

      abortController.abort();
      resizeObserver.disconnect();

      if (reconnectTimer !== null) {
        window.clearTimeout(
          reconnectTimer,
        );
      }

      if (pollingTimer !== null) {
        window.clearInterval(
          pollingTimer,
        );
      }

      if (socket) {
        socket.onclose = null;
        socket.close();
      }

      chart.remove();
    };
  }, [
    market,
    chartInterval,
    compact,
  ]);

  return (
    <section
      className={
        compact
          ? "zainex-live-chart zainex-live-chart-compact"
          : "zainex-live-chart zainex-live-chart-desktop"
      }
    >
      <header className="zainex-chart-toolbar">
        <div className="zainex-chart-symbol">
          <span className="zainex-chart-live-dot" />
          <strong>{labels[market]}</strong>
        </div>

        <div className="zainex-chart-timeframes">
          {visibleIntervals.map(
            (item) => (
              <button
                key={item}
                type="button"
                className={
                  chartInterval === item
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setChartInterval(item)
                }
              >
                {item}
              </button>
            ),
          )}
        </div>

        <span
          className="zainex-chart-status"
          data-status={status}
        >
          {status}
        </span>
      </header>

      <div
        ref={canvasRef}
        className="zainex-lightweight-canvas"
      />

      <footer className="zainex-chart-footer">
        {error ? (
          <strong>{error}</strong>
        ) : (
          <span>
            Drag to pan · wheel to zoom · drag axes to stretch
          </span>
        )}

        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener nofollow"
        >
          Lightweight Charts by TradingView
        </a>
      </footer>
    </section>
  );
}