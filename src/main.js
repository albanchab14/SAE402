import * as pc from 'playcanvas';
import { OrbitCamera } from './robot/orbit-camera.js';
import { RobotLoader } from './robot/robot-loader.js';
import { HotspotManager } from './robot/hotspot-manager.js';
import { InfoPanel } from './ui/info-panel.js';
import { ChatPanel } from './ui/chat-panel.js';
import { LoadingScreen } from './ui/loading-screen.js';
import { fetchParts, logInteraction } from './api/api-client.js';
import fallbackParts from './data/robot-parts.json';

// --- APP INIT ---
const canvas = document.getElementById('application-canvas');
const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    graphicsDeviceOptions: { antialias: true, alpha: true }
});

app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

// --- LOADING SCREEN ---
const loading = new LoadingScreen();
loading.setProgress(10, 'Initialisation...');

// --- SCENE ---
const camera = new pc.Entity('camera');
camera.addComponent('camera', {
    clearColor: new pc.Color(0.06, 0.06, 0.1),
    fov: 45,
    nearClip: 0.01,
    farClip: 100
});
camera.setLocalPosition(0, 1.5, 4);
camera.lookAt(0, 0.5, 0);
app.root.addChild(camera);

// Lights
const dirLight = new pc.Entity('dir-light');
dirLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(1, 0.98, 0.95),
    castShadows: true,
    shadowBias: 0.05,
    normalOffsetBias: 0.05,
    intensity: 1.2
});
dirLight.setLocalEulerAngles(50, 30, 0);
app.root.addChild(dirLight);

const fillLight = new pc.Entity('fill-light');
fillLight.addComponent('light', {
    type: 'directional',
    color: new pc.Color(0.6, 0.7, 1),
    intensity: 0.4
});
fillLight.setLocalEulerAngles(-30, -120, 0);
app.root.addChild(fillLight);

app.scene.ambientLight = new pc.Color(0.12, 0.12, 0.18);

// Ground plane
const ground = new pc.Entity('ground');
ground.addComponent('render', { type: 'plane' });
ground.setLocalScale(10, 1, 10);
ground.setLocalPosition(0, -0.01, 0);
const groundMat = new pc.StandardMaterial();
groundMat.diffuse = new pc.Color(0.08, 0.08, 0.12);
groundMat.specular = new pc.Color(0.1, 0.1, 0.15);
groundMat.shininess = 60;
groundMat.update();
ground.render.meshInstances[0].material = groundMat;
app.root.addChild(ground);

// --- ORBIT CAMERA ---
const orbit = new OrbitCamera(camera, app);

// --- UI PANELS ---
const infoPanel = new InfoPanel();
const chatPanel = new ChatPanel();

// Link info panel AI button to chat
infoPanel.onAskAI = (partId) => {
    chatPanel.show(partId);
};

// --- START ---
app.start();
loading.setProgress(30, 'Chargement du modele 3D...');

// --- LOAD ROBOT ---
const robotLoader = new RobotLoader(app);

async function init() {
    let partsData;

    // Load parts from API or fallback
    try {
        partsData = await fetchParts();
        if (!Array.isArray(partsData) || partsData.length === 0) {
            throw new Error('Empty parts data');
        }
        loading.setProgress(40, 'Donnees techniques chargees');
    } catch (e) {
        console.warn('[MARA] API unavailable, using fallback data');
        partsData = fallbackParts.parts.map(p => ({
            ...p,
            hotspot_x: p.hotspot.x,
            hotspot_y: p.hotspot.y,
            hotspot_z: p.hotspot.z
        }));
        loading.setProgress(40, 'Donnees locales chargees');
    }

    // Load 3D model
    try {
        await robotLoader.load('/models/UR5e.glb');
        loading.setProgress(80, 'Modele 3D charge');
        console.log('[MARA] Available meshes:', robotLoader.getAllMeshNames());
    } catch (e) {
        console.warn('[MARA] GLB not found, creating placeholder');
        createPlaceholder();
        loading.setProgress(80, 'Mode demonstration');
    }

    // Create hotspots
    const hotspotMgr = new HotspotManager(app, camera);
    hotspotMgr.createHotspots(partsData);
    hotspotMgr.onSelect = (partData) => {
        infoPanel.show(partData);
        chatPanel.setPartContext(partData.id);
        logInteraction('hotspot_click', partData.id, { name: partData.name });
    };

    // Update loop
    app.on('update', (dt) => {
        hotspotMgr.update(dt);
    });

    loading.setProgress(100, 'Pret !');
    setTimeout(() => loading.hide(), 500);

    // Update status
    const statusEl = document.getElementById('db-status-text');
    if (statusEl) {
        statusEl.textContent = 'Connecte';
        statusEl.style.color = '#10b981';
    }
}

function createPlaceholder() {
    // Create a simple robot-like placeholder from primitives
    const base = new pc.Entity('placeholder-base');
    base.addComponent('render', { type: 'cylinder' });
    base.setLocalScale(0.4, 0.08, 0.4);
    base.setLocalPosition(0, 0.04, 0);
    applyMaterial(base, 0.15, 0.15, 0.2);
    app.root.addChild(base);

    const segments = [
        { y: 0.25, h: 0.4, w: 0.12 },
        { y: 0.6, h: 0.5, w: 0.1 },
        { y: 1.0, h: 0.3, w: 0.09 },
        { y: 1.25, h: 0.15, w: 0.08 },
        { y: 1.4, h: 0.1, w: 0.07 }
    ];

    segments.forEach((seg, i) => {
        const part = new pc.Entity(`placeholder-seg-${i}`);
        part.addComponent('render', { type: 'cylinder' });
        part.setLocalScale(seg.w, seg.h, seg.w);
        part.setLocalPosition(0, seg.y, 0);
        applyMaterial(part, 0.12 + i * 0.02, 0.12 + i * 0.02, 0.18 + i * 0.02);
        app.root.addChild(part);
    });
}

function applyMaterial(entity, r, g, b) {
    const mat = new pc.StandardMaterial();
    mat.diffuse = new pc.Color(r, g, b);
    mat.specular = new pc.Color(0.3, 0.3, 0.4);
    mat.shininess = 60;
    mat.update();
    entity.render.meshInstances[0].material = mat;
}

init().catch(err => {
    console.error('[MARA] Init error:', err);
    loading.setProgress(100, 'Erreur de chargement');
    loading.hide();
});
