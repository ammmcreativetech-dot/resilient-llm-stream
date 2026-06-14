/**
 * Helpers for resilient Server-Sent-Events (SSE) streaming of long-running LLM jobs
 * over a serverless proxy that idles out connections after ~60s of silence.
 */

/** True once the stream controller has been closed (client disconnected / aborted). */
export function makeClosedGuard(controller: ReadableStreamDefaultController): () => boolean {
  return () => controller.desiredSize === null;
}

/**
 * Returns a function that encodes and enqueues an SSE `data:` frame.
 * No-ops once the controller is closed, so a late write never throws.
 */
export function makeSseSender(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder = new TextEncoder(),
): (data: unknown) => void {
  return (data: unknown) => {
    if (controller.desiredSize === null) return;
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };
}

/**
 * Emit an SSE comment (`:keepalive`) every `intervalMs` so proxies don't close an
 * idle connection while the model is still "thinking". Returns a stop function.
 */
export function startKeepalive(
  controller: ReadableStreamDefaultController,
  intervalMs = 15_000,
  encoder: TextEncoder = new TextEncoder(),
): () => void {
  const timer = setInterval(() => {
    try {
      if (controller.desiredSize === null) { clearInterval(timer); return; }
      controller.enqueue(encoder.encode(':keepalive\n\n'));
    } catch {
      // Controller closed between the check and the enqueue — expected race. Stop quietly.
      clearInterval(timer);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

export interface InactivityWatchdog {
  /** Call on every sign of progress (token received) to defer the timeout. */
  reset(): void;
  /** Stop the watchdog entirely (on success or final error). */
  stop(): void;
}

/**
 * Fire `onTimeout` if `reset()` is not called within `ms`. Use it to abort a
 * generation that has stalled mid-stream (model stuck, upstream hang).
 */
export function createInactivityWatchdog(ms: number, onTimeout: () => void): InactivityWatchdog {
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(onTimeout, ms);
  return {
    reset() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = setTimeout(onTimeout, ms);
    },
    stop() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    },
  };
}
