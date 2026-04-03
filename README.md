# MARA — Maintenance AR Robot UR5e

## Installation rapide

```bash
npm install
```

## Base de données

Ce projet nécessite une base de données pour fonctionner en mode "En ligne" :

1. **Installer XAMPP**
2. **Démarrer le service MySQL** via le panneau de contrôle XAMPP.
3. **Créer une base de données** (ex: `mara_db`).
4. **Importer le schéma** : Importez le fichier `api/db_setup.sql` situé dans le dossier `api/`.
5. **Configuration** : Copiez `api/config.php.example` vers `api/config.php` et renseignez vos identifiants SQL.

## Développement

Lancez les deux commandes suivantes dans des terminaux séparés :

**1. Frontend :**

```bash
npm run dev
```

Accessible sur `http://localhost:3000`

**2. Backend :**

```bash
php -S 127.0.0.1:8000 -t api/
```

Assurez-vous que le fichier `api/config.php` est bien configuré (copié de `config.php.example`).

## Tester en AR

Pour tester l'AR sur votre smartphone en local, utilisez un tunnel sécurisé :

```bash
ngrok http 3000
```

Ouvrez l'URL votre téléphone.

---

_Projet SAE402 — IUT MMI Béziers_
