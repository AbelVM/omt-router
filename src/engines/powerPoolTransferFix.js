/**
 * Work around a PowerPool worker-wrapper bug where plain-object messages
 * with `awaitResponse: true` and `zeroCopy: true` are re-encoded by the
 * wrapper, which loses transferred typed arrays.
 * @module src/engines/powerPoolTransferFix
 */
import { PowerPool } from 'performance-helpers/powerPool';

let _installed = false;

export function installPowerPoolTransferFix() {
  if (_installed) return;
  _installed = true;

  if (typeof PowerPool === 'undefined' || !PowerPool.prototype?._postToWorkerObj) return;

  const _originalPostToWorkerObj = PowerPool.prototype._postToWorkerObj;
  PowerPool.prototype._postToWorkerObj = function (
    obj,
    prepared,
    startTime,
    wantResponse,
    correlationKey,
    pendingPromise
  ) {
    const canBypassWrapper =
      prepared &&
      prepared.message &&
      typeof prepared.message === 'object' &&
      prepared.message !== null &&
      !ArrayBuffer.isView(prepared.message) &&
      !(prepared.message instanceof ArrayBuffer) &&
      Array.isArray(prepared.transfer) &&
      prepared.transfer.length > 0 &&
      obj?.worker?.['_underlying']?.postMessage;

    if (canBypassWrapper) {
      try {
        obj.worker._underlying.postMessage(prepared.message, prepared.transfer);
        if (typeof obj._startTimes?.push === 'function') obj._startTimes.push(startTime);
        obj.tasks++;
        this._activeTasks++;
        obj.lastActive = startTime;
        if (this._isIdle) this._updateIdleState();
        return wantResponse ? pendingPromise : true;
      } catch {
        // Fallback to the original behavior if direct postMessage fails.
      }
    }

    return _originalPostToWorkerObj.call(
      this,
      obj,
      prepared,
      startTime,
      wantResponse,
      correlationKey,
      pendingPromise
    );
  };
}
