// Stub for taichi.js — used in Vitest only.
// taichi.js requires a browser WebGPU context and crashes at import in Node.js.
export const init = async () => { throw new Error('WebGPU not available in test environment'); };
export const field = () => ({
  fromArray1D: async () => {},
  toArray1D: async () => [],
});
export const sync = async () => {};
export const kernel = (fn) => async () => {};
export const clearKernelScope = () => {};
export const addToKernelScope = () => {};
export const i32 = 'i32';
