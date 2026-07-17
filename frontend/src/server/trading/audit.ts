export type TradingAuditData = Record<string, unknown>;

export function writeTradingAudit(
  event: string,
  data: TradingAuditData,
): void {
  console.info(
    JSON.stringify({
      scope: "zainex-trading",
      event,
      timestamp: new Date().toISOString(),
      ...data,
    }),
  );
}
