import { IndustrialBarrierSSSP } from './barrier-sssp-lib.js';

async function runLargeScaleAnalysis() {
  console.time('Total Setup');

  // 1. Initialize the Solver
  // We pre-allocate memory for 2M nodes and 10M edges
  const n = 2_000_000;
  const m = 10_000_000;
  const solver = new IndustrialBarrierSSSP(n, m);

  // 2. Mock Graph Data (In production, this would come from a DB or Stream)
  // We use TypedArrays to ensure zero-copy compatibility
  const sources = new Int32Array(m);
  const targets = new Int32Array(m);
  const weights = new Float64Array(m);

  for (let i = 0; i < m; i++) {
    sources[i] = Math.floor(Math.random() * n);
    targets[i] = Math.floor(Math.random() * n);
    weights[i] = Math.random() * 10;
  }

  // 3. Ingest Graph Data
  // The library maps these directly into the SharedArrayBuffer
  await solver.loadGraph(sources, targets, weights);
  
  console.timeEnd('Total Setup');
  console.log('--- Starting SSSP Solver (arXiv:2504.17033) ---');

  // 4. Run the Solver
  // The solver will autoscale worker threads and use WASM/SIMD internally
  console.time('Solver Duration');
  
  try {
    const sourceNode = 0; // Starting from User 0
    const distances = await solver.solve(sourceNode);

    console.timeEnd('Solver Duration');

    // 5. Accessing Results
    // Distances is a Float64Array view of the SharedArrayBuffer
    console.log(`Distance to User 500: ${distances[500]}`);
    console.log(`Distance to User 99999: ${distances[99999]}`);

  } catch (error) {
    console.error('Solver failed:', error);
  } finally {
    // 6. Cleanup
    // Terminate workers and release the pool
    await solver.terminate();
  }
}

runLargeScaleAnalysis();