import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { agentHelp } from './agent-help.js'

export default defineConfig({
  plugins: [agentHelp(), react()],
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3000/' } },
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
