import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        kitchen: resolve(__dirname, 'kitchen.html'),
        qr: resolve(__dirname, 'qr-generator.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
