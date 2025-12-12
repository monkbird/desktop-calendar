// vite.config.ts
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        // 配置两个入口文件
        main: resolve(__dirname, 'index.html'),
        tooltip: resolve(__dirname, 'tooltip.html'), 
      },
    },
  },
})