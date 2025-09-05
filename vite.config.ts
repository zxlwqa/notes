import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          // 将 React 相关库分离到单独的 chunk
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // 将 UI 库分离
          'ui-vendor': ['lucide-react'],
          // 将编辑器相关库分离
          'editor-vendor': ['react-simplemde-editor', 'react-markdown'],
          // 将工具库分离
          'utils-vendor': ['axios', 'clsx']
        },
        // 设置 chunk 大小警告限制
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // 设置 chunk 大小警告限制
    chunkSizeWarningLimit: 1000
  },
})
