import * as pc from 'playcanvas';

// Manages interactive hotspot spheres on the robot
export class HotspotManager {
    constructor(app, camera) {
        this.app = app;
        this.camera = camera;
        this.hotspots = []; // { entity, data }
        this.selectedHotspot = null;
        this.onSelect = null; // callback(partData)

        this._bindInput();
    }

    createHotspots(partsData) {
        partsData.forEach(part => {
            const x = parseFloat(part.hotspot_x || part.hotspot?.x || 0);
            const y = parseFloat(part.hotspot_y || part.hotspot?.y || 0);
            const z = parseFloat(part.hotspot_z || part.hotspot?.z || 0);

            const pin = new pc.Entity(`hotspot-${part.id}`);
            pin.addComponent('render', { type: 'sphere' });
            pin.setLocalScale(0.06, 0.06, 0.06);
            pin.setLocalPosition(x, y, z);

            const mat = new pc.StandardMaterial();
            mat.diffuse = new pc.Color(0.39, 0.4, 0.95);
            mat.emissive = new pc.Color(0.2, 0.25, 0.9);
            mat.opacity = 0.85;
            mat.blendType = pc.BLEND_NORMAL;
            mat.update();
            pin.render.meshInstances[0].material = mat;

            pin._partData = part;
            pin._baseMaterial = mat;

            this.app.root.addChild(pin);
            this.hotspots.push({ entity: pin, data: part });
        });
    }

    _bindInput() {
        const canvas = this.app.graphicsDevice.canvas;

        const handleClick = (screenX, screenY) => {
            const cam = this.camera.camera;
            const from = cam.screenToWorld(screenX, screenY, cam.nearClip);
            const to = cam.screenToWorld(screenX, screenY, cam.farClip);

            let closest = null;
            let minDist = 0.15; // click threshold

            this.hotspots.forEach(({ entity }) => {
                const pos = entity.getPosition();
                const dist = this._distPointToRay(pos, from, to);
                if (dist < minDist) {
                    minDist = dist;
                    closest = entity;
                }
            });

            if (closest) {
                this._selectHotspot(closest);
            }
        };

        canvas.addEventListener('click', (e) => {
            handleClick(e.clientX, e.clientY);
        });

        canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length === 1) {
                const t = e.changedTouches[0];
                handleClick(t.clientX, t.clientY);
            }
        });
    }

    _selectHotspot(entity) {
        // Deselect previous
        if (this.selectedHotspot) {
            const prevMat = this.selectedHotspot._baseMaterial;
            prevMat.emissive = new pc.Color(0.2, 0.25, 0.9);
            prevMat.update();
        }

        this.selectedHotspot = entity;
        const mat = entity._baseMaterial;
        mat.emissive = new pc.Color(0.9, 0.4, 0.1);
        mat.update();

        if (this.onSelect) {
            this.onSelect(entity._partData);
        }
    }

    update(dt) {
        // Pulsate animation
        const s = 1 + Math.sin(Date.now() * 0.004) * 0.15;
        this.hotspots.forEach(({ entity }) => {
            if (entity !== this.selectedHotspot) {
                entity.setLocalScale(0.06 * s, 0.06 * s, 0.06 * s);
            } else {
                entity.setLocalScale(0.08, 0.08, 0.08);
            }
        });
    }

    _distPointToRay(p, from, to) {
        const d = new pc.Vec3().sub2(to, from);
        const w = new pc.Vec3().sub2(p, from);
        const t = Math.max(0, Math.min(1, w.dot(d) / d.dot(d)));
        const proj = new pc.Vec3().copy(d).mulScalar(t).add(from);
        return p.distance(proj);
    }
}
