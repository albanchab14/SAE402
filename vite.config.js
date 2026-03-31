import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      // Redirige /api/* → http://localhost:8000/*
      // Exemple : /api/api.php?action=get_parts → http://localhost:8000/api.php?action=get_parts
      // Demarrer le backend : php -S localhost:8000 -t api/
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
