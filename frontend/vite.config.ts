import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Canlı path deploy: zirveahsapdekorasyon.com/maliyet → VITE_BASE=/maliyet/
// Firebase Hosting kök / custom subdomain (maliyet.zirveahsap...) → VITE_BASE=/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && !env.VITE_API_URL?.trim()) {
    throw new Error('Production build: VITE_API_URL zorunludur. localhost fallback yok.')
  }
  const base =
    env.VITE_BASE?.trim() || (command === 'build' ? '/maliyet/' : '/')

  return {
    base,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
  }
})
