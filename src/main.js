import * as pc from 'playcanvas';

// --- CONFIGURATION ---
const API_URL = '/api/api.php';

// --- APPLICATION INITIALIZATION ---
const canvas = document.getElementById('application-canvas');
const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    graphicsDeviceOptions: { antialias: true }
});

app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

window.addEventListener('resize', () => app.resizeCanvas());

// --- SCENE SETUP ---
const root = app.root;

// 1. Camera
const camera = new pc.Entity('camera');
camera.addComponent('camera', {
    clearColor: new pc.Color(0.05, 0.05, 0.08)
});
camera.setLocalPosition(0, 0, 15);
camera.lookAt(0, 0, 0);
root.addChild(camera);

// 2. Lights
const light = new pc.Entity('light');
light.addComponent('light', { type: 'directional', color: new pc.Color(1, 1, 1), castShadows: true });
light.setLocalEulerAngles(45, 30, 0);
root.addChild(light);

app.scene.ambientLight = new pc.Color(0.2, 0.2, 0.25);

// --- ASSET LOADING (UR5e.glb) ---
const loaderBar = document.getElementById('loader-bar');
const modelLoader = document.getElementById('model-loader');

let mainObject = null;

// Use GLB loader to handle the .glb file
app.assets.loadFromUrl('assets/UR5e.glb', 'container', (err, asset) => {
    if (err) {
        console.error('Error loading UR5e.glb:', err);
        return;
    }

    // Hide loader
    modelLoader.style.display = 'none';

    // Create entity from the loaded GLB container
    mainObject = new pc.Entity('UR5e');
    mainObject.addComponent('model', {
        type: 'asset',
        asset: asset.resource.model
    });

    // UR5e models can be huge or tiny depending on export. 
    // We'll normalize scale to fit the view.
    mainObject.setLocalScale(5, 5, 5); 
    mainObject.setLocalPosition(0, 0, 0); // Reset to origin to find the center
    
    root.addChild(mainObject);
});

// Helper for UI progress (simulated for immediate local loading)
let progress = 0;
const interval = setInterval(() => {
    progress += 10;
    if (loaderBar) loaderBar.style.width = progress + '%';
    if (progress >= 100) clearInterval(interval);
}, 50);

// --- HOTSPOTS LOGIC ---

const DB_STATUS_TEXT = document.getElementById('db-status-text');
const INFO_TAB = document.getElementById('info-tab');
const TAB_TITLE = document.getElementById('tab-title');
const TAB_BODY = document.getElementById('tab-body');

let hotspotsEntities = [];

function createHotspot(data) {
    const pin = new pc.Entity(`hotspot-${data.id}`);
    pin.addComponent('model', { type: 'sphere' });
    pin.setLocalScale(0.2, 0.2, 0.2);
    pin.setLocalPosition(parseFloat(data.pos_x), parseFloat(data.pos_y), parseFloat(data.pos_z));

    const pinMat = new pc.StandardMaterial();
    pinMat.diffuse = new pc.Color(0.3, 0.5, 1);
    pinMat.emissive = new pc.Color(0.2, 0.4, 1);
    pinMat.opacity = 0.8;
    pinMat.blendType = pc.BLEND_NORMAL;
    pinMat.update();
    pin.model.meshInstances[0].material = pinMat;

    // Store data in the entity for easy access
    pin.hotspotData = data;
    
    root.addChild(pin);
    hotspotsEntities.push(pin);
}

function loadHotspots() {
    fetch(`${API_URL}?action=get_hotspots`)
        .then(res => res.json())
        .then(data => {
            if (Array.isArray(data)) {
                data.forEach(createHotspot);
                DB_STATUS_TEXT.innerText = 'Connected';
                DB_STATUS_TEXT.className = 'status-badge db-status';
            }
        })
        .catch(err => {
            console.error('Failed to load hotspots:', err);
            DB_STATUS_TEXT.innerText = 'Database Offline';
            DB_STATUS_TEXT.style.color = '#ef4444';
        });
}

function showHotspotInfo(data) {
    TAB_TITLE.innerText = data.name;
    TAB_BODY.innerText = data.description;
    INFO_TAB.classList.add('active');
    
    // Log interaction to DB
    fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_interaction', object: `hotspot_${data.id}` })
    });
}

// --- INTERACTION ---

let picker = null;

window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

    if (!picker && app.graphicsDevice) {
        picker = new pc.Picker(app, canvas.clientWidth, canvas.clientHeight);
    }

    // Pick from camera
    const x = e.clientX;
    const y = e.clientY;
    
    // Simple raycast against hotspots
    const from = camera.camera.screenToWorld(x, y, camera.camera.nearClip);
    const to = camera.camera.screenToWorld(x, y, camera.camera.farClip);
    
    const result = app.systems.rigidbody ? app.systems.rigidbody.raycastFirst(from, to) : null;
    
    // Fallback: check distance to hotspots (since we aren't using physics/collision components)
    let closest = null;
    let minDist = 0.5; // Threshold for clicking a small pin

    hotspotsEntities.forEach(pin => {
        const pinPos = pin.getPosition();
        const dist = distToSegment(pinPos, from, to);
        if (dist < minDist) {
            minDist = dist;
            closest = pin;
        }
    });

    if (closest) {
        showHotspotInfo(closest.hotspotData);
    }
});

// Helper for distance between point and ray
function distToSegment(p, v, w) {
    const l2 = v.distanceSq(w);
    if (l2 === 0) return p.distance(v);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y) + (p.z - v.z) * (w.z - v.z)) / l2;
    t = Math.max(0, Math.min(1, t));
    const prog = new pc.Vec3().copy(w).sub(v).scale(t).add(v);
    return p.distance(prog);
}

app.on('update', (dt) => {
    if (mainObject) {
        mainObject.rotate(0, 5 * dt, 0);
    }
    
    // Make hotspots pulsate
    const s = 1 + Math.sin(app.time * 4) * 0.1;
    hotspotsEntities.forEach(pin => {
        pin.setLocalScale(0.2 * s, 0.2 * s, 0.2 * s);
    });
});

// --- START ---
app.start();
loadHotspots();
