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
camera.setLocalPosition(0, 2, 6);
camera.lookAt(0, 0, 0);
root.addChild(camera);

// 2. Lights
const light = new pc.Entity('light');
light.addComponent('light', { type: 'directional', color: new pc.Color(1, 1, 1), castShadows: true });
light.setLocalEulerAngles(45, 30, 0);
root.addChild(light);

app.scene.ambientLight = new pc.Color(0.1, 0.1, 0.15);

// 3. Main Scanned Object (A Torus Knot as a placeholder for a complex part)
const mainObject = new pc.Entity('scannedObject');
mainObject.addComponent('model', { type: 'torus' });
mainObject.setLocalScale(1.5, 1.5, 1.5);

const scanMaterial = new pc.StandardMaterial();
scanMaterial.diffuse = new pc.Color(0.2, 0.2, 0.3);
scanMaterial.emissive = new pc.Color(0.1, 0.1, 0.2);
scanMaterial.specular = new pc.Color(1, 1, 1);
scanMaterial.shininess = 80;
scanMaterial.useLighting = true;
scanMaterial.update();
mainObject.model.meshInstances[0].material = scanMaterial;

root.addChild(mainObject);

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

const picker = new pc.Picker(app.graphicsDevice, 1024, 1024);

window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;

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
    mainObject.rotate(0, 5 * dt, 0);
    
    // Make hotspots pulsate
    const s = 1 + Math.sin(app.time * 4) * 0.1;
    hotspotsEntities.forEach(pin => {
        pin.setLocalScale(0.2 * s, 0.2 * s, 0.2 * s);
    });
});

// --- START ---
app.start();
loadHotspots();
