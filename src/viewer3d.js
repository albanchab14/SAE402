// viewer3d.js — Viewer 3D Three.js avec hotspots cliquables
// Controles : clic gauche = orbite | molette = zoom | clic droit = panoramique

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let renderer, scene, camera, controls, animFrameId;
let raycaster, mouse;
let hotspotMeshes = [];     // spheres hotspot dans la scene
let robotModel = null;
let robotGroup = null;      // groupe parent : contient robot + hotspots, pivote a 90deg Z
let gridHelper = null;      // grille de sol (masquee en mode AR transparent)
let floorMeshRef = null;    // plan de sol (masque en mode AR transparent)
let partsData = [];         // donnees des composants (depuis API ou JSON)
let canvas = null;
let isInitialized = false;

// --- Session WebXR AR (hit-test surfaces) ---
let xrSession        = null;   // session WebXR active
let xrHitTestSource  = null;   // source de hit-test pour la detection de surface
let xrRefSpace       = null;   // reference space 'local'
let xrReticle        = null;   // reticule (cercle) qui suit la surface detectee
let xrController     = null;   // controlleur XR (gere les taps)
let xrRobotPlaced    = false;  // vrai quand le robot a ete pose sur la surface

// Callback declenche quand un hotspot est clique
let onHotspotClick = null;

/**
 * Initialise le viewer Three.js
 * @param {HTMLCanvasElement} canvasEl
 * @param {Array} parts - donnees des composants depuis l API
 * @param {Function} clickCallback - fn(part) appelee au clic sur un hotspot
 */
export function initViewer(canvasEl, parts = [], clickCallback = null) {
    if (isInitialized) return;
    isInitialized = true;
    canvas = canvasEl;
    partsData = parts;
    onHotspotClick = clickCallback;

    // --- Renderer ---
    // alpha:true obligatoire pour que WebXR AR puisse rendre sur fond camera
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0d0d1a, 1);
    // Indispensable pour WebXR
    renderer.xr.enabled = false; // active seulement pendant la session XR

    // --- Scene ---
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0d0d1a, 0.03);

    // --- Camera ---
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(2.5, 1.5, 4);

    // --- Lumieres ---
    const ambient = new THREE.AmbientLight(0x8899ff, 0.7);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(4, 6, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 30;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    scene.add(dirLight);

    const accentLight = new THREE.DirectionalLight(0x6366f1, 0.5);
    accentLight.position.set(-4, 2, -3);
    scene.add(accentLight);

    const topLight = new THREE.PointLight(0xa855f7, 0.7, 15);
    topLight.position.set(0, 5, 0);
    scene.add(topLight);

    // --- Sol + grille (masques en mode AR transparent) ---
    gridHelper = new THREE.GridHelper(12, 24, 0x6366f1, 0x1a1a3a);
    gridHelper.position.y = -2;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);

    floorMeshRef = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floorMeshRef.rotation.x = -Math.PI / 2;
    floorMeshRef.position.y = -2;
    floorMeshRef.receiveShadow = true;
    scene.add(floorMeshRef);

    // --- Chargement GLB ---
    const loader = new GLTFLoader();
    loader.load(
        '/models/UR5e.glb',
        (gltf) => onModelLoaded(gltf),
        null,
        (err) => console.error('[Viewer] Erreur GLB :', err)
    );

    // --- OrbitControls ---
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.7;
    controls.minDistance = 1;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.target.set(0, 0, 0);
    controls.update();

    // --- Raycaster pour les clics ---
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // --- Evenements ---
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize);

    // --- Boucle de rendu ---
    animate();
}

// -------------------------------------------------------
// Callback quand le modele GLB est charge
// -------------------------------------------------------
function onModelLoaded(gltf) {
    robotModel = gltf.scene;

    // Centrer le modele sur son bounding box
    const box = new THREE.Box3().setFromObject(robotModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    robotModel.position.sub(center);

    // Scaler pour que la plus grande dimension = 3 unites
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 3.0 / maxDim;
    robotModel.scale.setScalar(scale);

    // Ombres sur tous les meshes
    robotModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    // Groupe parent qui contient le robot ET les hotspots.
    // Rotation Z +90deg : l axe X du GLB (bras horizontal) devient l axe Y (bras vertical).
    // Position Y +2.1 : remonte le groupe pour que la base repose a y=0 (base du bras a x=-2.1
    // dans l espace local, apres rotation z+90 elle se retrouve a y=-2.1, +2.1 => y=0).
    robotGroup = new THREE.Group();
    robotGroup.rotation.z = Math.PI / 2;
    robotGroup.position.set(0, 2.1, 0);
    robotGroup.add(robotModel);
    scene.add(robotGroup);

    // Camera positionnee pour voir le robot debout : centre vers y=1.3 (mi-hauteur du bras)
    camera.position.set(2.5, 1.5, 6);
    controls.target.set(0, 1.3, 0);
    controls.minDistance = 1.5;
    controls.maxDistance = 14;
    controls.update();

    // Creer les hotspots avec les donnees deja disponibles
    if (partsData.length > 0) {
        createHotspots(partsData, scale, center);
    }
}

// -------------------------------------------------------
// Creation des hotspots 3D sur le modele
// -------------------------------------------------------
function createHotspots(parts, modelScale = 1, modelOffset = new THREE.Vector3()) {
    // Supprimer anciens hotspots du groupe (ils pivotent avec le robot)
    hotspotMeshes.forEach(h => {
        if (robotGroup) robotGroup.remove(h);
        else scene.remove(h);
    });
    hotspotMeshes = [];

    parts.forEach((part) => {
        const px = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
        const py = parseFloat(part.hotspot_y ?? part.hotspot_position?.y ?? 0);
        const pz = parseFloat(part.hotspot_z ?? part.hotspot_position?.z ?? 0);

        // Geometrie sphere hotspot
        const geo = new THREE.SphereGeometry(0.08, 16, 16);

        // Materiau glow violet
        const mat = new THREE.MeshStandardMaterial({
            color: 0x6366f1,
            emissive: 0x6366f1,
            emissiveIntensity: 0.8,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.9
        });

        const sphere = new THREE.Mesh(geo, mat);
        sphere.position.set(px, py, pz);
        sphere.userData = { part, isHotspot: true };

        // Anneau de pulsation autour du hotspot
        const ringGeo = new THREE.RingGeometry(0.1, 0.13, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xa855f7,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.userData = { isRing: true, initialScale: 1 };
        sphere.add(ring);

        // Label texte au-dessus du hotspot
        const label = createTextLabel(part.name_fr || part.name);
        label.position.set(0, 0.18, 0);
        sphere.add(label);

        // Ajout au groupe : les hotspots heritent de la rotation du groupe
        // => ils restent sur les bonnes parties quelle que soit l orientation du robot
        if (robotGroup) robotGroup.add(sphere);
        else scene.add(sphere);
        hotspotMeshes.push(sphere);
    });
}

// -------------------------------------------------------
// Creer un sprite texte pour le label du hotspot
// -------------------------------------------------------
function createTextLabel(text) {
    const canvas2d = document.createElement('canvas');
    canvas2d.width = 256;
    canvas2d.height = 64;
    const ctx = canvas2d.getContext('2d');

    // Fond semi-transparent
    ctx.fillStyle = 'rgba(13, 13, 26, 0.75)';
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();

    // Texte
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas2d);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.0 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.6, 0.15, 1);
    sprite.userData = { isLabel: true };
    return sprite;
}

// -------------------------------------------------------
// Gestion du clic sur le canvas
// -------------------------------------------------------
function onCanvasClick(event) {
    // Calculer position souris normalisee [-1, 1]
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // Tester intersection avec les hotspots
    const hits = raycaster.intersectObjects(hotspotMeshes, false);

    if (hits.length > 0) {
        const clickedHotspot = hits[0].object;
        const part = clickedHotspot.userData.part;

        if (part && onHotspotClick) {
            // Animation flash sur le hotspot clique
            flashHotspot(clickedHotspot);
            onHotspotClick(part);
        }
    }
}

// -------------------------------------------------------
// Hover : changer couleur au survol
// -------------------------------------------------------
let hoveredHotspot = null;

function onMouseMove(event) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(hotspotMeshes, false);

    // Reset precedent hover
    if (hoveredHotspot && (!hits.length || hits[0].object !== hoveredHotspot)) {
        hoveredHotspot.material.emissive.setHex(0x6366f1);
        hoveredHotspot.material.emissiveIntensity = 0.8;
        hoveredHotspot.scale.setScalar(1);
        // Masquer label
        hoveredHotspot.children.forEach(c => {
            if (c.userData.isLabel) c.material.opacity = 0;
        });
        hoveredHotspot = null;
        canvas.style.cursor = 'default';
    }

    if (hits.length > 0) {
        const h = hits[0].object;
        if (h !== hoveredHotspot) {
            hoveredHotspot = h;
            h.material.emissive.setHex(0xa855f7);
            h.material.emissiveIntensity = 1.2;
            h.scale.setScalar(1.3);
            // Afficher label
            h.children.forEach(c => {
                if (c.userData.isLabel) c.material.opacity = 1;
            });
            canvas.style.cursor = 'pointer';
        }
    }
}

// -------------------------------------------------------
// Animation flash quand on clique un hotspot
// -------------------------------------------------------
function flashHotspot(hotspot) {
    let t = 0;
    const flash = setInterval(() => {
        t++;
        hotspot.material.emissiveIntensity = t % 2 === 0 ? 2.0 : 0.5;
        if (t >= 6) {
            clearInterval(flash);
            hotspot.material.emissiveIntensity = 0.8;
        }
    }, 80);
}

// -------------------------------------------------------
// Boucle de rendu + animation des hotspots
// -------------------------------------------------------
function animate() {
    animFrameId = requestAnimationFrame(animate);
    // OrbitControls : actifs seulement en mode viewer 3D classique
    if (controls && !isARMode) controls.update();

    // Animation des hotspots : pulsation + rotation anneau
    const t = performance.now() * 0.001;
    hotspotMeshes.forEach((h, i) => {
        // Pulsation scale
        const pulse = 1 + Math.sin(t * 2 + i * 0.8) * 0.08;
        if (h !== hoveredHotspot) h.scale.setScalar(pulse);

        // Rotation de l anneau
        h.children.forEach(c => {
            if (c.userData.isRing) {
                c.rotation.z += 0.015;
                c.material.opacity = 0.4 + Math.sin(t * 3 + i) * 0.2;
            }
            // Billboard : le label fait toujours face a la camera
            if (c.userData.isLabel) {
                c.quaternion.copy(camera.quaternion);
            }
        });
    });

    renderer.render(scene, camera);
}

// -------------------------------------------------------
// Resize
// -------------------------------------------------------
function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// -------------------------------------------------------
// Mettre a jour les hotspots apres chargement des donnees
// -------------------------------------------------------
export function updateHotspots(parts) {
    partsData = parts;
    if (scene) createHotspots(parts);
}

// -------------------------------------------------------
// Controles AR : orbit autour du robot via gyroscope (mobile)
// ou drag souris/tactile (desktop). Le robot reste fixe dans
// l espace ; la camera tourne autour de lui.
// -------------------------------------------------------

/**
 * Active ou desactive les controles AR premiere personne.
 *
 * Mode AR (enabled=true) :
 *   - OrbitControls desactive
 *   - Camera placee devant le robot, regardant vers lui
 *   - Gyroscope → la camera pivote (le robot reste fixe dans le monde)
 *   - Drag 1 doigt/souris → rotation fallback (si pas de gyroscope)
 *   - Pinch 2 doigts / molette → zoom (simule "s approcher")
 *
 * Mode Viewer 3D (enabled=false) :
 *   - OrbitControls reactives
 *
 * @param {boolean} enabled
 */
export function setARControls(enabled) {
    isARMode = enabled;
    if (!camera || !controls) return;

    if (enabled) {
        controls.enabled = false;

        // Placer la camera face au robot (3 unites devant lui)
        camera.position.copy(AR_CAM_START);
        camera.lookAt(AR_WORLD_TARGET);

        // Sauvegarder l orientation initiale de la camera (regardant le robot)
        _arCamQInit.copy(camera.quaternion);
        arInitAlpha = null; // sera capture au premier event gyroscope
        arInitBeta  = null;

        // Gyroscope
        _bindDeviceOrientation();

        // Drag + pinch (pointer events)
        if (canvas) {
            canvas.addEventListener('pointerdown', _onARPointerDown);
            canvas.addEventListener('pointermove', _onARPointerMove);
            canvas.addEventListener('pointerup',   _onARPointerUp);
            canvas.addEventListener('wheel',       _onARWheel, { passive: true });
            canvas.addEventListener('touchstart',  _onARTouchStart, { passive: true });
            canvas.addEventListener('touchmove',   _onARTouchMove,  { passive: true });
            canvas.addEventListener('touchend',    _onARTouchEnd,   { passive: true });
        }

    } else {
        controls.enabled = true;
        camera.position.set(2.5, 1.5, 6);
        controls.target.copy(AR_WORLD_TARGET);
        controls.update();

        _unbindDeviceOrientation();

        if (canvas) {
            canvas.removeEventListener('pointerdown', _onARPointerDown);
            canvas.removeEventListener('pointermove', _onARPointerMove);
            canvas.removeEventListener('pointerup',   _onARPointerUp);
            canvas.removeEventListener('wheel',       _onARWheel);
            canvas.removeEventListener('touchstart',  _onARTouchStart);
            canvas.removeEventListener('touchmove',   _onARTouchMove);
            canvas.removeEventListener('touchend',    _onARTouchEnd);
        }
    }
}

// ---- Gyroscope ----

/** Lie deviceorientation ; demande la permission iOS 13+ si necessaire. */
function _bindDeviceOrientation() {
    if (deviceOrientationBound) return;
    const bind = () => {
        window.addEventListener('deviceorientation', _onDeviceOrientation);
        deviceOrientationBound = true;
    };
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
            .then(r => { if (r === 'granted') bind(); })
            .catch(() => {});
    } else {
        bind();
    }
}
function _unbindDeviceOrientation() {
    if (!deviceOrientationBound) return;
    window.removeEventListener('deviceorientation', _onDeviceOrientation);
    deviceOrientationBound = false;
}

// Reusables quaternion/euler pour eviter les allocations dans la boucle d events
const _arEulerDelta = new THREE.Euler();
const _arQDelta     = new THREE.Quaternion();

/**
 * Gyroscope → rotation camera premiere personne.
 * alpha = cap boussole (0-360), beta = inclinaison av/arr (-180..180).
 * Le delta par rapport a la position de reference fait pivoter la camera
 * exactement comme si le telephone etait la camera — le robot reste fixe.
 */
function _onDeviceOrientation(e) {
    if (!isARMode || !camera) return;

    const alpha = e.alpha ?? 0;
    const beta  = e.beta  ?? 0;

    // Premier event : capture la reference (position "neutre" du telephone)
    if (arInitAlpha === null) {
        arInitAlpha = alpha;
        arInitBeta  = beta;
        return;
    }

    // Delta cap horizontal (avec correction du wrap 0/360)
    let dAlpha = alpha - arInitAlpha;
    if (dAlpha >  180) dAlpha -= 360;
    if (dAlpha < -180) dAlpha += 360;

    const dBeta = beta - arInitBeta;

    // Construire la rotation delta (yaw puis pitch, ordre YXZ)
    _arEulerDelta.set(
        THREE.MathUtils.degToRad(-dBeta),   // inclinaison → pitch camera
        THREE.MathUtils.degToRad(-dAlpha),  // cap         → yaw camera
        0,
        'YXZ'
    );
    _arQDelta.setFromEuler(_arEulerDelta);

    // Appliquer au quaternion initial (robot reste a AR_WORLD_TARGET)
    camera.quaternion.multiplyQuaternions(_arQDelta, _arCamQInit);
}

// ---- Drag 1 doigt / souris (fallback ou desktop) ----
// Meme principe : fait pivoter la camera en premiere personne.
const _arDragEuler = new THREE.Euler();
const _arDragQ     = new THREE.Quaternion();
let   _arDragDeltaX = 0, _arDragDeltaY = 0; // accumulation des deltas drag

function _onARPointerDown(e) {
    if (e.pointerType === 'touch' && e.isPrimary === false) return; // ignore 2e doigt
    arPointerActive = true;
    arPointerLast = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
}
function _onARPointerMove(e) {
    if (!arPointerActive || !isARMode) return;
    if (e.pointerType === 'touch' && e.isPrimary === false) return;

    _arDragDeltaX += (e.clientX - arPointerLast.x) * 0.25; // deg
    _arDragDeltaY += (e.clientY - arPointerLast.y) * 0.25;
    arPointerLast = { x: e.clientX, y: e.clientY };

    _arDragEuler.set(
        THREE.MathUtils.degToRad(-_arDragDeltaY),
        THREE.MathUtils.degToRad(-_arDragDeltaX),
        0, 'YXZ'
    );
    _arDragQ.setFromEuler(_arDragEuler);
    camera.quaternion.multiplyQuaternions(_arDragQ, _arCamQInit);
}
function _onARPointerUp(e) {
    if (!arPointerActive) return;
    arPointerActive = false;
    // Apres un drag, mettre a jour la reference pour que le prochain drag parte de la
    // bonne position (evite le "saut" si on drag puis on laisse puis on redrag)
    _arCamQInit.copy(camera.quaternion);
    _arDragDeltaX = 0;
    _arDragDeltaY = 0;
    // Reimposer la reference gyroscope pour aligner avec la nouvelle orientation
    arInitAlpha = null;
    arInitBeta  = null;
}

// ---- Zoom (simule "s approcher du robot") ----
// Deplace la camera le long de son axe de regard.
const _arLookDir = new THREE.Vector3();
const AR_ZOOM_MIN = 0.5;  // distance min camera→robot
const AR_ZOOM_MAX = 8;    // distance max

function _arZoom(delta) {
    if (!camera) return;
    camera.getWorldDirection(_arLookDir);
    camera.position.addScaledVector(_arLookDir, delta);
    // Empecher de traverser le robot
    const dist = camera.position.distanceTo(AR_WORLD_TARGET);
    if (dist < AR_ZOOM_MIN) camera.position.addScaledVector(_arLookDir, -(AR_ZOOM_MIN - dist));
    if (dist > AR_ZOOM_MAX) camera.position.addScaledVector(_arLookDir,  (dist - AR_ZOOM_MAX));
}

function _onARWheel(e) {
    if (!isARMode) return;
    _arZoom(e.deltaY * -0.004);
}

let _arPinchDist0 = null;
function _onARTouchStart(e) {
    if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _arPinchDist0 = Math.sqrt(dx * dx + dy * dy);
    }
}
function _onARTouchMove(e) {
    if (!isARMode || e.touches.length !== 2 || _arPinchDist0 === null) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    _arZoom((dist - _arPinchDist0) * 0.008);
    _arPinchDist0 = dist;
}
function _onARTouchEnd(e) {
    if (e.touches.length < 2) _arPinchDist0 = null;
}

// -------------------------------------------------------
// Basculer entre mode AR (fond transparent) et viewer 3D (fond sombre)
// Appelable apres initViewer sans reinitialisation.
// -------------------------------------------------------

/**
 * Change le fond du renderer.
 * @param {boolean} transparent - true = fond transparent (mode AR), false = fond sombre (viewer 3D)
 */
export function setViewerMode(transparent) {
    if (!renderer) return;
    renderer.setClearColor(0x0d0d1a, transparent ? 0 : 1);
    if (gridHelper)   gridHelper.visible   = !transparent;
    if (floorMeshRef) floorMeshRef.visible = !transparent;
    if (scene)        scene.fog = transparent ? null : new THREE.FogExp2(0x0d0d1a, 0.03);
}

// -------------------------------------------------------
// Stopper le viewer proprement
// -------------------------------------------------------
export function stopViewer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    // Nettoyer les controles AR
    _unbindDeviceOrientation();
    isARMode = false;
    if (canvas) {
        canvas.removeEventListener('pointerdown', _onARPointerDown);
        canvas.removeEventListener('pointermove', _onARPointerMove);
        canvas.removeEventListener('pointerup',   _onARPointerUp);
        canvas.removeEventListener('click', onCanvasClick);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.style.cursor = 'default';
    }
    window.removeEventListener('resize', onResize);
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null; controls = null;
    hotspotMeshes = []; robotModel = null; robotGroup = null;
    gridHelper = null; floorMeshRef = null;
    isInitialized = false;
}
