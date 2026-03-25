import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@shiftspace/renderer': resolve(__dirname, '../../packages/renderer/src/index.ts'),
    },
  },
  server: {
    port: 5173,
  },
});
