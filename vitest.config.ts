import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    // Match any .test.ts files anywhere in the project
    include: ['**/*.test.ts'],
    // Don't run tests in node_modules, .next, or opensrc
    exclude: ['node_modules', '.next', 'opensrc', 'lib/sandbox/tools/mcp/visual-qa'],
    // Use the global setup file
    setupFiles: ['./test-setup.ts'],
    // Simulate a browser-like environment for NextRequest
    environment: 'node',
    // Path alias matching tsconfig.json
    alias: {
      '@': path.resolve(__dirname),
    },
  },
})