/**
 * Extract complete JSON objects from a partial / streaming / malformed buffer.
 * String-literal-aware: braces inside string literals (LaTeX, sets, code) never
 * corrupt the brace-depth scan the way a naive regex would.
 */

export interface ExtractOptions {
  /** Only keep objects whose raw JSON slice contains ALL of these substrings. */
  requireKeys?: string[];
  /** Drop objects whose raw JSON slice contains ANY of these substrings. */
  excludeKeys?: string[];
}

/** Index of the `}` closing the object at `start`, or -1 if it is not yet complete. */
export function scanBalanced(input: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { if (--depth === 0) return i; }
  }
  return -1;
}

function passesFilters(slice: string, options: ExtractOptions): boolean {
  if (options.requireKeys && !options.requireKeys.every((k) => slice.includes(k))) return false;
  if (options.excludeKeys && options.excludeKeys.some((k) => slice.includes(k))) return false;
  return true;
}

/** Every COMPLETE top-level `{…}` object in `buffer`; a trailing incomplete one is left for later. */
export function extractJsonObjects<T = Record<string, unknown>>(
  buffer: string,
  options: ExtractOptions = {},
): T[] {
  const out: T[] = [];
  let i = 0;
  while (i < buffer.length) {
    const start = buffer.indexOf('{', i);
    if (start === -1) break;
    const end = scanBalanced(buffer, start);
    if (end === -1) break;
    const slice = buffer.slice(start, end + 1);
    i = end + 1;
    if (!passesFilters(slice, options)) continue;
    try { out.push(JSON.parse(slice) as T); } catch { /* balanced but invalid — skip */ }
  }
  return out;
}

/** Field-level recovery for a truncated object: pull string fields by key, JSON-unescaped. */
export function extractStringFields(slice: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const re = new RegExp(`"${escapeRegExp(key)}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
    const m = slice.match(re);
    if (!m) continue;
    let value: string = m[1] ?? '';
    try { value = JSON.parse(`"${m[1]}"`) as string; } catch { /* keep raw */ }
    out[key] = value;
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface StreamingExtractor<T> {
  push(chunk: string): T[];
  readonly buffer: string;
}

/** Stateful wrapper: feed chunks; each push returns only newly-completed objects. */
export function createStreamingExtractor<T = Record<string, unknown>>(
  options: ExtractOptions = {},
): StreamingExtractor<T> {
  let buffer = '';
  let offset = 0;
  return {
    get buffer() { return buffer; },
    push(chunk: string): T[] {
      buffer += chunk;
      const out: T[] = [];
      while (offset < buffer.length) {
        const start = buffer.indexOf('{', offset);
        if (start === -1) { offset = buffer.length; break; }
        const end = scanBalanced(buffer, start);
        if (end === -1) { offset = start; break; }
        const slice = buffer.slice(start, end + 1);
        offset = end + 1;
        if (!passesFilters(slice, options)) continue;
        try { out.push(JSON.parse(slice) as T); } catch { /* skip */ }
      }
      return out;
    },
  };
}
