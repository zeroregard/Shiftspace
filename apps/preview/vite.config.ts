import { defineConfig, type PluginOption } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

async function analyzePlugins(): Promise<PluginOption[]> {
  if (!process.env.ANALYZE) return [];
  const { visualizer } = await import('rollup-plugin-visualizer');
  return [visualizer({ open: true, filename: 'dist/bundle-stats.html' })];
}

export default defineConfig(async () => ({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    ...(await analyzePlugins()),
  ],
  resolve: {
    alias: {
      '@shiftspace/renderer': resolve(__dirname, '../../packages/renderer/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
}));
