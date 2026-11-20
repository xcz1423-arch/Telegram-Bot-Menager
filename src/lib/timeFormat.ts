/**
 * Formats a Date into Bangladeshi local time (Asia/Dhaka, UTC+6) using 12-hour AM/PM timeline.
 */
export function formatBangladeshDateTime(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value || '';

  const day = pick('day');
  const month = pick('month');
  const year = pick('year');
  const hour = pick('hour');
  const minute = pick('minute');
  const second = pick('second');
  const dayPeriod = pick('dayPeriod').toUpperCase() || 'AM';

  return `${day} ${month} ${year}, ${hour}:${minute}:${second} ${dayPeriod} BST`;
}
