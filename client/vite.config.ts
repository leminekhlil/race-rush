import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8090', ws: true },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/ws': { target: 'ws://127.0.0.1:8090', ws: true },
    },
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    // Lazily imported physics modules must be pre-bundled with the rest of Babylon (single Scene class in dev).
    include: [
      '@babylonjs/core/Physics/v2/Plugins/havokPlugin',
      '@babylonjs/core/Physics/v2/physicsAggregate',
      '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin',
      '@babylonjs/core/Physics/v2/physicsEngineComponent',
      '@babylonjs/core/Physics/joinedPhysicsEngineComponent',
    ],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@babylonjs/core')) return 'babylon';
          if (id.includes('react')) return 'react';
          return undefined;
        },
      },
    },
  },
});
