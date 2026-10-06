import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Windows'ta yalnız ::1 dinlemek 127.0.0.1 erişimini düşürür.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})
