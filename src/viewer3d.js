/**
 * viewer3d.js — Viewer Three.js + WebXR AR avec détection de surface
 *
 * Mode Viewer 3D (par défaut) :
 *   Fond sombre, grille, OrbitControls souris/tactile.
 *   Robot UR5e chargé depuis /models/UR5e.glb.
 *   Clic direct sur un mesh du robot → highlight violet + fiche technique.
 *
 * Mode AR WebXR :
 *   Session immersive-ar + hit-test (ARCore Android / ARKit iOS).
 *   Anneau (réticule) violet qui suit la surface détectée.
 *   Tap → pose le robot. Tap sur le robot → highlight + fiche technique.
 */

import * as THREE from 'three';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ─── Variables module ─────────────────────────────────────────────────────────

let renderer, scene, camera, controls, animFrameId;
let raycaster, mouse;
let robotModel     = null;
let robotGroup     = null;   // Groupe parent : robot, bras à la verticale
let robotMeshes    = [];     // Tous les meshes du GLB (pour le raycasting)
let gridHelper     = null;
let floorMeshRef   = null;
let partsData      = [];
let canvas         = null;
let isInitialized  = false;
let onHotspotClick = null;   // Callback(part, screenPos) déclenché au clic
let cameraAnim     = null;   // animation caméra en cours

// ─── Sélection / highlight ────────────────────────────────────────────────────

// {mesh, originalMaterial} des meshes actuellement mis en violet
let selectedMeshGroups = [];

// Matériau de highlight partagé (violet / indigo)
const HIGHLIGHT_MAT = new THREE.MeshStandardMaterial({
    color      : 0x6366f1,
    emissive   : 0x6366f1,
    emissiveIntensity: 0.55,
    roughness  : 0.3,
    metalness  : 0.15,
    transparent: true,
    opacity    : 0.95,
});

// ─── Zones de la pièce le long de l'axe X local du robotGroup ────────────────
//
// Le bras UR5e s'étend le long de l'axe X local de robotGroup.
// Valeurs calibrées depuis l'analyse du GLB (espace local après scale+center) :
//   Base (J1) :            X ≈ -2.39  (bas du bras en monde : Y ≈ 0)
//   Bride outil (J6) :     X ≈ +0.61  (haut du bras en monde : Y ≈ 2.7)
//
// Les frontières de zone sont les milieux entre deux hotspots consécutifs.
//
const PART_ZONES = [
    { partName: 'Joint1_Base',               xMax: -2.00 },
    { partName: 'Joint2_Shoulder',           xMax: -1.69 },
    { partName: 'UpperArm_Segment',          xMax: -1.205 },
    { partName: 'Joint3_Elbow',              xMax: -0.63 },
    { partName: 'ForeArm_Segment',           xMax: -0.085 },
    { partName: 'Joint4_Wrist1',             xMax:  0.22 },
    { partName: 'Joint5_Wrist2',             xMax:  0.39 },
    { partName: 'Joint6_Wrist3_ToolFlange',  xMax:  Infinity },
];

// ─── Variables WebXR ──────────────────────────────────────────────────────────

let xrSession       = null;
let xrHitTestSource = null;
let xrRefSpace      = null;
let xrReticle       = null;
let xrController    = null;
let xrRobotPlaced   = false;
let onRobotPlaced   = null;

// En WebXR : 1 unité Three.js = 1 m réel. XR_SCALE = 0.3 → bras ≈ 90 cm.
const XR_SCALE = 0.3;

// ─────────────────────────────────────────────────────────────────────────────
// initViewer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initialise le viewer Three.js.
 * @param {HTMLCanvasElement} canvasEl
 * @param {Array}             parts    - composants (API ou JSON fallback)
 * @param {Function}          clickCb  - fn(part, screenPos) au clic
 */
export function initViewer(canvasEl, parts = [], clickCb = null) {
    if (isInitialized) return;
    isInitialized  = true;
    canvas         = canvasEl;
    partsData      = parts;
    onHotspotClick = clickCb;

    // ── Renderer ──────────────────────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    // Fond bleu nuit très profond
    renderer.setClearColor(0x060b14, 1);
    renderer.xr.enabled = false;

    // ── Scène ─────────────────────────────────────────────────────────────────
    scene     = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x060b14, 0.025);

    // ── Caméra ────────────────────────────────────────────────────────────────
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100);
    camera.position.set(2.5, 1.5, 6);

    // ── Lumières ──────────────────────────────────────────────────────────────
    // Ambiance générale : bleu froid subtil
    scene.add(new THREE.AmbientLight(0x9ab8e8, 0.55));

    // Lumière principale (key light) : blanc légèrement chaud, forte
    const dir = new THREE.DirectionalLight(0xfafcff, 2.0);
    dir.position.set(4, 6, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 30;
    dir.shadow.camera.left = -5;  dir.shadow.camera.right = 5;
    dir.shadow.camera.top  =  5;  dir.shadow.camera.bottom = -5;
    scene.add(dir);

    // Lumière de contre (back/rim) : bleu électrique pour le contour du robot
    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.1);
    rimLight.position.set(-5, 3, -4);
    scene.add(rimLight);

    // Lumière de remplissage (fill) : bleu ciel doux, dessous
    const fillLight = new THREE.PointLight(0x60a5fa, 0.8, 20);
    fillLight.position.set(0, -1, 3);
    scene.add(fillLight);

    // Lumière zénithale : bleu très pâle, pour les reflets du dessus
    const topLight = new THREE.PointLight(0xbfdbfe, 0.5, 18);
    topLight.position.set(0, 8, 0);
    scene.add(topLight);

    // ── Sol + grille ──────────────────────────────────────────────────────────
    gridHelper = new THREE.GridHelper(14, 28, 0x3b82f6, 0x0d1f3c);
    gridHelper.position.y = -2;
    gridHelper.material.opacity = 0.25;
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed   = 0.5;
    controls.zoomSpeed     = 1.2;
    controls.panSpeed      = 0.7;
    controls.minDistance   = 1.5;
    controls.maxDistance   = 14;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.target.set(0, 1.3, 0);
    controls.update();

    // ── Raycaster ─────────────────────────────────────────────────────────────
    raycaster = new THREE.Raycaster();
    mouse     = new THREE.Vector2();

    canvas.addEventListener('click',     _onCanvasClick);
    canvas.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('resize',    _onResize);

    _animate();
}

// ─────────────────────────────────────────────────────────────────────────────
// Chargement du modèle GLB
// ─────────────────────────────────────────────────────────────────────────────

function _onModelLoaded(gltf) {
    robotModel = gltf.scene;

    // Centrer + mettre à l'échelle
    const box    = new THREE.Box3().setFromObject(robotModel);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    robotModel.position.sub(center);

    const scale = 3.0 / Math.max(size.x, size.y, size.z);
    robotModel.scale.setScalar(scale);

    // Ombres + collecte des meshes pour le raycasting
    robotMeshes = [];
    robotModel.traverse(child => {
        if (child.isMesh) {
            child.castShadow    = true;
            child.receiveShadow = true;
            robotMeshes.push(child);
        }
    });

    // Groupe parent : rotation Z = 90° → bras vertical ; Y = 2.1 → base au sol
    robotGroup = new THREE.Group();
    robotGroup.rotation.z = Math.PI / 2;
    robotGroup.position.set(0, 2.1, 0);
    robotGroup.add(robotModel);
    scene.add(robotGroup);
    robotGroup.updateWorldMatrix(true, true);

    camera.position.set(2.5, 1.5, 6);
    controls.target.set(0, 1.3, 0);
    controls.update();
}

// ─────────────────────────────────────────────────────────────────────────────
// Détection de zone → partie du robot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convertit la coordonnée X locale dans robotGroup en nom de partie.
 * Les zones sont définies par PART_ZONES (frontières milieu entre hotspots).
 * @param {number} localX
 * @returns {Object|null} - objet part depuis partsData, ou null
 */
function _getPartFromLocalX(localX) {
    for (const zone of PART_ZONES) {
        if (localX < zone.xMax) {
            return partsData.find(p => p.name === zone.partName) || null;
        }
    }
    return null;
}

/**
 * Trouve la partie du robot ciblée (avec système d'aim-assist / magnétisme).
 * Résout le problème nécessitant de viser ou cliquer au pixel près.
 */
function _getBestTargetPart(raycaster, useTolerance = true) {
    if (!robotGroup || !partsData || !partsData.length) return null;

    const hits = raycaster.intersectObjects(robotMeshes, false);
    const hitPoint = hits.length > 0 ? hits[0].point : null;

    let bestPart = null;
    let minScore = Infinity;

    for (const part of partsData) {
        if (!part.hotspot_position && part.hotspot_x === undefined) continue;
        const hx = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
        const hy = parseFloat(part.hotspot_y ?? part.hotspot_position?.y ?? 0);
        const hz = parseFloat(part.hotspot_z ?? part.hotspot_position?.z ?? 0);
        
        const hotspotLocal = new THREE.Vector3(hx, hy, hz);
        const hotspotWorld = robotGroup.localToWorld(hotspotLocal);

        if (hitPoint) {
            const dist = hitPoint.distanceTo(hotspotWorld);
            if (dist < minScore) {
                minScore = dist;
                bestPart = part;
            }
        } else if (useTolerance) {
            const distToRay = raycaster.ray.distanceToPoint(hotspotWorld);
            const scaledTolerance = 0.35 * robotGroup.scale.x; // Tolérance généreuse adaptée à l'échelle
            
            const dirToHotspot = hotspotWorld.clone().sub(raycaster.ray.origin);
            if (dirToHotspot.dot(raycaster.ray.direction) > 0 && distToRay < scaledTolerance && distToRay < minScore) {
                minScore = distToRay;
                bestPart = part;
            }
        }
    }

    if (hitPoint && minScore > 0.4 * robotGroup.scale.x) {
        const localPoint = robotGroup.worldToLocal(hitPoint.clone());
        bestPart = _getPartFromLocalX(localPoint.x) || bestPart;
    }

    return bestPart;
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlight / sélection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Met en violet tous les meshes de la même zone que localX,
 * et restaure la sélection précédente.
 * Passe localX = null pour tout déselectionner.
 * @param {number|null} localX - position X locale dans robotGroup
 */
function _selectZone(localX) {
    // Restaurer les matériaux originaux
    selectedMeshGroups.forEach(({ mesh, mat }) => { mesh.material = mat; });
    selectedMeshGroups = [];

    if (localX === null || !robotGroup) return;

    // Déterminer la zone (xMin/xMax) correspondant à localX
    let zoneMin = -Infinity, zoneMax = Infinity;
    for (let i = 0; i < PART_ZONES.length; i++) {
        if (localX < PART_ZONES[i].xMax) {
            zoneMax = PART_ZONES[i].xMax;
            zoneMin = i > 0 ? PART_ZONES[i - 1].xMax : -Infinity;
            break;
        }
    }

    // Appliquer le highlight à tous les meshes dont le centre tombe dans cette zone
    robotMeshes.forEach(mesh => {
        const worldCenter = new THREE.Vector3();
        mesh.getWorldPosition(worldCenter);
        const meshLocalX = robotGroup.worldToLocal(worldCenter.clone()).x;

        if (meshLocalX >= zoneMin && meshLocalX < zoneMax) {
            selectedMeshGroups.push({ mesh, mat: mesh.material });
            mesh.material = HIGHLIGHT_MAT;
        }
    });
}

/**
 * Déselectionne tous les meshes et restaure leurs couleurs d'origine.
 * Appelé depuis main.js quand le panneau est fermé.
 */
export function clearMeshSelection() {
    _selectZone(null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactions souris / tactile (viewer 3D)
// ─────────────────────────────────────────────────────────────────────────────

function _onCanvasClick(e) {
    if (xrSession || !robotMeshes.length) return;

    const tooltip = document.getElementById('hover-tooltip');
    if (tooltip) tooltip.classList.remove('visible');

    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const part = _getBestTargetPart(raycaster, true);
    if (!part) return;

    const hx = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
    _selectZone(hx);

    const hy = parseFloat(part.hotspot_y ?? part.hotspot_position?.y ?? 0);
    const hz = parseFloat(part.hotspot_z ?? part.hotspot_position?.z ?? 0);
    const loc = new THREE.Vector3(hx, hy, hz);
    const screenPos = _worldToScreen(robotGroup.localToWorld(loc), camera);
    
    onHotspotClick?.(part, screenPos);
}

function _onMouseMove(e) {
    if (!canvas || xrSession || !robotMeshes.length) return;

    const rect = canvas.getBoundingClientRect();
    mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const part = _getBestTargetPart(raycaster, true);
    canvas.style.cursor = part ? 'pointer' : 'default';

    const tooltip = document.getElementById('hover-tooltip');
    if (part) {
        if (document.getElementById('info-panel')?.classList.contains('active')) {
            if (tooltip) tooltip.classList.remove('visible');
            return;
        }

        if (tooltip) {
            tooltip.textContent = part.name_fr || part.name;
            tooltip.style.left = e.clientX + 'px';
            tooltip.style.top = e.clientY + 'px';
            tooltip.classList.add('visible');
        }
    } else {
        if (tooltip) tooltip.classList.remove('visible');
    }
}

/**
 * Projette une position monde 3D en coordonnées 2D CSS (pixels).
 * @param {THREE.Vector3} worldPos
 * @param {THREE.Camera}  cam
 * @returns {{ x: number, y: number }}
 */
function _worldToScreen(worldPos, cam) {
    const ndc = worldPos.clone().project(cam);
    return {
        x: ( ndc.x * 0.5 + 0.5) * window.innerWidth,
        y: (-ndc.y * 0.5 + 0.5) * window.innerHeight
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation caméra : focus sur une partie du robot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Anime la caméra pour se rapprocher et centrer la partie cliquée.
 * @param {Object} part - objet part avec hotspot_x, hotspot_y, hotspot_z
 */
export function focusOnPart(part) {
    if (!robotGroup || !camera || !controls || xrSession) return;

    // Calculer le centre monde du hotspot de la partie
    const hx = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
    const hy = parseFloat(part.hotspot_y ?? part.hotspot_position?.y ?? 0);
    const hz = parseFloat(part.hotspot_z ?? part.hotspot_position?.z ?? 0);
    const localHotspot = new THREE.Vector3(hx, hy, hz);
    const worldTarget  = robotGroup.localToWorld(localHotspot.clone());

    // Direction caméra → cible, reculer pour un léger zoom
    const camDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const zoomDist = 3.2;  // distance de la caméra au point d'intérêt
    const newCamPos = worldTarget.clone().add(camDir.multiplyScalar(zoomDist));

    // Empêcher la caméra de descendre sous le sol
    newCamPos.y = Math.max(newCamPos.y, worldTarget.y * 0.3 + 0.5);

    // Lancer l'animation smooth
    const startPos    = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration    = 800; // ms
    const startTime   = performance.now();

    // Annuler toute animation précédente
    if (cameraAnim) cameraAnim.cancelled = true;
    const anim = { cancelled: false };
    cameraAnim = anim;

    function step() {
        if (anim.cancelled) return;
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - t, 3);

        camera.position.lerpVectors(startPos, newCamPos, ease);
        controls.target.lerpVectors(startTarget, worldTarget, ease);
        controls.update();

        if (t < 1) requestAnimationFrame(step);
        else cameraAnim = null;
    }
    requestAnimationFrame(step);
}

// ─────────────────────────────────────────────────────────────────────────────
// Boucle de rendu viewer 3D
// ─────────────────────────────────────────────────────────────────────────────

function _animate() {
    animFrameId = requestAnimationFrame(_animate);
    if (controls) controls.update();
    renderer.render(scene, camera);
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
 * Met à jour les données des composants (si elles arrivent après le modèle).
 * @param {Array} parts
 */
export function updateHotspots(parts) {
    partsData = parts;
}

/**
 * Bascule le fond entre mode sombre (viewer 3D) et transparent (AR).
 * @param {boolean} transparent
 */
export function setViewerMode(transparent) {
    if (!renderer) return;
    renderer.setClearColor(0x060b14, transparent ? 0 : 1);
    if (gridHelper)   gridHelper.visible   = !transparent;
    if (floorMeshRef) floorMeshRef.visible = !transparent;
    if (scene)        scene.fog = transparent ? null : new THREE.FogExp2(0x060b14, 0.025);
}

/** Stoppe et nettoie le viewer. */
export function stopViewer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    canvas?.removeEventListener('click',     _onCanvasClick);
    canvas?.removeEventListener('mousemove', _onMouseMove);
    window.removeEventListener('resize', _onResize);
    selectedMeshGroups = [];
    robotMeshes = [];
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = camera = controls = null;
    robotModel = robotGroup = null;
    gridHelper = floorMeshRef = null;
    isInitialized = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// WebXR AR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie si WebXR immersive-ar est supporté.
 * @returns {Promise<boolean>}
 */
export async function isXRSupported() {
    if (!navigator.xr) return false;
    return navigator.xr.isSessionSupported('immersive-ar').catch(() => false);
}

/**
 * Démarre une session WebXR AR.
 * @param {Function} [placedCb] - appelée quand le robot est posé
 */
export async function startXRSession(placedCb = null) {
    if (!renderer) throw new Error('Viewer non initialisé');
    onRobotPlaced = placedCb;

    const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay'],
        domOverlay: { root: document.body }
    });
    xrSession = session;

    // IMPORTANT : forcer 'local' AVANT setSession() pour éviter l'erreur local-floor
    renderer.xr.setReferenceSpaceType('local');
    renderer.xr.enabled = true;
    await renderer.xr.setSession(session);

    xrRefSpace = await session.requestReferenceSpace('local');
    const vwrSpace  = await session.requestReferenceSpace('viewer');
    xrHitTestSource = await session.requestHitTestSource({ space: vwrSpace });

    _createXRReticle();

    xrController = renderer.xr.getController(0);
    xrController.addEventListener('select', _onXRTap);
    scene.add(xrController);

    if (robotGroup)   robotGroup.visible   = false;
    if (gridHelper)   gridHelper.visible   = false;
    if (floorMeshRef) floorMeshRef.visible = false;
    if (scene)        scene.fog            = null;
    if (controls)     controls.enabled     = false;

    xrRobotPlaced = false;
    clearMeshSelection();

    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    renderer.setAnimationLoop(_xrRenderLoop);

    session.addEventListener('end', _onXRSessionEnd);
}

/** Met fin à la session WebXR. */
export function stopXRSession() {
    if (xrSession) xrSession.end();
}

// ── Réticule ─────────────────────────────────────────────────────────────────

function _createXRReticle() {
    if (xrReticle) { scene.remove(xrReticle); xrReticle.geometry?.dispose(); }
    const geo = new THREE.RingGeometry(0.1, 0.15, 32);
    geo.rotateX(-Math.PI / 2);
    xrReticle = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: 0x6366f1, side: THREE.DoubleSide
    }));
    xrReticle.matrixAutoUpdate = false;
    xrReticle.visible = false;
    scene.add(xrReticle);
}

// ── Tap XR ────────────────────────────────────────────────────────────────────

function _onXRTap() {
    if (!xrRobotPlaced) {
        if (xrReticle?.visible) _placeRobotXR();
        return;
    }

    // Si un panneau est ouvert, le tap ferme via DOM — ne pas rouvrir
    if (document.querySelector('#info-panel.active, #chat-panel.active')) return;

    _checkXRHotspotHit();
}

function _placeRobotXR() {
    if (!robotGroup || !xrReticle) return;

    const surfacePos = new THREE.Vector3();
    xrReticle.matrix.decompose(surfacePos, new THREE.Quaternion(), new THREE.Vector3());

    robotGroup.scale.setScalar(XR_SCALE);
    robotGroup.rotation.set(0, 0, Math.PI / 2);
    robotGroup.position.set(surfacePos.x, surfacePos.y + 1.5 * XR_SCALE, surfacePos.z);
    robotGroup.visible = true;
    xrReticle.visible  = false;
    xrRobotPlaced      = true;

    const crosshair = document.getElementById('ar-crosshair');
    if (crosshair) crosshair.style.display = 'block';
    if (onRobotPlaced) onRobotPlaced();
}

/**
 * Détecte la pièce dans la direction de visée de la caméra XR.
 * Raycast contre les meshes réels du robot.
 */
function _checkXRHotspotHit() {
    if (!robotMeshes.length || !robotGroup) return;

    const xrCam  = renderer.xr.getCamera();
    raycaster.setFromCamera({ x: 0, y: 0 }, xrCam); // centre de l'écran

    // Utilise l'aim-assist
    const part = _getBestTargetPart(raycaster, true);
    if (!part || !onHotspotClick) return;

    const hx = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
    _selectZone(hx);

    const screenPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    onHotspotClick(part, screenPos);
}

// ── Boucle XR ─────────────────────────────────────────────────────────────────

function _checkXRHoveredPart() {
    if (!robotMeshes.length || !robotGroup) return;

    const xrCam  = renderer.xr.getCamera();
    raycaster.setFromCamera({ x: 0, y: 0 }, xrCam);

    const part = _getBestTargetPart(raycaster, true);
    const labelEl = document.getElementById('ar-part-label');
    const hintEl = document.querySelector('#ar-crosshair .crosshair-label');

    if (document.querySelector('#info-panel.active, #chat-panel.active')) {
        if (labelEl) labelEl.classList.remove('visible');
        if (hintEl) hintEl.style.display = 'none';
        return;
    }

    if (part) {
        if (labelEl) {
            labelEl.textContent = part.name_fr || part.name;
            labelEl.classList.add('visible');
        }
        if (hintEl) hintEl.style.display = 'none';
    } else {
        if (labelEl) labelEl.classList.remove('visible');
        if (hintEl) hintEl.style.display = 'block';
    }
}

function _xrRenderLoop(timestamp, frame) {
    if (!frame) return;

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

    if (xrRobotPlaced) {
        _checkXRHoveredPart();
    }

    renderer.render(scene, camera);
}

// ── Fin de session ────────────────────────────────────────────────────────────

function _onXRSessionEnd() {
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;

    xrHitTestSource?.cancel?.();
    xrHitTestSource = null;
    if (xrReticle)    { scene.remove(xrReticle);    xrReticle    = null; }
    if (xrController) { scene.remove(xrController); xrController = null; }

    clearMeshSelection();

    if (robotGroup) {
        robotGroup.visible = true;
        robotGroup.scale.setScalar(1);
        robotGroup.position.set(0, 2.1, 0);
        robotGroup.rotation.set(0, 0, Math.PI / 2);
    }

    if (gridHelper)   gridHelper.visible   = true;
    if (floorMeshRef) floorMeshRef.visible = true;
    if (scene)        scene.fog = new THREE.FogExp2(0x0a0a0a, 0.03);
    if (controls)     controls.enabled     = true;

    const crosshair = document.getElementById('ar-crosshair');
    if (crosshair) crosshair.style.display = 'none';
    
    const labelEl = document.getElementById('ar-part-label');
    if (labelEl) labelEl.classList.remove('visible');

    xrSession     = null;
    xrRobotPlaced = false;

    _animate();
}
