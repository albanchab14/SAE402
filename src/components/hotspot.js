// Composant A-Frame custom "hotspot" - point interactif sur le robot
AFRAME.registerComponent('hotspot', {
    schema: {
        partId: { type: 'number', default: 0 },
        label: { type: 'string', default: '' },
        color: { type: 'color', default: '#6366f1' }
    },

    init() {
        // Style visuel
        this.el.setAttribute('geometry', { primitive: 'sphere', radius: 0.03 });
        this.el.setAttribute('material', {
            color: this.data.color,
            emissive: this.data.color,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.85
        });
        this.el.classList.add('clickable');

        // Animation pulsation
        this.el.setAttribute('animation', {
            property: 'scale',
            to: '1.3 1.3 1.3',
            dur: 800,
            dir: 'alternate',
            loop: true,
            easing: 'easeInOutSine'
        });

        // Clic
        this.el.addEventListener('click', () => {
            // Dispatch custom event avec les données du composant
            window.dispatchEvent(new CustomEvent('hotspot-click', {
                detail: { partId: this.data.partId, label: this.data.label }
            }));
        });

        // Hover effects
        this.el.addEventListener('mouseenter', () => {
            this.el.setAttribute('material', 'emissiveIntensity', 1);
            this.el.setAttribute('scale', '1.5 1.5 1.5');
        });

        this.el.addEventListener('mouseleave', () => {
            this.el.setAttribute('material', 'emissiveIntensity', 0.5);
            this.el.removeAttribute('scale');
        });
    }
});
