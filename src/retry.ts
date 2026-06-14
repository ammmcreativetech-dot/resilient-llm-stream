/**
 * Retry an async operation with per-attempt timeout, exponential backoff and jitter.
 * HTTP-status-aware: 4xx client errors fail fast, 429/5xx are retried. Falls back to
 * message-pattern matching when no status code is available.
 */

export interface RetryOptions {
  /** Maximum attempts (including the first). Default 3. */
  maxAttempts?: number;
  /** Base backoff in ms; doubled each attempt. Default 800. */
  baseDelayMs?: number;
  /** Per-attempt timeout in ms. Default 20000. */
  timeoutMs?: number;
  /** Random jitter range (±ms) added to each backoff. Default 200. */
  jitterMs?: number;
  /** Override the default decision of whether an error must NOT be retried. */
  isNonRetryable?: (error: unknown) => boolean;
  /** Called right before each backoff wait. */
  onRetry?: (info: { attempt: number; maxAttempts: number; delayMs: number; error: unknown }) => void;
}

const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);
const NON_RETRYABLE_HTTP = new Set([400, 401, 403, 404]);
const NON_RETRYABLE_PATTERNS = [
  'api key', 'authentication', 'permission denied', 'unauthorized',
  'quota exceeded', 'billing', 'safety', 'content policy', 'blocked',
];

/** Best-effort extraction of an HTTP status from heterogeneous error shapes. */
export function getHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as Record<string, unknown>;
  const s = e['status'] ?? e['statusCode'] ?? e['httpStatus'];
  return typeof s === 'number' ? s : null;
}

/** Default heuristic: HTTP status wins; otherwise match known non-retryable message patterns. */
export function defaultIsNonRetryable(error: unknown): boolean {
  const status = getHttpStatus(error);
  if (status !== null) {
    if (RETRYABLE_HTTP.has(status)) return false;
    if (NON_RETRYABLE_HTTP.has(status)) return true;
  }
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return NON_RETRYABLE_PATTERNS.some((p) => msg.includes(p));
}

export class TimeoutError extends Error {
  constructor(ms: number, context = '') {
    super(`Operation timed out after ${ms}ms${context ? ` [${context}]` : ''}`);
    this.name = 'TimeoutError';
  }
}

/**
 * Race a promise against a wall-clock timeout.
 * Note: the underlying work is not cancelled (no AbortController) — the caller
 * moves on to the next attempt while the runtime cleans up the stale promise.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, context = ''): Promise<T> {
  let handle: ReturnType<typeof setTimeout>;
  const clock = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new TimeoutError(ms, context)), ms);
  });
  return Promise.race([promise, clock]).finally(() => clearTimeout(handle));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` with per-attempt timeout and exponential backoff + jitter.
 * `fn` must be idempotent (it is re-invoked on every attempt).
 *
 * @example
 * const res = await withRetry(() => model.generate(input), {
 *   timeoutMs: 15_000,
 *   onRetry: ({ attempt, delayMs }) => console.warn(`retry ${attempt} in ${delayMs}ms`),
 * });
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 800,
    timeoutMs = 20_000,
    jitterMs = 200,
    isNonRetryable = defaultIsNonRetryable,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (isNonRetryable(error)) throw error;
      if (attempt === maxAttempts) break;
      const jitter = Math.random() * (jitterMs * 2) - jitterMs;
      const delayMs = Math.max(0, Math.round(baseDelayMs * 2 ** (attempt - 1) + jitter));
      onRetry?.({ attempt, maxAttempts, delayMs, error });
      await sleep(delayMs);
    }
  }
  throw lastError;
}
