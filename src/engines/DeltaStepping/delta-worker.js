//# sourceURL=deltaWorker
const STATE_NEXT_SIZE = 0;
const INF_DISTANCE = 0x3fffffff;

self.onmessage = async ({ data }) => {
  const {
    sab,
    start,
    end,
    currQOff,
    nextQOff,
    distOff,
    prevOff,
    headOff,
    nextOff,
    targetsOff,
    weightsOff,
    inQueueOff,
    stateOff,
    n,
    m,
    delta,
    mode,
  } = data;

  const dist = new Int32Array(sab, distOff, n);
  const prev = new Int32Array(sab, prevOff, n);
  const head = new Int32Array(sab, headOff, n);
  const next = new Int32Array(sab, nextOff, m);
  const targets = new Int32Array(sab, targetsOff, m);
  const weights = new Int32Array(sab, weightsOff, m);

  const currQ = new Int32Array(sab, currQOff, n);
  const nextQ = new Int32Array(sab, nextQOff, n);
  const inQueue = new Uint8Array(sab, inQueueOff, n);
  const state = new Int32Array(sab, stateOff, 8);

  const relaxLight = mode === 'light';

  const atomicMin = (array, idx, candidate) => {
    let current = Atomics.load(array, idx);
    while (candidate < current) {
      const observed = Atomics.compareExchange(array, idx, current, candidate);
      if (observed === current) return true;
      current = observed;
    }
    return false;
  };

  for (let i = start; i < end; i++) {
    const u = currQ[i];
    const d_u = Atomics.load(dist, u);
    if (d_u >= INF_DISTANCE) continue;

    for (let e = head[u]; e !== -1; e = next[e]) {
      const w = weights[e];
      if (relaxLight ? w > delta : w <= delta) continue;

      const v = targets[e];
      const rawDist = d_u + w;
      const newDist = rawDist > INF_DISTANCE ? INF_DISTANCE : rawDist;

      if (atomicMin(dist, v, newDist)) {
        Atomics.store(prev, v, u);
        if (Atomics.compareExchange(inQueue, v, 0, 1) === 0) {
          const pos = Atomics.add(state, STATE_NEXT_SIZE, 1);
          nextQ[pos] = v;
        }
      }
    }
  }

  self.postMessage('done');
};