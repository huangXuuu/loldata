import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
  server: {
    proxy: {
      '/tjstats-api': {
        target: 'https://open.tjstats.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tjstats-api/, ''),
      },
    },
  },
})
