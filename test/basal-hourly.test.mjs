import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipBasalIntervals, basalByHour, basalHeadline } from '../src/analytics.js';

const T = (h, m = 0, s = 0) => Date.UTC(2026, 9, 10, h, m, s) / 1000;
const iv = (state, a, b) => ({
  state, startEpoch: a, endEpoch: b,
  start: new Date(a * 1000).toISOString(), end: new Date(b * 1000).toISOString(),
});
// Shape of 10 Oct 2026 around the max blocks and the long suspend.
const day = [
  iv('normal', T(0), T(13, 36, 30)),
  iv('max', T(13, 36, 30), T(13, 51, 30)),
  iv('normal', T(13, 51, 30), T(13, 56, 30)),
  iv('max', T(13, 56, 30), T(14, 1, 30)),
  iv('normal', T(14, 1, 30), T(14, 16, 30)),
  iv('suspend', T(14, 16, 30), T(16, 21, 30)),
  iv('normal', T(16, 21, 30), T(24)),
];

test('hourly split puts minutes in the right hour', () => {
  const rows = Object.fromEntries(basalByHour(day).map((r) => [r.hourNum, r]));
  assert.equal(rows[15].suspendPercent, 100);
  assert.equal(rows[13].maxPercent, +((18.5 / 60) * 100).toFixed(1)); // 15 + 3.5 min
  assert.equal(rows[14].suspendPercent, 72.5); // 14:16:30 to 15:00 = 43.5 min
  assert.equal(rows[16].suspendPercent, +((21.5 / 60) * 100).toFixed(1));
  for (const r of Object.values(rows)) {
    const sum = r.normalPercent + r.suspendPercent + r.maxPercent + r.limitedPercent;
    assert.ok(Math.abs(sum - 100) < 0.3);
  }
});

test('clip drops overhang so totals match the window', () => {
  const clipped = clipBasalIntervals(day, T(12), T(15));
  assert.equal(clipped[0].startEpoch, T(12));
  assert.equal(clipped.at(-1).endEpoch, T(15));
  const total = clipped.reduce((a, i) => a + i.endEpoch - i.startEpoch, 0);
  assert.equal(total, 3 * 3600);
});

test('headline reports longest runs and peak hours', () => {
  const h = basalHeadline(clipBasalIntervals(day, T(0), T(24)));
  assert.equal(h.longestSuspend.minutes, 125);
  assert.equal(h.longestMax.minutes, 15);
  assert.equal(h.mostSuspendedHour.hour, '15:00');
  assert.equal(h.mostMaxHour.hour, '13:00');
});
