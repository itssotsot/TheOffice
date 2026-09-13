import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', assets: 'assets.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});
