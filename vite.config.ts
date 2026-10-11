import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Même base en dev et en prod : l'URL de redirection OAuth reste
// `${origin}/coros-coach/` dans les deux cas.
export default defineConfig({
  base: '/coros-coach/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
})
