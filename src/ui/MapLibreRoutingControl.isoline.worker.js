import { isoline } from '../isolines/index.js';

self.addEventListener('message', async (ev) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;
  const { type, id, payload } = msg;

  if (type === 'compute') {
    try {
      // Delegate the heavy isoline work to the isolines module.
      const result = await isoline(payload);
      // Post result back to the main thread.
      self.postMessage({ type: 'result', id, result });
    } catch (err) {
      // Structured-clone only serializable error details.
      const safeErr = {
        message: err?.message ? String(err.message) : String(err || 'Error'),
        stack: err?.stack ?? null,
        code: err?.code ?? null,
      };
      self.postMessage({ type: 'error', id, error: safeErr });
    }
    return;
  }

  if (type === 'dispose') {
    try {
      // Allow caller to explicitly close the worker.
      self.close();
    } catch (_e) {
      void _e;
    }
  }
});
