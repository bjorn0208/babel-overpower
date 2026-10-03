import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // duas portas de entrada do MESMO app: o PABX (index) e a proposta
      // pública (proposta.html, com título e prévia próprios — é o que o
      // WhatsApp mostra ao cliente; ver vercel.json)
      input: {
        principal: fileURLToPath(new URL('./index.html', import.meta.url)),
        proposta: fileURLToPath(new URL('./proposta.html', import.meta.url)),
      },
    },
  },
})
