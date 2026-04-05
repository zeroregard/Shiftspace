import { defineConfig, devices } from '@playwright/experimental-ct-react';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  testDir: './src',
  snapshotPathTemplate: '{testDir}/../__screenshots__/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',

  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },

    ctViteConfig: {
      plugins: [
        tailwindcss(),
        react({
          babel: {
            plugins: ['babel-plugin-react-compiler'],
          },
        }),
      ],
    },
  },

  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: 'disabled',
    },
  },
});
