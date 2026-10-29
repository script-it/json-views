import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentHelp } from './agent-help.js'

export default defineConfig({
  plugins: [agentHelp(), react()],
  base: './',
  build: {
    rollupOptions: {
      // The live demo is a separate page so the landing page can embed it in an iframe.
      input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), demo: fileURLToPath(new URL('./demo.html', import.meta.url)) },
    },
  },
})
