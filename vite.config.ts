import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      // Two independent entry points. The ops console (admin spec §2.4) is its
      // own bundle so it can be deployed to ops.motoconnect.rw rather than
      // hanging off a guessable path on the consumer domain. Nothing in the
      // consumer app imports from src/admin, and no public page links to it.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
  server: {
    port: 3000,
    // Dev proxy: frontend talks to the API + WebSocket on the same origin.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
