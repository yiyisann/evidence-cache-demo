import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, update, present } from './cache.mjs';

const t = sec => new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString();
const event = (sec = 5, observed = 0, value = 'sample', source = 'fixture') => ({ type: 'success', at: t(sec), observedAt: t(observed), value, source });
const good = () => update(emptyState(), event());

test('never observed is unknown, never a fabricated empty success', () => {
  assert.equal(present(emptyState(), t(0), 60000).status, 'unknown');
  assert.equal(present(emptyState(), t(0), 60000).value, null);
});
test('first failure remains unknown and drops arbitrary error payload', () => {
  const s = update(emptyState(), { type: 'failure', at: t(1), error: 'do not retain' });
  assert.equal(present(s, t(2), 60000).status, 'unknown');
  assert.equal(JSON.stringify(s).includes('do not retain'), false);
});
test('fact time, not request time, decides expiration', () => {
  const s = update(emptyState(), event(100, 0));
  assert.equal(present(s, t(101), 60000).status, 'stale');
});
test('expiry boundary is inclusive and expires one millisecond later', () => {
  assert.equal(present(good(), t(60), 60000).status, 'fresh');
  assert.equal(present(good(), new Date(Date.parse(t(60)) + 1).toISOString(), 60000).status, 'stale');
});
test('failed refresh preserves value, source and observed time, labels stale', () => {
  const before = good();
  const after = update(before, { type: 'failure', at: t(10) });
  assert.deepEqual(after.fact, before.fact);
  assert.equal(present(after, t(11), 60000).status, 'stale');
  assert.equal(after.checkedAt, t(10));
});
test('older successful response cannot overwrite newer evidence', () => {
  const s = update(good(), event(10, -1, 'older'));
  assert.equal(s.fact.value, 'sample');
  assert.equal(s.refresh, 'older-result');
  assert.equal(present(s, t(11), 60000).status, 'stale');
});
test('equal-time disagreement is an explicit conflict', () => {
  const s = update(good(), event(10, 0, 'disagrees'));
  assert.equal(s.fact.value, 'sample');
  assert.equal(s.refresh, 'conflict');
  assert.equal(present(s, t(11), 60000).status, 'stale');
});
test('a newer successful observation recovers after failure', () => {
  const failed = update(good(), { type: 'failure', at: t(10) });
  const recovered = update(failed, event(20, 19, 'new'));
  assert.equal(present(recovered, t(21), 60000).status, 'fresh');
  assert.equal(recovered.fact.value, 'new');
});
test('request ordering and clock reversal fail explicitly', () => {
  for (const sec of [4, 5]) assert.throws(() => update(good(), event(sec)), RangeError);
  assert.throws(() => present(good(), t(4), 60000), RangeError);
});
test('future facts, zoneless timestamps and unbounded inputs are rejected', () => {
  assert.throws(() => update(emptyState(), event(5, 6)), RangeError);
  assert.throws(() => update(emptyState(), { ...event(), at: '2026-01-01T00:00:05' }), TypeError);
  assert.throws(() => update(emptyState(), { ...event(), at: 'garbage' }), TypeError);
  assert.throws(() => update(emptyState(), { ...event(), source: '' }), TypeError);
  assert.throws(() => update(emptyState(), { ...event(), value: 'x'.repeat(241) }), TypeError);
  assert.throws(() => present(good(), t(10), -1), TypeError);
});
test('states are immutable and equivalent timezone instants have equal ages', () => {
  const s = good();
  assert.throws(() => { s.fact.value = 'changed'; }, TypeError);
  assert.equal(present(s, '2026-01-01T09:00:10+09:00', 60000).ageMs, 10000);
});
test('sequence of failed refreshes never creates or erases facts', () => {
  for (const initial of [emptyState(), good()]) {
    let s = initial;
    for (let i = 10; i < 100; i++) {
      s = update(s, { type: 'failure', at: t(i) });
      assert.deepEqual(s.fact, initial.fact);
      assert.notEqual(present(s, t(i), 60000).status, 'fresh');
    }
  }
});
