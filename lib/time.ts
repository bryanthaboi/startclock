export function roundUpMinutesToHalfHour(elapsedMinutes: number): {
  rawMinutes: number;
  roundedMinutes: number;
  hours: number;
} {
  const rawMinutes = Math.max(1, Math.ceil(elapsedMinutes));
  const roundedMinutes = Math.ceil(rawMinutes / 30) * 30;
  const hours = roundedMinutes / 60;
  return { rawMinutes, roundedMinutes, hours };
}

export function utcDateFromMs(ms: number): string {
  // YYYY-MM-DD in UTC.
  return new Date(ms).toISOString().slice(0, 10);
}

export function formatUtcIso(ms: number): string {
  return new Date(ms).toISOString();
}

