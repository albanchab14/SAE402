# CLAUDE.md - Instructions de travail pour le projet MARA SAE402

> Ce fichier contient toutes les instructions que Claude doit suivre
> pour travailler efficacement sur ce projet. A lire en priorite avant toute action.

---

## Contexte du projet

**Nom :** MARA - Maintenance Assistee par Realite Augmentee
**Cadre :** SAE402 - IUT MMI Beziers, annee 2025-2026
**Objectif :** Application web AR permettant de visualiser un robot UR5e,
cliquer sur ses composants et afficher leurs fiches techniques.
**Plan complet :** Voir `../PLAN_PROJET_SAE402.md`

---

## Stack technique OBLIGATOIRE

```
Frontend AR  : A-Frame 1.6+ (deja dans package.json)
Image AR     : AR.js (marqueur .patt)
3D avance    : Three.js (deja dans package.json)
Format 3D    : GLB/glTF (fichier : public/models/UR5e.glb)
Build        : Vite (port 3000, deja configure)
Backend      : PHP 8 (dans /api/)
Base donnees : MySQL (via PDO)
IA           : Google Gemini API (appel cote PHP)
```

**NE JAMAIS utiliser PlayCanvas** - le projet a migre vers A-Frame + Three.js.
**NE PAS utiliser d'autres frameworks JS** (React, Vue, Angular, etc.).
**NE PAS utiliser Babylon.js, Unity WebGL** ou autre moteur 3D.

---

## Structure des fichiers a respecter

```
SAE402/
├── index.html                  # Scene A-Frame principale (PAS de framework JS)
├── package.json                # Ne pas toucher sauf ajout dependance justifiee
├── vite.config.js              # Proxy /api -> localhost:8000 (XAMPP)
├── public/
│   ├── models/
│   │   └── UR5e.glb            # Modele 3D - NE PAS modifier
│   ├── images/parts/           # Images des composants
│   └── markers/
│       ├── reference.patt      # Pattern AR.js
│       └── reference.png       # Image marqueur imprimable
├── src/
│   ├── main.js                 # Point d'entree JS (ES modules)
│   ├── components/             # Composants A-Frame custom
│   ├── ui/                     # Logique des panneaux HTML
│   ├── api/
│   │   └── api-client.js       # Toutes les fonctions fetch() ici
│   └── data/
│       └── robot-parts.json    # Donnees techniques (fallback offline)
├── api/
│   ├── api.php                 # API REST unique (routing par ?action=)
│   ├── config.php              # GITIGNORE - ne pas creer/lire
│   ├── db_setup.sql            # Schema BDD complet
│   └── seed_data.sql           # Donnees initiales UR5e
└── docs/
    └── note-technique.md       # Note technique du projet
```

---

## Regles de code

### HTML / A-Frame
- La scene AR est declaree en HTML avec des balises `<a-scene>`, `<a-entity>`, `<a-sphere>`, etc.
- L'UI (panneaux, boutons) est en HTML classique **par dessus** la scene A-Frame
- Utiliser `position: absolute` et `z-index` pour superposer l'UI a la scene
- Toujours inclure l'attribut `class="clickable"` sur les elements cliquables en AR
- Le curseur A-Frame doit avoir `raycaster="objects: .clickable"`

### JavaScript
- Utiliser **ES modules** uniquement (`import/export`, `type="module"`)
- Tout appel API passe par `src/api/api-client.js` - jamais de fetch() eparpille
- Toujours gerer les erreurs avec `try/catch` ou `.catch()`
- Commenter chaque fonction avec son role et ses parametres
- Eviter les `console.log` en production (les laisser commentes)
- Les composants A-Frame custom sont enregistres avec `AFRAME.registerComponent()`

### CSS
- Theme sombre obligatoire : fond `#0d0d1a`, accent `#6366f1` (violet)
- Glassmorphism pour les panneaux : `backdrop-filter: blur(20px)`, `background: rgba(255,255,255,0.05)`
- Mobile-first : les panneaux s'affichent en bas sur mobile, en lateral sur desktop
- Transitions fluides : `transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)`
- Breakpoint mobile : `max-width: 768px`

### PHP
- Toute la logique API est dans `api/api.php` avec routing par `$_GET['action']` ou `$input['action']`
- Connexion BDD uniquement via PDO (pas mysqli)
- Toujours utiliser des requetes preparees (`$stmt->prepare()`) - jamais de concatenation SQL
- Headers JSON obligatoires en debut de fichier
- La cle Gemini est dans `api/config.php` (jamais en dur dans le code)

### SQL
- Toujours utiliser `CREATE TABLE IF NOT EXISTS`
- Les specs des composants sont stockees en JSON dans une colonne `specs JSON`
- Les positions des hotspots sont `hotspot_x FLOAT`, `hotspot_y FLOAT`, `hotspot_z FLOAT`
- Charset : `utf8mb4`

---

## Donnees techniques du robot (reference rapide)

**Modele robot :** Universal Robots UR5e (e-Series)

### 10 composants avec leurs IDs
| ID | Nom interne | Nom FR | Categorie |
|----|-------------|--------|-----------|
| 1 | Joint1_Base | Base (Joint 1) | installation |
| 2 | Joint2_Shoulder | Epaule (Joint 2 - Shoulder) | identification |
| 3 | UpperArm_Segment | Bras superieur (segment J2-J3) | identification |
| 4 | Joint3_Elbow | Coude (Joint 3 - Elbow) | identification |
| 5 | ForeArm_Segment | Avant-bras (segment J3-J5) | identification |
| 6 | Joint4_Wrist1 | Poignet 1 (Joint 4 - Wrist 1) | pieces_detachees |
| 7 | Joint5_Wrist2 | Poignet 2 (Joint 5 - Wrist 2) | pieces_detachees |
| 8 | Joint6_Wrist3_ToolFlange | Poignet 3 + Bride outil (Joint 6) | pieces_detachees |
| 9 | ControlBox | Boitier de commande (Control Box) | alimentation |
| 10 | TeachPendant | Teach Pendant (tablette de programmation) | identification |

### Architecture 6 joints + 2 segments
- **Size 1 (grands joints)** : Joint1_Base, Joint2_Shoulder, Joint3_Elbow
- **Segments mecaniques** : UpperArm_Segment (425mm J2->J3), ForeArm_Segment (~392mm J3->J5)
- **Size 0 (petits joints)** : Joint4_Wrist1 (ref 124100), Joint5_Wrist2 (ref 124101), Joint6_Wrist3_ToolFlange (ref 102414)
- **Periph.** : ControlBox (CB-2), TeachPendant (TP5)

### Specs generales UR5e
- Payload : 5 kg | Portee : 850 mm | Repetabilite : +/-0.03 mm
- Masse : 20.6 kg | Protection : IP54 | Bruit : <65 dB(A)
- Alimentation : 100-240 VAC, 47-440 Hz | Conso : 200W typ / 570W max
- Tous les joints : plage +/-360 deg, vitesse max 180 deg/s

---

## Endpoints API a respecter

| Methode | Parametres | Retour |
|---------|-----------|--------|
| GET | `?action=get_parts` | Array de tous les composants |
| GET | `?action=get_part&id=X` | Objet composant + specs |
| GET | `?action=get_docs&part_id=X` | Array de documents |
| GET | `?action=get_faq` | Array de Q/A |
| POST | `{action: "ask_ai", question, context}` | `{answer: "..."}` |
| POST | `{action: "log_interaction", part_id, action_type}` | `{status: "success"}` |

---

## Comportements AR obligatoires

1. **Detection marqueur** : Utiliser AR.js avec fichier `.patt` (pattern marker)
2. **Placement robot** : Le modele GLB apparait ancre sur le marqueur detecte
3. **Hotspots** : Spheres violettes (`#6366f1`) animees (pulsation), une par composant
4. **Clic hotspot** : Ouvre le panneau fiche technique avec les donnees de l'API
5. **Fallback** : Si pas de camera/AR disponible, afficher le viewer 3D interactif
6. **Labels** : Afficher le nom du composant en texte 3D (`<a-text>`) au survol ou a cote du hotspot

---

## UI - Panneaux obligatoires

### Panneau fiche technique (`#info-panel`)
- Nom + categorie du composant
- Description textuelle
- Tableau des specifications techniques
- Onglets : General | Specs | Documents | Maintenance
- Bouton "Poser une question a l'IA"
- Bouton fermeture

### Panneau assistant IA (`#chat-panel`)
- Historique des messages (user + IA)
- Input texte + bouton envoyer
- 3 questions suggerees au demarrage (depuis la FAQ en BDD)
- Indicateur de chargement pendant la reponse Gemini

### Overlay principal
- Titre "MARA - AR Robot UR5e"
- Badge statut connexion BDD (vert = OK, rouge = erreur)
- Indicateur detection marqueur AR (vert quand detecte)
- Bouton bascule AR / Viewer 3D

---

## Environnement de developpement

### Commandes utiles
```bash
# Demarrer le frontend
cd SAE402
npm run dev          # Lance Vite sur http://localhost:3000

# Demarrer le backend PHP (dans un autre terminal)
php -S localhost:8000 -t api/    # OU utiliser XAMPP

# Build production
npm run build        # Genere le dossier dist/
```

### Proxy Vite
- Vite redirige automatiquement `/api` → `http://localhost:8000`
- Ne pas appeler directement `http://localhost:8000` depuis le front
- Toujours utiliser `/api?action=...` dans les fetch()

### Config BDD (a creer manuellement, jamais committer)
```php
// api/config.php
<?php
define('DB_HOST', 'localhost');
define('DB_NAME', 'sae402');
define('DB_USER', 'root');
define('DB_PASS', '');
define('GEMINI_API_KEY', 'VOTRE_CLE_ICI');

function get_db_connection() {
    return new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
}
```

---

## Ce que Claude doit faire a chaque intervention

### Avant d'ecrire du code
- [ ] Lire les fichiers concernes avant de les modifier (jamais ecrire a l'aveugle)
- [ ] Verifier que le fichier existe deja ou doit etre cree
- [ ] Respecter la structure de fichiers definie ci-dessus
- [ ] Verifier que la techno utilisee est dans le stack autorise

### Pendant l'ecriture
- [ ] Commenter chaque fonction (role, params, retour)
- [ ] Gerer tous les cas d'erreur (API offline, GLB non charge, marqueur non detecte)
- [ ] Ne jamais laisser de `TODO` ou `placeholder` non fonctionnel
- [ ] Tester mentalement le code avant de le livrer
- [ ] Ne pas ecrire de code mort ou inutilise

### Apres avoir ecrit du code
- [ ] Faire un recap de ce qui a ete fait
- [ ] Signaler ce qui reste a faire (prochaine etape)
- [ ] Indiquer comment tester ce qui vient d'etre code
- [ ] Signaler les dependances ou prerequis necessaires

---

## Erreurs courantes a eviter

- ❌ Importer PlayCanvas (`import * as pc from 'playcanvas'`)
- ❌ Utiliser `document.querySelector('canvas')` directement (A-Frame gere le canvas)
- ❌ Ecrire la cle Gemini en dur dans le code JS (toujours via PHP)
- ❌ Faire des appels API Gemini cote client (cle exposee) - toujours via le backend PHP
- ❌ Oublier `vr-mode-ui="enabled: false"` sur `<a-scene>` (sinon bouton VR intrusif)
- ❌ Charger le GLB directement depuis `../pdf/UR5e.glb` - toujours depuis `public/models/`
- ❌ Utiliser `innerHTML` pour injecter du HTML non sanitise
- ❌ Oublier le fallback si la camera AR n'est pas disponible
- ❌ Creer ou modifier `api/config.php` (fichier gitignore, credentials sensibles)

---

## Priorites du projet (ordre d'importance)

1. **Fonctionnel > Esthetique** : L'AR et les hotspots doivent marcher avant le polish
2. **Mobile-first** : L'usage AR principal est sur telephone
3. **Fallback obligatoire** : Le viewer 3D doit fonctionner sans camera AR
4. **Donnees reelles** : Utiliser les vraies specs du UR5e, pas des placeholders
5. **Code propre** : Commente, structure, sans code mort

---

## Ressources et references

- Documentation A-Frame : https://aframe.io/docs/
- Documentation AR.js : https://ar-js-org.github.io/AR.js-Docs/
- Generateur marqueur AR.js : https://ar-js-org.github.io/AR.js/three.js/examples/marker-training/
- Documentation Gemini API : https://ai.google.dev/docs
- Viewer GLB en ligne : https://gltf.report/
- Three.js docs : https://threejs.org/docs/
