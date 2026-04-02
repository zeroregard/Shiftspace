import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  // Webview runs in a sandboxed browser iframe — no Node globals.
  // Replace process.env.NODE_ENV at bundle time so React and other
  // libraries that guard on it don't crash with "process is not defined".
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/webview/index.tsx'),
      formats: ['iife'],
      name: 'Shiftspace',
      fileName: () => 'index.iife.js',
    },
    rollupOptions: {
      output: {
        assetFileNames: 'index.[ext]',
      },
    },
  },
});
