import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import pkg from './package.json';

// Externalize all declared dependencies, peerDependencies, and their sub-paths
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];
const externalRE = new RegExp(
  `^(${external.map((d) => d.replace('/', '\\/')).join('|')})(\\/.+)?$`
);

export default defineConfig({
  plugins: [
    react({ jsxRuntime: 'automatic' }),
    dts({
      tsconfigPath: './tsconfig.json',
      rollupTypes: false,
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: (id) => externalRE.test(id),
    },
    sourcemap: true,
  },
});
