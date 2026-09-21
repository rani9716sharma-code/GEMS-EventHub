import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
export default defineConfig({plugins:[react()],test:{environment:'jsdom',include:['tests/**/*.test.tsx'],setupFiles:['tests/ui-setup.ts'],testTimeout:15000,hookTimeout:15000,fileParallelism:false}})
