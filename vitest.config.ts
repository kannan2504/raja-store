import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      ADMIN_API_TOKEN: 'test-admin-token-with-at-least-32-characters',
    },
  },
})
