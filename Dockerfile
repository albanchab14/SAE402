# ============================================================
# MARA SAE402 — Dockerfile multi-stage
# Stage 1 : Build frontend (Vite)
# Stage 2 : Serveur de production (Nginx + PHP-FPM)
# ============================================================

# --- Stage 1 : Build frontend ---
FROM node:22-alpine AS frontend-build
WORKDIR /build

# npm install (pas npm ci) : le lockfile est genere sur Windows,
# il manque les binaires natifs Linux/musl pour Rolldown (Vite 8).
# npm install resout les optional dependencies pour la bonne plateforme.
COPY package.json package-lock.json ./
# ARG CACHEBUST invalide le cache Docker pour forcer npm install fresh.
# Coolify injecte automatiquement les ARG dans le build.
ARG CACHEBUST=2
RUN npm install --no-audit --no-fund

COPY index.html vite.config.js ./
COPY src/ src/
COPY public/ public/
ENV NODE_ENV=production
RUN set -e && npx vite build 2>&1


# --- Stage 2 : Image de production ---
FROM php:8.2-fpm-alpine

RUN apk add --no-cache nginx supervisor curl \
    && docker-php-ext-install pdo pdo_mysql

RUN mkdir -p /var/run/php /var/log/supervisor /run/nginx

# Frontend build
COPY --from=frontend-build /build/dist /var/www/html

# Backend PHP
COPY api/ /var/www/api/

# Documents PDF
COPY docs/ /var/www/docs/

# Config Nginx
COPY nginx.conf /etc/nginx/http.d/default.conf

# Entrypoint : genere config.php depuis les variables d'env Coolify
COPY <<'EOF' /docker-entrypoint.sh
#!/bin/sh
set -e

cat > /var/www/api/config.php <<PHPEOF
<?php
define('DB_HOST', '${DB_HOST:-mysql}');
define('DB_NAME', '${DB_NAME:-sae402}');
define('DB_USER', '${DB_USER:-mara_user}');
define('DB_PASS', '${DB_PASS:-}');

define('GEMINI_API_KEY', '${GEMINI_API_KEY:-}');
define('GEMINI_MODEL',   '${GEMINI_MODEL:-gemini-2.0-flash}');

function get_db_connection(): ?PDO {
    try {
        \$pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASS,
            [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false
            ]
        );
        return \$pdo;
    } catch (PDOException \$e) {
        error_log('[MARA] DB Error: ' . \$e->getMessage());
        return null;
    }
}
PHPEOF

echo "[entrypoint] config.php genere avec DB_HOST=${DB_HOST:-mysql}, DB_NAME=${DB_NAME:-sae402}"
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
EOF

RUN chmod +x /docker-entrypoint.sh

# Supervisord : Nginx + PHP-FPM
COPY <<'EOF' /etc/supervisor/conf.d/supervisord.conf
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:php-fpm]
command=php-fpm -F
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

RUN chown -R www-data:www-data /var/www

EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
