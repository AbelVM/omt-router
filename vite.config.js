import { defineConfig } from 'vite';
import { resolve } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import crossOriginIsolation from 'vite-plugin-cross-origin-isolation';

function benchmarkResultsSaver() {
  return {
    name: 'benchmark-results-saver',
    configureServer(server) {
      server.middlewares.use('/__benchmark/save-results', async (req, res, next) => {
        if (req.method !== 'POST') {
          next();
          return;
        }

        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }

          const rawBody = Buffer.concat(chunks).toString('utf8');
          const body = rawBody ? JSON.parse(rawBody) : {};
          const { filename, payload } = body;

          const validName =
            typeof filename === 'string' &&
            (/^\d{8}_\d{6}_benchmark_[a-z0-9-]+_(parallel|serial)\.json$/i.test(filename) ||
              /^benchmark_[a-z0-9-]+_(parallel|serial)_\d{8}_\d{6}\.json$/i.test(filename));
          if (!validName || payload == null) {
            res.statusCode = 400;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ ok: false, error: 'invalid_payload' }));
            return;
          }

          const outDir = resolve(__dirname, 'benchmark/results');
          await mkdir(outDir, { recursive: true });
          const outputPath = resolve(outDir, filename);
          await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');

          res.statusCode = 200;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: `benchmark/results/${filename}` }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: error?.message ?? 'save_failed' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [crossOriginIsolation(), benchmarkResultsSaver()],
  server: {
    watch: null,
  },
  resolve: {
    alias: [
      {
        find: 'fs',
        replacement: resolve(__dirname, 'src/shims/fs-browser.js'),
      },
    ],
  },
  build: {
    target: 'es2020',
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'OpenMapTiles Router',
      fileName: 'omt-router',
      formats: ['es', 'cjs'],
    },
    // minify: 'terser',
    // sourcemap: false,
    // terserOptions: {
    //   ecma: 2020,
    //   compress: {
    //     passes: 3,
    //     drop_console: true,
    //     drop_debugger: true,
    //     pure_funcs: ['console.log', 'assert'],
    //   },
    //   mangle: true,
    //   format: {
    //     comments: false,
    //   },
    // },
    rollupOptions: {
      external: ['perf_hooks', 'crypto', 'fs'],
      transform: {
        define: {
          'import.meta': '{}',
        },
      },
    },
  },
});
