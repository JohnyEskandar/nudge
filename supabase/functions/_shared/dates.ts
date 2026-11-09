// Calendar dates as ISO strings (YYYY-MM-DD), done in UTC so that adding a day never
// lands on the wrong side of a daylight-saving change. No imports: this file is shared by
// the Deno edge function and the vitest suite.

const DAY_MS = 86_400_000

function toUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS)
}
