// Regression test: a partial-window pull must not wipe the earlier part of a day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { ensureDbReady, ingestBasalStates, getBasalStates, closeDb } from '../src/store.js';

const T = (h, m = 0) => Date.UTC(2026, 9, 10, h, m) / 1000; // 10 Oct 2026
const iv = (state, a, b) => ({
  state, startEpoch: a, endEpoch: b,
  start: new Date(a * 1000).toISOString(), end: new Date(b * 1000).toISOString(),
});
const rows = () => getBasalStates(T(0), T(24)).map((r) => [r.state, r.startEpoch, r.endEpoch]);

test('mid-day pull keeps earlier intervals and joins at the window start', async () => {
  await ensureDbReady(path.join(os.tmpdir(), `basal-${process.pid}.db`));
  // Full day first.
  ingestBasalStates([iv('normal', T(0), T(10)), iv('suspend', T(10), T(12)), iv('normal', T(12), T(24))], T(0), T(24));
  // Later pull starts mid-bar at 11:00 and ends 15:00, with the suspend now ending at 12:30.
  ingestBasalStates([iv('suspend', T(11), T(12, 30)), iv('normal', T(12, 30), T(15))], T(11), T(15));
  assert.deepEqual(rows(), [
    ['normal', T(0), T(10)],
    ['suspend', T(10), T(12, 30)],
    ['normal', T(12, 30), T(24)],
  ]);
  // Idempotent.
  ingestBasalStates([iv('suspend', T(11), T(12, 30)), iv('normal', T(12, 30), T(15))], T(11), T(15));
  assert.equal(rows().length, 3);
  closeDb();
});
