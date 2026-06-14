# resilient-llm-stream

> Production-grade resilience for streaming LLM calls — **timeout + backoff retry**, **SSE keepalive + inactivity watchdog**, and a **string-literal-aware streaming JSON extractor**. Zero dependencies, fully typed.

![types](https://img.shields.io/badge/types-included-blue)
![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)
![license](https://img.shields.io/badge/license-MIT-green)
![node](https://img.shields.io/badge/node-%E2%89%A518-339933)

Multi-minute LLM generations over a serverless proxy fail in three predictable ways: the call **hangs** with no timeout, the proxy **drops the connection** after ~60s of silence, and the JSON arrives **partial or malformed** mid-stream. This package is the three small, battle-tested primitives that fix each — extracted and generalized from a production AI pipeline.

```bash
npm install resilient-llm-stream
```

## 1. Retry — timeout + exponential backoff + jitter

```ts
import { withRetry } from 'resilient-llm-stream';

const result = await withRetry(() => model.generate(input), {
  timeoutMs: 15_000,          // per-attempt wall-clock cap
  maxAttempts: 3,
  onRetry: ({ attempt, delayMs }) => console.warn(`retry ${attempt} in ${delayMs}ms`),
});
```

HTTP-status-aware: `4xx` (400/401/403/404) fail fast, `429` and `5xx` retry. No status? It falls back to message patterns (`api key`, `safety`, `quota exceeded`, …). Override with `isNonRetryable`.

## 2. SSE resilience — keepalive + watchdog

```ts
import { startKeepalive, makeSseSender, createInactivityWatchdog } from 'resilient-llm-stream';

const stream = new ReadableStream({
  async start(controller) {
    const send = makeSseSender(controller);
    const stopKeepalive = startKeepalive(controller, 15_000);      // proxy never idles out
    const watchdog = createInactivityWatchdog(120_000, () => controller.error(new Error('stalled')));

    for await (const token of llm) {
      watchdog.reset();                                            // progress → defer the timeout
      send({ token });
    }
    watchdog.stop();
    stopKeepalive();
    controller.close();
  },
});
```

`makeSseSender` no-ops once the client disconnects, so a late write never throws.

## 3. Streaming JSON — extract objects as they complete

```ts
import { createStreamingExtractor } from 'resilient-llm-stream';

const extractor = createStreamingExtractor();
for await (const chunk of llm) {
  for (const obj of extractor.push(chunk)) {
    render(obj);   // each object appears the instant it closes — braces inside strings & LaTeX are safe
  }
}
```

Also exported one-shot: `extractJsonObjects(buffer, { requireKeys, excludeKeys })`, the low-level `scanBalanced`, and `extractStringFields(slice, keys)` for field-level recovery from a truncated object.

> The JSON module is also available on its own as [`llm-json-repair`](https://github.com/ammmcreativetech-dot/llm-json-repair).

## API surface

| Module | Exports |
| --- | --- |
| Retry | `withRetry`, `withTimeout`, `TimeoutError`, `getHttpStatus`, `defaultIsNonRetryable` |
| SSE | `makeSseSender`, `startKeepalive`, `makeClosedGuard`, `createInactivityWatchdog` |
| JSON | `createStreamingExtractor`, `extractJsonObjects`, `extractStringFields`, `scanBalanced` |

## Why this exists

Extracted and generalized from the production AI-generation pipeline of **[quanta-study.de](https://quanta-study.de)**, where Gemini streams run for minutes without ever tripping the proxy timeout or losing a partial result on a dropped connection.

## Test

```bash
npm test   # builds, then runs the suite via Node's built-in test runner (no extra deps)
```

## License

MIT © [Amos Matzke](https://www.linkedin.com/in/amos-matzke-71a73139a) · [quanta-study.de](https://quanta-study.de)
