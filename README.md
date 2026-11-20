# resilient-llm-stream

Composable TypeScript helpers for asynchronous retries, SSE keepalives, inactivity monitoring and JSON object extraction from streamed text. The source has no runtime dependencies.

## Build and use this repository

This is a source-distributed project. The exact npm name is not currently a published distribution of this repository; the manifest is private. Build the checkout:

```sh
git clone https://github.com/ammmcreativetech-dot/resilient-llm-stream.git
cd resilient-llm-stream
npm install --ignore-scripts
npm test
```

From the built checkout:

```js
import {withRetry, createStreamingExtractor} from './dist/index.js';

const value = await withRetry(async () => 'complete', {
  maxAttempts: 3,
  timeoutMs: 15000,
});
console.log(value); // complete

const extractor = createStreamingExtractor();
console.log(extractor.push('{"value":1}')); // [{ value: 1 }]
```

## API and lifecycle

| Area | Exports |
| --- | --- |
| Retry | `withRetry`, `withTimeout`, `TimeoutError`, `getHttpStatus`, `defaultIsNonRetryable` |
| SSE | `makeSseSender`, `startKeepalive`, `makeClosedGuard`, `createInactivityWatchdog` |
| JSON | `createStreamingExtractor`, `extractJsonObjects`, `extractStringFields`, `scanBalanced` |

Timeouts race the supplied promise; they do not cancel underlying work. Retry callbacks must be suitable for repeated invocation, and callers own cancellation and idempotency. The default status heuristic recognizes selected retryable and non-retryable statuses and then message patterns; it is not a complete HTTP policy.

`startKeepalive` returns a stop function. A watchdog must be reset on progress and stopped when the operation finishes. Callers own stream closure, JSON-serializable event values and error handling. Keepalive frames cannot override every server, browser or intermediary timeout.

The JSON helpers extract complete valid object slices. Normal JSON escaping remains required; field recovery and substring filters do not validate domain content. The standalone JSON utility is documented in [llm-json-repair](https://github.com/ammmcreativetech-dot/llm-json-repair).

## Quanta Study and maintenance

Maintained by Amos Matzke at [AM Creative Tech UG (haftungsbeschränkt)](https://quanta-study.de/am-creative-tech), the developer of **[Quanta Study — learning from your own materials](https://quanta-study.de/en)**. The learning platform connects source material with active exam preparation; this project documents general-purpose streaming components and their lifecycle requirements.

Use repository Issues for a reproducible example with non-sensitive data. See `CITATION.cff` for attribution metadata.

## License

MIT, as provided in [LICENSE](./LICENSE). This software license covers the provided repository files; Quanta Study's application and online learning content are separate.
