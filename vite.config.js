import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // The units worth testing here are pure — parsing and predicates — so there is no
    // DOM to emulate and no jsdom dependency to carry.
    environment: 'node',
    include: ['src/**/*.test.js', 'supabase/functions/_shared/**/*.test.ts'],
  },
})
