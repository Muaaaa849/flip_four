import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages では https://muaaaa849.github.io/flip_four/ に置くので、相対パスで参照する
  base: './',
  build: {
    // @dimforge/rapier2d-compat は WASM を base64 で JS に同梱するので、1つの塊が大きくなる（要項どおりの構成）
    chunkSizeWarningLimit: 4500,
  },
});
