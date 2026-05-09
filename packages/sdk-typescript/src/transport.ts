export type FetchFn = typeof fetch;

export interface RetryOptions {
  fetchFn?: FetchFn;
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastErr: unknown;
  let lastRes: Response | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchFn(url, init);
      if (res.status < 500) {
        return res;
      }
      lastRes = res;
    } catch (err) {
      lastErr = err;
    }

    if (attempt < maxAttempts) {
      const delay = baseDelay * 2 ** (attempt - 1);
      await sleep(delay);
    }
  }

  if (lastRes) return lastRes;
  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
