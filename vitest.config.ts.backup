import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({

  test: {
    environment: 'node',
    globals: true,
  },
  define: {
    'process.env.MEMED_TOKEN': '"test-memed-token"',
    'process.env.AUTH_API_TOKEN': '"test-auth-token"'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
