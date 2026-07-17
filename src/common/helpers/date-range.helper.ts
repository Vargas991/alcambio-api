export function buildStartOfDayUtcFromLocal(date: string) {
  const [year, month, day] = date.split('-').map(Number);

  // Venezuela UTC-4:
  // 2026-07-13 00:00 local = 2026-07-13T04:00:00.000Z
  return new Date(Date.UTC(year, month - 1, day, 4, 0, 0, 0));
}

export function buildEndOfDayUtcFromLocal(date: string) {
  const [year, month, day] = date.split('-').map(Number);

  // Venezuela UTC-4:
  // 2026-07-13 23:59 local = 2026-07-14T03:59:59.999Z
  return new Date(Date.UTC(year, month - 1, day + 1, 3, 59, 59, 999));
}

export function getLocalDateKeyFromUtc(date: Date) {
  // Venezuela UTC-4
  const localDate = new Date(date.getTime() - 4 * 60 * 60 * 1000);

  return localDate.toISOString().slice(0, 10);
}