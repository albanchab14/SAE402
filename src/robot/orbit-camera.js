import * as pc from 'playcanvas';

// Orbit camera controller for mouse and touch
export class OrbitCamera {
    constructor(cameraEntity, app) {
        this.camera = cameraEntity;
        this.app = app;

        this.distance = 3;
        this.minDistance = 1;
        this.maxDistance = 10;
        this.pitch = -15;
        this.yaw = 45;
        this.target = new pc.Vec3(0, 0.5, 0);
        this.smoothness = 0.1;

        this._dragging = false;
        this._lastX = 0;
        this._lastY = 0;
        this._pinchDist = 0;

        this._bindEvents();
        this._updatePosition();
    }

    _bindEvents() {
        const canvas = this.app.graphicsDevice.canvas;

        // Mouse
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0 || e.button === 2) {
                this._dragging = true;
                this._lastX = e.clientX;
                this._lastY = e.clientY;
            }
        });
        canvas.addEventListener('mousemove', (e) => {
            if (!this._dragging) return;
            const dx = e.clientX - this._lastX;
            const dy = e.clientY - this._lastY;
            this.yaw -= dx * 0.3;
            this.pitch = Math.max(-89, Math.min(89, this.pitch - dy * 0.3));
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            this._updatePosition();
        });
        canvas.addEventListener('mouseup', () => { this._dragging = false; });
        canvas.addEventListener('mouseleave', () => { this._dragging = false; });
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + e.deltaY * 0.003));
            this._updatePosition();
        }, { passive: false });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this._dragging = true;
                this._lastX = e.touches[0].clientX;
                this._lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                this._dragging = false;
                this._pinchDist = this._getTouchDist(e.touches);
            }
        });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && this._dragging) {
                const dx = e.touches[0].clientX - this._lastX;
                const dy = e.touches[0].clientY - this._lastY;
                this.yaw -= dx * 0.3;
                this.pitch = Math.max(-89, Math.min(89, this.pitch - dy * 0.3));
                this._lastX = e.touches[0].clientX;
                this._lastY = e.touches[0].clientY;
                this._updatePosition();
            } else if (e.touches.length === 2) {
                const dist = this._getTouchDist(e.touches);
                const delta = this._pinchDist - dist;
                this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance + delta * 0.01));
                this._pinchDist = dist;
                this._updatePosition();
            }
        }, { passive: false });
        canvas.addEventListener('touchend', () => { this._dragging = false; });
    }

    _getTouchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    _updatePosition() {
        const pitchRad = this.pitch * Math.PI / 180;
        const yawRad = this.yaw * Math.PI / 180;

        const x = this.target.x + this.distance * Math.cos(pitchRad) * Math.sin(yawRad);
        const y = this.target.y + this.distance * Math.sin(pitchRad);
        const z = this.target.z + this.distance * Math.cos(pitchRad) * Math.cos(yawRad);

        this.camera.setPosition(x, y, z);
        this.camera.lookAt(this.target);
    }
}
