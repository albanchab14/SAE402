# ============================================================
# MARA SAE402 — Dockerfile multi-stage
# Stage 1 : Build du frontend (Vite)
# Stage 2 : Serveur de production (Nginx + PHP-FPM)
# ============================================================

# --- Stage 1 : Build frontend ---
FROM node:20-alpine AS frontend-build

WORKDIR /build

# Copie les fichiers de dépendances d'abord (cache Docker)
COPY package.json package-lock.json ./
RUN npm ci

# Copie le reste du code source et build
COPY index.html vite.config.js ./
COPY src/ src/
COPY public/ public/
RUN npm run build


# --- Stage 2 : Image de production ---
FROM php:8.2-fpm-alpine

# Installe les extensions PHP nécessaires + Nginx + supervisord
RUN apk add --no-cache \
    nginx \
    supervisor \
    curl \
    && docker-php-ext-install pdo pdo_mysql

# Crée les dossiers nécessaires
RUN mkdir -p /var/run/php /var/log/supervisor /run/nginx

# --- Copie du frontend buildé ---
COPY --from=frontend-build /build/dist /var/www/html

# --- Copie du backend PHP ---
COPY api/ /var/www/api/

# --- Copie des documents PDF ---
COPY docs/ /var/www/docs/

# --- Copie de la config Nginx ---
COPY nginx.conf /etc/nginx/http.d/default.conf

# --- Script pour générer config.php depuis les variables d'env ---
COPY <<'EOF' /docker-entrypoint.sh
#!/bin/sh
set -e

# Génère config.php à partir des variables d'environnement
cat > /var/www/api/config.php <<PHPEOF
<?php
// Configuration générée automatiquement au démarrage du container
// NE PAS MODIFIER — les valeurs viennent des variables d'environnement Coolify

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

echo "[entrypoint] config.php généré avec DB_HOST=${DB_HOST:-mysql}, DB_NAME=${DB_NAME:-sae402}"

# Lance supervisord (Nginx + PHP-FPM)
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
EOF

RUN chmod +x /docker-entrypoint.sh

# --- Config supervisord (lance Nginx + PHP-FPM ensemble) ---
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

# Permissions
RUN chown -R www-data:www-data /var/www

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
