import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'OpenMapTiles Router',
      fileName: 'omt-router',
      formats: ['es', 'cjs'],
    },
    // Minification must be disabled: taichi.js parses kernel closures as source
    // text and resolves identifiers by name against the kernel scope. Any
    // minifier that renames local variables (esbuild, terser) breaks this.
    minify: false,
    sourcemap: true,
    rollupOptions: {
      external: ['perf_hooks', 'crypto'],
    },
  },
  test: {
    // taichi.js requires a browser WebGPU context and crashes in Node at
    // import time. Stub it out so unit tests can exercise all other modules.
    alias: {
      'taichi.js': resolve(__dirname, 'tests/__mocks__/taichi.js'),
    },
  },
});
