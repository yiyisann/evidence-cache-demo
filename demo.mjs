import { emptyState, update, present } from './cache.mjs';

const maxAgeMs = 60_000;
let state = emptyState();
console.log('All values and timestamps are synthetic. No network requests.');
console.log('Before any observation:', present(state, '2026-01-01T00:00:00Z', maxAgeMs));
state = update(state, { type: 'success', at: '2026-01-01T00:00:05Z', observedAt: '2026-01-01T00:00:00Z', source: 'sample-source', value: 'Sample task is ready for review' });
console.log('Successful observation:', present(state, '2026-01-01T00:00:10Z', maxAgeMs));
state = update(state, { type: 'failure', at: '2026-01-01T00:00:20Z' });
console.log('Failed refresh preserves evidence, labeled stale:', present(state, '2026-01-01T00:00:21Z', maxAgeMs));
state = update(state, { type: 'success', at: '2026-01-01T00:02:05Z', observedAt: '2026-01-01T00:02:00Z', source: 'sample-source', value: 'Sample task has been reviewed' });
console.log('New evidence recovers:', present(state, '2026-01-01T00:02:10Z', maxAgeMs));
