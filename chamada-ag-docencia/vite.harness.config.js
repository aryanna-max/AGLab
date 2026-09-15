import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify('harness') },
  plugins: [react()],
  resolve: { alias: [
    { find: /^\.\/lib\/store$/, replacement: '/harness/store-mock.js' },
    { find: /^\.\.?\/supabaseClient$/, replacement: '/harness/supabase-mock.js' },
  ] },
  server: { port: 5179, strictPort: true, open: false },
})
