export function logEvent(
  event: string,
  details?: Record<string, unknown>,
): void {
  const payload = details ? ` ${JSON.stringify(details)}` : "";
  console.log(`[OpsPilot] ${event}${payload}`);
}
