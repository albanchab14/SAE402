import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
  server: {
    port: parseInt(process.env.PORT || '3000'),
    https: true,  // HTTPS auto-signe — necessaire pour camera AR sur mobile
    host: true,   // Expose sur le reseau local (0.0.0.0)
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
