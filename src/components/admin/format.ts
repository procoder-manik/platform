/** Display helpers shared by list cells and editors. */
export function formatDate(value: unknown, timeZone = 'UTC'): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(date);
}

export function formatMoney(cents: unknown, currency = 'USD'): string {
  const n = Number(cents);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(n / 100);
}

/** Value for <input type="datetime-local"> in the site time zone. */
export function toLocalInput(value: unknown, timeZone = 'UTC'): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Converts a datetime-local value typed in the site time zone back to an ISO string in UTC. */
export function fromLocalInput(local: string, timeZone = 'UTC'): string | null {
  if (!local) return null;
  const asUtc = new Date(`${local}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const shown = toLocalInput(asUtc, timeZone);
  const offset = new Date(`${shown}:00Z`).getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - offset).toISOString();
}
