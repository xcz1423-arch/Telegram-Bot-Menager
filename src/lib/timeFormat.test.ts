import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBangladeshDateTime } from './timeFormat';

test('formatBangladeshDateTime formats UTC timestamps in Asia/Dhaka 12-hour AM/PM timeline', () => {
  // 2026-11-20T13:06:11Z -> +6h = 19:06:11 -> 07:06:11 PM BST
  const evening = new Date('2026-11-20T13:06:11.000Z');
  assert.equal(formatBangladeshDateTime(evening), '20 Nov 2026, 07:06:11 PM BST');

  // 2026-11-20T00:05:09Z -> +6h = 06:05:09 -> 06:05:09 AM BST
  const morning = new Date('2026-11-20T00:05:09.000Z');
  assert.equal(formatBangladeshDateTime(morning), '20 Nov 2026, 06:05:09 AM BST');

  // 2026-11-20T18:00:00Z -> +6h = next day 00:00:00 -> 21 Nov 2026, 12:00:00 AM BST
  const midnight = new Date('2026-11-20T18:00:00.000Z');
  assert.equal(formatBangladeshDateTime(midnight), '21 Nov 2026, 12:00:00 AM BST');
});
