// Vitest config to enable global test functions for all test files
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true, // Enable global test/expect/describe
    environment: 'node',
  },
});
