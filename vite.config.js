import { defineConfig } from 'vite';
import { createReadStream, existsSync } from 'fs';
import { resolve, extname } from 'path';

// Plugin maison : sert les fichiers du dossier ./docs/ à l'URL /docs/
// Nécessaire car Vite ne sert que le dossier public/ par défaut.
function serveDocsFolder() {
    return {
        name: 'serve-docs-folder',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (!req.url?.startsWith('/docs/')) return next();

                const relativePath = decodeURIComponent(req.url.slice(6)); // enlève '/docs/'
                const filePath = resolve('./docs', relativePath);

                if (!existsSync(filePath)) return next();

                const mime = {
                    '.pdf':  'application/pdf',
                    '.png':  'image/png',
                    '.jpg':  'image/jpeg',
                    '.jpeg': 'image/jpeg',
                };
                const type = mime[extname(filePath).toLowerCase()] || 'application/octet-stream';

                res.setHeader('Content-Type', type);
                res.setHeader('Cache-Control', 'no-store');
                createReadStream(filePath).pipe(res);
            });
        }
    };
}

// defineConfig en mode async pour pouvoir importer basicSsl dynamiquement.
// basicSsl est un devDependency — en production (Docker/Coolify), npm ci
// ne l'installe pas si NODE_ENV=production. L'import dynamique évite
// que le module manquant fasse planter le build.
export default defineConfig(async ({ command }) => {
    const plugins = [serveDocsFolder()];

    if (command === 'serve') {
        // Import dynamique : résolu uniquement en mode dev
        const { default: basicSsl } = await import('@vitejs/plugin-basic-ssl');
        plugins.unshift(basicSsl());
    }

    return {
        plugins,
        server: {
            port: parseInt(process.env.PORT || '3000'),
            https: true,  // HTTPS auto-signé — nécessaire pour la caméra AR sur mobile
            host: true,   // Expose sur le réseau local (0.0.0.0)
            proxy: {
                // Redirige /api/* → http://localhost:8000/*
                '/api': {
                    target: 'http://localhost:8000',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, '')
                }
            }
        }
    };
});
