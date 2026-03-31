import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      // Redirige /api/* → http://127.0.0.1:8000/*
      // Exemple : /api/api.php?action=get_parts → http://127.0.0.1:8000/api.php?action=get_parts
      // Demarrer le backend : php -S 127.0.0.1:8000 -t api/
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            console.warn('[Vite Proxy] Backend PHP indisponible:', err.message);
            if (res.writeHead) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'error',
                message: 'Backend PHP indisponible. Lancez : php -S 127.0.0.1:8000 -t api/'
              }));
            }
          });
        }
      }
    }
  }
});
