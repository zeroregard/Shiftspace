import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';
import pkg from './package.json';

// Sub-packages are bundled into the umbrella (not externalized) so that
// consumers like the vscode-ext get self-contained .d.ts declarations
// without needing to resolve source-level sub-packages.
const bundledDeps = [
  '@shiftspace/renderer-core',
  '@shiftspace/renderer-grove',
  '@shiftspace/renderer-inspection',
];

// Externalize everything except the sub-packages
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
].filter((d) => !bundledDeps.includes(d));

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
