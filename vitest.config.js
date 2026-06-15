import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          testTimeout: 10000,
          include: ['tests/**/*.test.js'],
          exclude: ['tests/**/*.integration.test.js'],
        }
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          globals: true,
          testTimeout: 60000,
          include: ['tests/**/*.integration.test.js'],
          sequence: {
            concurrent: false,
          },
        }
      },
    ],
  },
});
