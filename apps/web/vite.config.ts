import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { agentHelp } from './agent-help.js'

export default defineConfig({
  plugins: [agentHelp(), react()],
  base: './',
})
