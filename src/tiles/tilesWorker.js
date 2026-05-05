import { u82o, o2u8 } from 'performance-helpers/powerBuffer';
import { PowerLogger } from 'performance-helpers/powerLogger';
import { PowerRetry } from 'performance-helpers/powerRetry';
import { parseTile } from '../graphs/graphBuilder.js';

const logger = new PowerLogger(import.meta.env?.DEV ? 3 : 0, { name: 'omt-router/worker' });
const retryer = new PowerRetry({
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelay: 200,
  jitter: true,
  retryIf: (err) => err?.status >= 500 || err?.status === 408,
});

function isCrossOriginUrl(url) {
  try {
    if (typeof self?.location?.origin !== 'string') return false;
    const resolved = new URL(url, self.location.href);
    return resolved.origin !== self.location.origin;
  } catch {
    return false;
  }
}

function classifyFetchError(url, err) {
  if (err?.status) {
    return {
      code: `HTTP_${err.status}`,
      message: `Tile server responded with HTTP ${err.status}`,
      status: err.status,
    };
  }

  if (isCrossOriginUrl(url) && err instanceof TypeError) {
    return {
      code: 'MissingAllowOriginHeader',
      message: 'Cross-origin tile request failed. Ensure Access-Control-Allow-Origin includes this app origin or use a same-origin proxy.',
    };
  }

  return {
    code: 'NetworkError',
    message: err?.message ?? 'Failed to fetch tile',
  };
}

self.onmessage = async (e) => {
  const buffer = e.data;
  const data = buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer) ? u82o(buffer) : buffer;

  if (data.op === 'parse-tile') {
    const { url, x, y, z, mode } = data;

    let rawtile = null;
    let fetchError = null;
    try {
      rawtile = await retryer.run(() =>
        fetch(url, { mode: 'cors' }).then((res) => {
          if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
          return res.arrayBuffer();
        })
      );
    } catch (err) {
      fetchError = classifyFetchError(url, err);
      logger.error(() => `Failed to fetch tile ${url}: ${err?.message ?? err}`);
    }
    if (!rawtile) {
      self.postMessage({
        correlationId: data.correlationId,
        output: null,
        fetchFailed: true,
        fetchError,
      });
      return;
    }
    const parsedTile = parseTile(rawtile, x, y, z, mode);
    const output = o2u8(parsedTile).buffer;
    self.postMessage({ correlationId: data.correlationId, output: output }, [output]);
    return;
  }
};
