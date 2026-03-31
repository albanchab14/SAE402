// viewer3d.js — Viewer 3D Three.js avec hotspots cliquables
// Controles : clic gauche = orbite | molette = zoom | clic droit = panoramique

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let renderer, scene, camera, controls, animFrameId;
let raycaster, mouse;
let hotspotMeshes = [];     // spheres hotspot dans la scene
let robotModel = null;
let partsData = [];         // donnees des composants (depuis API ou JSON)
let canvas = null;
let isInitialized = false;

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
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0d0d1a, 1);

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

    // --- Sol + grille ---
    const grid = new THREE.GridHelper(12, 24, 0x6366f1, 0x1a1a3a);
    grid.position.y = -2;
    grid.material.opacity = 0.2;
    grid.material.transparent = true;
    scene.add(grid);

    const floorMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 12),
        new THREE.ShadowMaterial({ opacity: 0.2 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

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

    scene.add(robotModel);

    // Ajuster camera apres chargement
    camera.position.set(2.5, 1.5, 5);
    controls.target.set(0, 0, 0);
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
    // Supprimer anciens hotspots
    hotspotMeshes.forEach(h => scene.remove(h));
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

        scene.add(sphere);
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
    controls.update();

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
// Stopper le viewer proprement
// -------------------------------------------------------
export function stopViewer() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (canvas) {
        canvas.removeEventListener('click', onCanvasClick);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.style.cursor = 'default';
    }
    window.removeEventListener('resize', onResize);
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null; camera = null; controls = null;
    hotspotMeshes = []; robotModel = null;
    isInitialized = false;
}
