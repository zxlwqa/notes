import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import postcssConfig from './postcss.js'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: postcssConfig,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {

          'react-vendor': ['react', 'react-dom', 'react-router-dom'],

          'ui-vendor': ['lucide-react'],

          'editor-vendor': ['react-simplemde-editor', 'react-markdown'],

          'utils-vendor': ['axios', 'clsx']
        },

        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },

    chunkSizeWarningLimit: 1000
  },
})
