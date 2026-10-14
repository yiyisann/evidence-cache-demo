/** A standalone teaching model. No product source or private data is used. */
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new TypeError('Use an ISO timestamp with an explicit time zone');
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new TypeError('Invalid timestamp');
  return ms;
}

function limit(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Invalid freshness limit');
  return value;
}

function observation(event) {
  if (event.type !== 'success') throw new TypeError('Expected success');
  if (typeof event.source !== 'string' || !event.source.trim() || event.source.length > 80) {
    throw new TypeError('A bounded source label is required');
  }
  if (typeof event.value !== 'string' || !event.value.trim() || event.value.length > 240) {
    throw new TypeError('A bounded fact string is required');
  }
  if (instant(event.observedAt) > instant(event.at)) throw new RangeError('Observation is in the future');
  return Object.freeze({ value: event.value, source: event.source, observedAt: event.observedAt });
}

export function emptyState() {
  return Object.freeze({ fact: null, checkedAt: null, refresh: 'never' });
}

/** Events must arrive in check-time order. Errors never replace source facts. */
export function update(state, event) {
  const at = instant(event.at);
  if (state.checkedAt !== null && at <= instant(state.checkedAt)) {
    throw new RangeError('Check timestamps must increase');
  }
  if (event.type === 'failure') {
    // Deliberately do not retain an arbitrary error payload, token or endpoint.
    return Object.freeze({ ...state, checkedAt: event.at, refresh: 'failed' });
  }
  const fact = observation(event);
  if (state.fact && instant(fact.observedAt) < instant(state.fact.observedAt)) {
    // A successful request can return older evidence: keep the newer fact.
    return Object.freeze({ ...state, checkedAt: event.at, refresh: 'older-result' });
  }
  if (state.fact && instant(fact.observedAt) === instant(state.fact.observedAt) &&
      (fact.value !== state.fact.value || fact.source !== state.fact.source)) {
    // Equal-time disagreement has no proven ordering. Surface the conflict.
    return Object.freeze({ ...state, checkedAt: event.at, refresh: 'conflict' });
  }
  return Object.freeze({ fact, checkedAt: event.at, refresh: 'ok' });
}

/** Freshness is based on fact time and refresh result, not a rendered badge. */
export function present(state, now, maxAgeMs) {
  const time = instant(now);
  const ageLimit = limit(maxAgeMs);
  if (state.checkedAt && time < instant(state.checkedAt)) throw new RangeError('Clock moved backwards');
  if (!state.fact) return Object.freeze({ status: 'unknown', value: null, source: null, observedAt: null, checkedAt: state.checkedAt, refresh: state.refresh, ageMs: null });
  const ageMs = time - instant(state.fact.observedAt);
  if (ageMs < 0) throw new RangeError('Fact is in the future');
  return Object.freeze({
    status: state.refresh === 'ok' && ageMs <= ageLimit ? 'fresh' : 'stale',
    ...state.fact, checkedAt: state.checkedAt, refresh: state.refresh, ageMs
  });
}
