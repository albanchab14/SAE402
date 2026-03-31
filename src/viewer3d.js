/**
 * viewer3d.js — Viewer Three.js + WebXR AR avec détection de surface
 *
 * Mode Viewer 3D (par défaut) :
 *   Fond sombre, grille, OrbitControls souris/tactile.
 *   Robot UR5e chargé depuis /models/UR5e.glb.
 *   Hotspots cliquables (sphères violettes animées) avec labels.
 *
 * Mode AR WebXR :
 *   Session immersive-ar + hit-test (ARCore Android / ARKit iOS).
 *   Anneau (réticule) violet qui suit la surface détectée.
 *   Tap → pose le robot à l'endroit pointé.
 *   Tap sur hotspot → ouvre la fiche technique.
 *   Requiert HTTPS + Chrome Android avec ARCore, ou Safari iOS 14+.
 */

import * as THREE from 'three';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Variables module ─────────────────────────────────────────────────────────

let renderer, scene, camera, controls, animFrameId;
let raycaster, mouse;
let hotspotMeshes  = [];
let hoveredHotspot = null;
let robotModel     = null;
let robotGroup     = null;   // Groupe parent : robot + hotspots, bras à la verticale
let gridHelper     = null;
let floorMeshRef   = null;
let partsData      = [];
let canvas         = null;
let isInitialized  = false;
let onHotspotClick = null;   // Callback(part) déclenché au clic sur un hotspot

// ─── Variables WebXR ──────────────────────────────────────────────────────────

let xrSession       = null;
let xrHitTestSource = null;
let xrRefSpace      = null;
let xrReticle       = null;
let xrController    = null;
let xrRobotPlaced   = false;
let onRobotPlaced   = null;  // Callback appelé quand le robot est posé sur la surface

// ─── Constante d'échelle XR ───────────────────────────────────────────────────
// En WebXR 1 unité Three.js = 1 mètre réel.
// Le robot est mis à l'échelle 3 unités dans le viewer (bras ≈ 3 m).
// XR_SCALE = 0.3 → bras ≈ 90 cm (proche de la taille réelle UR5e 850 mm).
const XR_SCALE = 0.3;

// ─────────────────────────────────────────────────────────────────────────────
// initViewer — Point d'entrée public
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise le viewer Three.js sur le canvas fourni.
 * @param {HTMLCanvasElement} canvasEl - Canvas de rendu
 * @param {Array}             parts    - Données des composants (API ou JSON)
 * @param {Function}          clickCb  - fn(part) appelée au clic sur un hotspot
 */
export function initViewer(canvasEl, parts = [], clickCb = null) {
    if (isInitialized) return;
    isInitialized  = true;
    canvas         = canvasEl;
    partsData      = parts;
    onHotspotClick = clickCb;

    // ── Renderer ──────────────────────────────────────────────────────────────
    // alpha:true nécessaire pour que WebXR AR puisse rendre sur fond caméra
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0d0d1a, 1);
    renderer.xr.enabled = false; // activé uniquement pendant une session XR

    // ── Scène ─────────────────────────────────────────────────────────────────
    scene     = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0d0d1a, 0.03);

    // ── Caméra ────────────────────────────────────────────────────────────────
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(2.5, 1.5, 6);

    // ── Lumières ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x8899ff, 0.7));

    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(4, 6, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near   = 0.5;
    dir.shadow.camera.far    = 30;
    dir.shadow.camera.left   = -5;
    dir.shadow.camera.right  = 5;
    dir.shadow.camera.top    = 5;
    dir.shadow.camera.bottom = -5;
    scene.add(dir);

    const accent = new THREE.DirectionalLight(0x6366f1, 0.5);
    accent.position.set(-4, 2, -3);
    scene.add(accent);

    const topLight = new THREE.PointLight(0xa855f7, 0.7, 15);
    topLight.position.set(0, 5, 0);
    scene.add(topLight);

    // ── Sol + grille (masqués en mode AR) ─────────────────────────────────────
    gridHelper = new THREE.GridHelper(12, 24, 0x6366f1, 0x1a1a3a);
    gridHelper.position.y = -2;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    floorMeshRef = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floorMeshRef.rotation.x   = -Math.PI / 2;
    floorMeshRef.position.y   = -2;
    floorMeshRef.receiveShadow = true;
    scene.add(floorMeshRef);

    // ── Chargement GLB ────────────────────────────────────────────────────────
    new GLTFLoader().load(
        '/models/UR5e.glb',
        gltf => _onModelLoaded(gltf),
        null,
        err  => console.error('[Viewer] Erreur chargement GLB :', err)
    );

    // ── OrbitControls ─────────────────────────────────────────────────────────
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.rotateSpeed    = 0.5;
    controls.zoomSpeed      = 1.2;
    controls.panSpeed       = 0.7;
    controls.minDistance    = 1.5;
    controls.maxDistance    = 14;
    controls.maxPolarAngle  = Math.PI * 0.88;
    controls.target.set(0, 1.3, 0);
    controls.update();

    // ── Raycaster ─────────────────────────────────────────────────────────────
    raycaster = new THREE.Raycaster();
    mouse     = new THREE.Vector2();

    // ── Événements ────────────────────────────────────────────────────────────
    canvas.addEventListener('click',     _onCanvasClick);
    canvas.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('resize',    _onResize);

    // ── Démarrer la boucle de rendu ───────────────────────────────────────────
    _animate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Chargement du modèle GLB
// ─────────────────────────────────────────────────────────────────────────────

function _onModelLoaded(gltf) {
    robotModel = gltf.scene;

    // Centrer le modèle sur son bounding box et le mettre à l'échelle
    const box    = new THREE.Box3().setFromObject(robotModel);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    robotModel.position.sub(center);

    const scale = 3.0 / Math.max(size.x, size.y, size.z);
    robotModel.scale.setScalar(scale);

    // Ombres sur tous les meshes
    robotModel.traverse(child => {
        if (child.isMesh) {
            child.castShadow    = true;
            child.receiveShadow = true;
        }
    });

    // Groupe parent :
    //   rotation Z = +90° → l'axe X du GLB (bras horizontal) devient l'axe Y (bras vertical)
    //   position Y = +2.1 → base du bras à y = 0 dans l'espace monde
    robotGroup = new THREE.Group();
    robotGroup.rotation.z = Math.PI / 2;
    robotGroup.position.set(0, 2.1, 0);
    robotGroup.add(robotModel);
    scene.add(robotGroup);

    // Caméra positionnée pour voir le robot debout
    camera.position.set(2.5, 1.5, 6);
    controls.target.set(0, 1.3, 0);
    controls.update();

    // Créer les hotspots si les données sont disponibles
    if (partsData.length > 0) _createHotspots(partsData);
}

// ─────────────────────────────────────────────────────────────────────────────
// Hotspots 3D
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée les sphères hotspot et les attache au robotGroup.
 * Elles héritent de la rotation/position/scale du groupe.
 * @param {Array} parts - données des composants
 */
function _createHotspots(parts) {
    // Supprimer anciens hotspots
    hotspotMeshes.forEach(h => robotGroup ? robotGroup.remove(h) : scene.remove(h));
    hotspotMeshes = [];

    parts.forEach(part => {
        const px = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
        const py = parseFloat(part.hotspot_y ?? part.hotspot_position?.y ?? 0);
        const pz = parseFloat(part.hotspot_z ?? part.hotspot_position?.z ?? 0);

        // Sphère principale (glow violet)
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 16, 16),
            new THREE.MeshStandardMaterial({
                color: 0x6366f1, emissive: 0x6366f1, emissiveIntensity: 0.8,
                roughness: 0.2,  metalness: 0.1,
                transparent: true, opacity: 0.9
            })
        );
        sphere.position.set(px, py, pz);
        sphere.userData = { part, isHotspot: true };

        // Anneau animé
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.1, 0.13, 32),
            new THREE.MeshBasicMaterial({
                color: 0xa855f7, transparent: true, opacity: 0.6, side: THREE.DoubleSide
            })
        );
        ring.userData = { isRing: true };
        sphere.add(ring);

        // Label texte
        const label = _createTextLabel(part.name_fr || part.name);
        label.position.set(0, 0.18, 0);
        sphere.add(label);

        if (robotGroup) robotGroup.add(sphere);
        else            scene.add(sphere);
        hotspotMeshes.push(sphere);
    });
}

/**
 * Crée un sprite texte via canvas 2D → texture Three.js.
 * @param {string} text
 * @returns {THREE.Sprite}
 */
function _createTextLabel(text) {
    const cv  = document.createElement('canvas');
    cv.width  = 256;
    cv.height = 64;
    const ctx = cv.getContext('2d');

    ctx.fillStyle = 'rgba(13,13,26,0.75)';
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();

    ctx.fillStyle     = '#ffffff';
    ctx.font          = 'bold 18px Inter, Arial, sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(text, 128, 32);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0
    }));
    sprite.scale.set(0.6, 0.15, 1);
    sprite.userData = { isLabel: true };
    return sprite;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactions souris / tactile (viewer 3D uniquement)
// ─────────────────────────────────────────────────────────────────────────────

function _onCanvasClick(e) {
    // Ne pas intercéder si une session XR est active (géré par _onXRTap)
    if (xrSession) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObjects(hotspotMeshes, false);
    if (hits.length > 0) {
        const h = hits[0].object;
        if (h.userData.part && onHotspotClick) {
            _flashHotspot(h);
            onHotspotClick(h.userData.part);
        }
    }
}

function _onMouseMove(e) {
    if (!canvas || xrSession) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObjects(hotspotMeshes, false);

    // Réinitialiser l'ancien hover
    if (hoveredHotspot && (!hits.length || hits[0].object !== hoveredHotspot)) {
        hoveredHotspot.material.emissive.setHex(0x6366f1);
        hoveredHotspot.material.emissiveIntensity = 0.8;
        hoveredHotspot.scale.setScalar(1);
        hoveredHotspot.children.forEach(c => {
            if (c.userData.isLabel) c.material.opacity = 0;
        });
        hoveredHotspot   = null;
        canvas.style.cursor = 'default';
    }

    if (hits.length > 0 && hits[0].object !== hoveredHotspot) {
        hoveredHotspot = hits[0].object;
        hoveredHotspot.material.emissive.setHex(0xa855f7);
        hoveredHotspot.material.emissiveIntensity = 1.2;
        hoveredHotspot.scale.setScalar(1.3);
        hoveredHotspot.children.forEach(c => {
            if (c.userData.isLabel) c.material.opacity = 1;
        });
        canvas.style.cursor = 'pointer';
    }
}

/** Animation flash sur le hotspot cliqué. */
function _flashHotspot(hotspot) {
    let t = 0;
    const id = setInterval(() => {
        hotspot.material.emissiveIntensity = ++t % 2 === 0 ? 2.0 : 0.5;
        if (t >= 6) { clearInterval(id); hotspot.material.emissiveIntensity = 0.8; }
    }, 80);
}

// ─────────────────────────────────────────────────────────────────────────────
// Boucle de rendu viewer 3D
// ─────────────────────────────────────────────────────────────────────────────

function _animate() {
    animFrameId = requestAnimationFrame(_animate);
    if (controls) controls.update();
    _animateHotspots();
    renderer.render(scene, camera);
}

/** Pulsation + rotation anneau + billboard label (commun viewer et XR). */
function _animateHotspots() {
    const t = performance.now() * 0.001;
    hotspotMeshes.forEach((h, i) => {
        if (h !== hoveredHotspot) h.scale.setScalar(1 + Math.sin(t * 2 + i * 0.8) * 0.08);
        h.children.forEach(c => {
            if (c.userData.isRing) {
                c.rotation.z += 0.015;
                c.material.opacity = 0.4 + Math.sin(t * 3 + i) * 0.2;
            }
            if (c.userData.isLabel && camera) c.quaternion.copy(camera.quaternion);
        });
    });
}

function _onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports utilitaires
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Met à jour les hotspots (si les données arrivent après le modèle).
 * @param {Array} parts
 */
export function updateHotspots(parts) {
    partsData = parts;
    if (robotGroup) _createHotspots(parts);
}

/**
 * Bascule le fond entre mode sombre (viewer 3D) et transparent.
 * @param {boolean} transparent
 */
export function setViewerMode(transparent) {
    if (!renderer) return;
    renderer.setClearColor(0x0d0d1a, transparent ? 0 : 1);
    if (gridHelper)   gridHelper.visible   = !transparent;
    if (floorMeshRef) floorMeshRef.visible = !transparent;
    if (scene)        scene.fog = transparent ? null : new THREE.FogExp2(0x0d0d1a, 0.03);
}

/** Stoppe et nettoie le viewer. */
export function stopViewer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    canvas?.removeEventListener('click',     _onCanvasClick);
    canvas?.removeEventListener('mousemove', _onMouseMove);
    window.removeEventListener('resize', _onResize);
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = camera = controls = null;
    hotspotMeshes = [];
    robotModel = robotGroup = null;
    gridHelper = floorMeshRef = null;
    isInitialized = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebXR AR — Détection de surface + placement du robot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie si WebXR immersive-ar avec hit-test est supporté.
 * @returns {Promise<boolean>}
 */
export async function isXRSupported() {
    if (!navigator.xr) return false;
    return navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
}

/**
 * Démarre une session WebXR AR.
 * La caméra du téléphone est gérée nativement par WebXR (pas getUserMedia).
 * Affiche un réticule violet sur la surface détectée.
 * Premier tap → pose le robot. Tap suivant → interaction hotspot.
 *
 * @param {Function} [placedCb] - appelée quand le robot est posé
 * @throws {Error} si WebXR indisponible ou permission refusée
 */
export async function startXRSession(placedCb = null) {
    if (!renderer) throw new Error('Viewer non initialisé');
    onRobotPlaced = placedCb;

    // Demander la session AR avec hit-test obligatoire et dom-overlay sur document.body.
    // IMPORTANT : utiliser document.body (et non #ar-overlay) comme racine dom-overlay
    // pour que TOUTE l'interface HTML (info-panel, chat-panel, etc.) reste visible
    // par-dessus le flux caméra AR.
    const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });
    xrSession = session;

    // IMPORTANT : Three.js demande 'local-floor' par défaut dans setSession(),
    // ce qui échoue sur de nombreux appareils Android.
    // On impose 'local' AVANT setSession() pour forcer ce type de référence.
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.enabled = true;
    await renderer.xr.setSession(session);

    // Espace de référence pour récupérer les poses des hit-test en coordonnées monde.
    // 'local' est toujours disponible pour une session immersive-ar.
    xrRefSpace = await session.requestReferenceSpace('local');

    // Source de hit-test : la direction de visée de la caméra (viewer space)
    const vwrSpace  = await session.requestReferenceSpace('viewer');
    xrHitTestSource = await session.requestHitTestSource({ space: vwrSpace });

    // Créer le réticule (anneau qui suit la surface)
    _createXRReticle();

    // Contrôleur 0 → gère les taps sur l'écran
    xrController = renderer.xr.getController(0);
    xrController.addEventListener('select', _onXRTap);
    scene.add(xrController);

    // Masquer grille/sol/robot avant placement
    if (robotGroup)   robotGroup.visible   = false;
    if (gridHelper)   gridHelper.visible   = false;
    if (floorMeshRef) floorMeshRef.visible = false;
    if (scene)        scene.fog            = null;
    if (controls)     controls.enabled     = false;

    xrRobotPlaced = false;

    // Remplacer la boucle normale par la boucle XR
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    renderer.setAnimationLoop(_xrRenderLoop);

    session.addEventListener('end', _onXRSessionEnd);
}

/**
 * Met fin à la session WebXR et revient au viewer 3D.
 */
export function stopXRSession() {
    if (xrSession) xrSession.end();
}

// ── Réticule (anneau qui suit la surface détectée) ───────────────────────────

function _createXRReticle() {
    if (xrReticle) { scene.remove(xrReticle); xrReticle.geometry?.dispose(); }
    const geo = new THREE.RingGeometry(0.1, 0.15, 32);
    geo.rotateX(-Math.PI / 2); // couché à plat sur la surface
    xrReticle = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x6366f1, side: THREE.DoubleSide
    }));
    xrReticle.matrixAutoUpdate = false; // matrice fournie par le hit-test
    xrReticle.visible = false;
    scene.add(xrReticle);
}

// ── Gestion du tap écran ──────────────────────────────────────────────────────

function _onXRTap() {
    if (!xrRobotPlaced) {
        // 1er tap : poser le robot sur la surface détectée
        if (xrReticle?.visible) _placeRobotXR();
    } else {
        // Robot déjà posé : tester clic sur hotspot
        _checkXRHotspotHit();
    }
}

/**
 * Place le robot à la position du réticule.
 * Le bras est toujours vertical, la base repose sur la surface.
 */
function _placeRobotXR() {
    if (!robotGroup || !xrReticle) return;

    // Position de la surface depuis la matrice du réticule
    const surfacePos = new THREE.Vector3();
    xrReticle.matrix.decompose(surfacePos, new THREE.Quaternion(), new THREE.Vector3());

    robotGroup.scale.setScalar(XR_SCALE);

    // Bras vertical, base posée sur la surface
    // Le centre géométrique du robot est à l'origine du groupe.
    // Avec rotation Z = 90°, le bras s'étend de Y = -1.5 à Y = +1.5 unités.
    // On décale de +1.5 * scale pour que la base soit sur la surface.
    robotGroup.rotation.set(0, 0, Math.PI / 2);
    robotGroup.position.set(
        surfacePos.x,
        surfacePos.y + 1.5 * XR_SCALE,
        surfacePos.z
    );

    robotGroup.visible = true;
    xrReticle.visible  = false;
    xrRobotPlaced      = true;

    // Grossir les hotspots pour qu'ils soient bien visibles et cliquables en AR
    hotspotMeshes.forEach(h => h.scale.setScalar(2.5));

    // Afficher le viseur pour aider l'utilisateur à viser les hotspots
    const crosshair = document.getElementById('ar-crosshair');
    if (crosshair) crosshair.style.display = 'block';

    if (onRobotPlaced) onRobotPlaced();
}

/**
 * Détecte le hotspot le plus proche du centre de la caméra XR.
 *
 * Méthode : distance perpendiculaire rayon → centre du hotspot en coordonnées monde.
 * Plus fiable que l'intersection géométrique car les hotspots font ~2–3 cm après
 * l'échelle XR (0.08 * 0.3 = 2.4 cm) — quasi impossible à viser avec un raycaster strict.
 * Seuil de 12 cm autour du rayon de visée → confortable pour un usage mobile.
 */
function _checkXRHotspotHit() {
    if (!hotspotMeshes.length) return;

    // Rayon issu du centre de la caméra XR (direction de visée du téléphone)
    const xrCam  = renderer.xr.getCamera();
    const origin = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
    const dir    = new THREE.Vector3(0, 0, -1).transformDirection(xrCam.matrixWorld);
    const ray    = new THREE.Ray(origin, dir);

    // Distance perpendiculaire maximale tolérée (en mètres dans l'espace monde XR)
    const HIT_THRESHOLD = 0.12; // 12 cm → facile à viser sur mobile

    let bestHotspot = null;
    let bestDist    = Infinity;

    hotspotMeshes.forEach(h => {
        const worldPos = new THREE.Vector3();
        h.getWorldPosition(worldPos);

        // Ignorer si le hotspot est derrière la caméra
        if (worldPos.clone().sub(origin).dot(dir) <= 0) return;

        const perpDist = ray.distanceToPoint(worldPos);
        if (perpDist < HIT_THRESHOLD && perpDist < bestDist) {
            bestDist    = perpDist;
            bestHotspot = h;
        }
    });

    if (bestHotspot && onHotspotClick) {
        _flashHotspot(bestHotspot);
        onHotspotClick(bestHotspot.userData.part);
    }
}

// ── Boucle de rendu XR ────────────────────────────────────────────────────────

/**
 * Boucle appelée par le système WebXR à chaque frame.
 * Met à jour le réticule via hit-test et anime les hotspots.
 */
function _xrRenderLoop(timestamp, frame) {
    if (!frame) return;

    // Mettre à jour le réticule tant que le robot n'est pas posé
    if (xrHitTestSource && !xrRobotPlaced) {
        const results = frame.getHitTestResults(xrHitTestSource);
        if (results.length > 0) {
            const pose = results[0].getPose(xrRefSpace);
            if (pose) {
                xrReticle.visible = true;
                xrReticle.matrix.fromArray(pose.transform.matrix);
            }
        } else {
            xrReticle.visible = false;
        }
    }

    _animateHotspots();
    renderer.render(scene, camera);
}

// ── Fin de session : retour au viewer 3D ─────────────────────────────────────

function _onXRSessionEnd() {
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;

    // Nettoyage ressources XR
    xrHitTestSource?.cancel?.();
    xrHitTestSource = null;
    if (xrReticle)    { scene.remove(xrReticle);    xrReticle    = null; }
    if (xrController) { scene.remove(xrController); xrController = null; }

    // Restaurer le robot dans son état viewer 3D
    if (robotGroup) {
        robotGroup.visible = true;
        robotGroup.scale.setScalar(1);
        robotGroup.position.set(0, 2.1, 0);
        robotGroup.rotation.set(0, 0, Math.PI / 2);
    }
    // Remettre les hotspots à leur taille normale
    hotspotMeshes.forEach(h => h.scale.setScalar(1));

    if (gridHelper)   gridHelper.visible   = true;
    if (floorMeshRef) floorMeshRef.visible = true;
    if (scene)        scene.fog = new THREE.FogExp2(0x0d0d1a, 0.03);
    if (controls)     controls.enabled     = true;

    // Masquer le viseur AR
    const crosshair = document.getElementById('ar-crosshair');
    if (crosshair) crosshair.style.display = 'none';

    xrSession     = null;
    xrRobotPlaced = false;

    _animate();
}
