import { u82o, o2u8 } from 'performance-helpers/powerBuffer';
import { PowerLogger } from 'performance-helpers/powerLogger';
import { PowerRetry } from 'performance-helpers/powerRetry';
import { parseTile } from '../graphBuilder.js';

const logger = new PowerLogger(import.meta.env?.DEV ? 3 : 0, { name: 'omp-router/worker' });
const retryer = new PowerRetry({
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelay: 200,
  jitter: true,
  retryIf: (err) => err?.status >= 500 || err?.status === 408,
});

self.onmessage = async (e) => {
  const buffer = e.data;
  const data = buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer) ? u82o(buffer) : buffer;

  if (data.op === 'parse-tile') {
    const { url, x, y, z, mode } = data;

    let rawtile = null;
    try {
      rawtile = await retryer.run(() =>
        fetch(url).then((res) => {
          if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
          return res.arrayBuffer();
        })
      );
    } catch (err) {
      logger.error(() => `Failed to fetch tile ${url}: ${err?.message ?? err}`);
    }
    if (!rawtile) {
      self.postMessage({ correlationId: data.correlationId, output: [] });
      return;
    }
    const parsedTile = parseTile(rawtile, x, y, z, mode);
    const output = o2u8(parsedTile).buffer;
    self.postMessage({ correlationId: data.correlationId, output: output }, [output]);
    return;
  }
};
