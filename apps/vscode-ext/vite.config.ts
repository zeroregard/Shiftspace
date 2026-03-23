import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/webview/index.tsx'),
      formats: ['iife'],
      name: 'Shiftspace',
      fileName: () => 'index',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'index.[ext]',
      },
    },
  },
});
