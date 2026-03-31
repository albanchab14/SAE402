// Composant A-Frame "robot-info" - affiche un label 3D au-dessus d'un hotspot
AFRAME.registerComponent('robot-info', {
    schema: {
        text: { type: 'string', default: '' },
        visible: { type: 'boolean', default: false }
    },

    init() {
        // Créer un text entity enfant
        this.label = document.createElement('a-text');
        this.label.setAttribute('value', this.data.text);
        this.label.setAttribute('align', 'center');
        this.label.setAttribute('color', '#ffffff');
        this.label.setAttribute('scale', '0.15 0.15 0.15');
        this.label.setAttribute('position', '0 0.06 0');
        this.label.setAttribute('look-at', '[camera]');
        this.label.setAttribute('visible', this.data.visible);

        // Background plane
        this.bg = document.createElement('a-plane');
        this.bg.setAttribute('color', '#1a1a2e');
        this.bg.setAttribute('opacity', '0.8');
        this.bg.setAttribute('width', '0.2');
        this.bg.setAttribute('height', '0.04');
        this.bg.setAttribute('position', '0 0.06 -0.001');
        this.bg.setAttribute('look-at', '[camera]');
        this.bg.setAttribute('visible', this.data.visible);

        this.el.appendChild(this.bg);
        this.el.appendChild(this.label);
    },

    update() {
        if (this.label) {
            this.label.setAttribute('value', this.data.text);
            this.label.setAttribute('visible', this.data.visible);
        }
        if (this.bg) {
            this.bg.setAttribute('visible', this.data.visible);
        }
    }
});
