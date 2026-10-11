import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// L'app est servie à la racine par le serveur (Railway) ; en dev, Vite relaie /api vers le serveur local.
export default defineConfig({
  base: '/',
  server: { proxy: { '/api': 'http://localhost:8787' } },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
