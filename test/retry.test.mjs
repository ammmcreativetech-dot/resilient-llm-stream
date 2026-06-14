import test from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, withTimeout, TimeoutError, defaultIsNonRetryable } from '../dist/index.js';

test('succeeds after transient (5xx) failures', async () => {
  let n = 0;
  const res = await withRetry(
    async () => {
      if (++n < 3) throw Object.assign(new Error('overloaded'), { status: 503 });
      return 'ok';
    },
    { baseDelayMs: 1, jitterMs: 0, maxAttempts: 5 },
  );
  assert.equal(res, 'ok');
  assert.equal(n, 3);
});

test('non-retryable (4xx) throws immediately, no retries', async () => {
  let n = 0;
  await assert.rejects(() =>
    withRetry(async () => { n++; throw Object.assign(new Error('bad request'), { status: 400 }); },
      { baseDelayMs: 1 }),
  );
  assert.equal(n, 1);
});

test('withTimeout rejects with TimeoutError', async () => {
  await assert.rejects(() => withTimeout(new Promise(() => {}), 10), TimeoutError);
});

test('defaultIsNonRetryable: 429 retryable, 401 not, "api key" not', () => {
  assert.equal(defaultIsNonRetryable(Object.assign(new Error('x'), { status: 429 })), false);
  assert.equal(defaultIsNonRetryable(Object.assign(new Error('x'), { status: 401 })), true);
  assert.equal(defaultIsNonRetryable(new Error('Invalid API key')), true);
  assert.equal(defaultIsNonRetryable(new Error('connection reset')), false);
});
