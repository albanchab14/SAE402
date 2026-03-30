import * as pc from 'playcanvas';

// Load and manage the UR5e GLB model
export class RobotLoader {
    constructor(app) {
        this.app = app;
        this.entity = null;
        this.meshMap = new Map(); // mesh_name -> entity
    }

    async load(url = '/models/UR5e.glb') {
        return new Promise((resolve, reject) => {
            const asset = new pc.Asset('robot-ur5e', 'container', { url });
            this.app.assets.add(asset);
            this.app.assets.load(asset);

            asset.ready(() => {
                this.entity = asset.resource.instantiateRenderEntity();
                this.app.root.addChild(this.entity);

                // Auto-scale and center
                this._autoFit();
                // Map all mesh nodes
                this._mapMeshes(this.entity);

                console.log('[RobotLoader] Model loaded. Meshes found:', [...this.meshMap.keys()]);
                resolve(this.entity);
            });

            asset.on('error', (err) => {
                console.error('[RobotLoader] Failed to load model:', err);
                reject(err);
            });
        });
    }

    _autoFit() {
        if (!this.entity) return;
        // Calculate bounding box
        const renders = this.entity.findComponents('render');
        if (renders.length === 0) return;

        const aabb = new pc.BoundingBox();
        let first = true;
        renders.forEach(r => {
            r.meshInstances.forEach(mi => {
                if (first) {
                    aabb.copy(mi.aabb);
                    first = false;
                } else {
                    aabb.add(mi.aabb);
                }
            });
        });

        // Scale so max dimension is ~1.5 units
        const size = aabb.halfExtents.clone().scale(2);
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            const scale = 1.5 / maxDim;
            this.entity.setLocalScale(scale, scale, scale);
        }

        // Center vertically
        const center = aabb.center;
        this.entity.setLocalPosition(-center.x * this.entity.getLocalScale().x, 0, -center.z * this.entity.getLocalScale().z);
    }

    _mapMeshes(entity) {
        if (entity.render || entity.model) {
            this.meshMap.set(entity.name, entity);
        }
        entity.children.forEach(child => this._mapMeshes(child));
    }

    getMeshEntity(meshName) {
        // Try exact match first, then fuzzy
        if (this.meshMap.has(meshName)) return this.meshMap.get(meshName);
        for (const [key, val] of this.meshMap) {
            if (key.toLowerCase().includes(meshName.toLowerCase())) return val;
        }
        return null;
    }

    getAllMeshNames() {
        return [...this.meshMap.keys()];
    }
}
