import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { claudeCliPlugin } from './server/claude-cli.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), claudeCliPlugin()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      'dictionary-en-files': path.resolve(import.meta.dirname, './node_modules/dictionary-en'),
    },
  },
})
