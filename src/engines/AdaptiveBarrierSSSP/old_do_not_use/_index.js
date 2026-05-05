import { BareMetalSSSP } from './baremetal.js';
import { IndustrialBarrierSSSP } from './industrial.js';

export class SSSPDispatcher {
  constructor(maxNodes, maxEdges) {
    this.n = maxNodes;
    this.m = maxEdges;
    this.isSharedMemoryAvailable = typeof SharedArrayBuffer !== 'undefined';

    // Initialize both engines (Lazy-loading Industrial is better for memory)
    this.bareMetal = new BareMetalSSSP(maxNodes, maxEdges);
    this.industrial = null;
  }

  async solve(graphData, source, target = null) {
    const { n, m } = graphData;
    const density = m / n;

    // DECISION MATRIX
    // 1. Check for Environment Support
    if (!this.isSharedMemoryAvailable) {
      console.warn("SharedArrayBuffer not supported. Falling back to BareMetal.");
      return this.runBareMetal(graphData, source, target);
    }

    // 2. Small Scale Heuristic
    // Threshold is ~100k nodes for the Sorting Barrier to overcome overhead
    if (n < 100_000) {
      return this.runBareMetal(graphData, source, target);
    }

    // 3. Large Scale - Industrial Execution
    return this.runIndustrial(graphData, source, target);
  }

  async runBareMetal(data, source, target) {
    // BareMetal is optimized for low-latency, single-thread execution
    this.bareMetal.load(data);
    return this.bareMetal.solve(source, target);
  }

  async runIndustrial(data, source, target) {
    if (!this.industrial) {
      this.industrial = new IndustrialBarrierSSSP(this.n, this.m);
    }

    await this.industrial.loadGraph(data.sources, data.targets, data.weights);
    return await this.industrial.solve(source, target);
  }
}