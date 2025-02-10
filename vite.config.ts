import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    root: './studio',
    build: {
        outDir: 'dist',
    },
    server: {
        port: 3600,
    }
})
