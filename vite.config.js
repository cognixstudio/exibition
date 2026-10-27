import { defineConfig } from 'vite';

// base './' makes the built app work from any sub-path (e.g. GitHub Pages).
export default defineConfig({
  base: './',
  build: { target: 'es2020' },
});
