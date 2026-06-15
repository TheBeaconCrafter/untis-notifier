import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // Round 1: Unit tests with mocks
  {
    test: {
      name: 'unit',
      environment: 'node',
      globals: true,
      testTimeout: 10000,
      include: ['tests/**/*.test.js'],
      exclude: ['tests/**/*.integration.test.js'],
    },
  },
  // Round 2: Integration tests with real credentials
  {
    test: {
      name: 'integration',
      environment: 'node',
      globals: true,
      testTimeout: 60000, // API calls can be slow
      include: ['tests/**/*.integration.test.js'],
      sequence: {
        concurrent: false, // Run sequentially to avoid Untis rate limits
      },
    },
  },
]);
