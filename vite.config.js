import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

// Which build an event came from. Deploys are by hand, so the commit is the version.
function appVersion() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion()) },
  test: {
    // The units worth testing here are pure — parsing and predicates — so there is no
    // DOM to emulate and no jsdom dependency to carry.
    environment: 'node',
    include: [
      'src/**/*.test.js',
      'supabase/functions/_shared/**/*.test.ts',
      'supabase/tests/**/*.test.js',
    ],
  },
})
