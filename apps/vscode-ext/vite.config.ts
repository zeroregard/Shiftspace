import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

async function analyzePlugins(): Promise<PluginOption[]> {
  if (!process.env.ANALYZE) return [];
  const { visualizer } = await import('rollup-plugin-visualizer');
  return [visualizer({ open: true, filename: 'dist/webview/bundle-stats.html' })];
}

export default defineConfig(async () => ({
  plugins: [tailwindcss(), react(), ...(await analyzePlugins())],
  // Webview runs in a sandboxed browser iframe — no Node globals.
  // Replace process.env.NODE_ENV at bundle time so React and other
  // libraries that guard on it don't crash with "process is not defined".
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist/webview',
    emptyOutDir: true,
    sourcemap: true,
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
}));
