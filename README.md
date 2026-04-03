# MARA — Maintenance AR Robot UR5e

## Installation rapide

```bash
npm install
```

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
