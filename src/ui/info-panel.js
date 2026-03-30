import { fetchPart } from '../api/api-client.js';

// Info panel displaying technical data sheets for robot parts
export class InfoPanel {
    constructor() {
        this.panel = document.getElementById('info-panel');
        this.currentPartId = null;
        this.onAskAI = null; // callback(partId)
        this._build();
    }

    _build() {
        this.panel.innerHTML = `
            <div class="info-header">
                <div class="info-close" id="info-close">&times;</div>
                <div class="info-category" id="info-category"></div>
                <h2 class="info-title" id="info-title"></h2>
                <p class="info-subtitle" id="info-subtitle"></p>
            </div>
            <div class="info-tabs">
                <button class="info-tab active" data-tab="general">General</button>
                <button class="info-tab" data-tab="specs">Specs</button>
                <button class="info-tab" data-tab="docs">Documents</button>
                <button class="info-tab" data-tab="maintenance">Maintenance</button>
            </div>
            <div class="info-content" id="info-content"></div>
            <button class="info-ai-btn" id="info-ai-btn">
                <span class="ai-icon">&#9733;</span> Poser une question a l'IA
            </button>
        `;

        document.getElementById('info-close').addEventListener('click', () => this.hide());

        this.panel.querySelectorAll('.info-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.panel.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this._renderTab(e.target.dataset.tab);
            });
        });

        document.getElementById('info-ai-btn').addEventListener('click', () => {
            if (this.onAskAI && this.currentPartId) {
                this.onAskAI(this.currentPartId);
            }
        });
    }

    async show(partData) {
        this.currentPartId = partData.id;
        this._partData = partData;

        // Fetch full details from API
        try {
            const full = await fetchPart(partData.id);
            if (full && !full.status) {
                this._partData = full;
            }
        } catch (e) {
            // Use local data as fallback
        }

        document.getElementById('info-title').textContent = this._partData.name_fr || this._partData.name;
        document.getElementById('info-subtitle').textContent = this._partData.name !== this._partData.name_fr ? this._partData.name : '';
        document.getElementById('info-category').textContent = this._formatCategory(this._partData.category);

        // Reset to general tab
        this.panel.querySelectorAll('.info-tab').forEach(t => t.classList.remove('active'));
        this.panel.querySelector('[data-tab="general"]').classList.add('active');
        this._renderTab('general');

        this.panel.classList.add('active');
    }

    hide() {
        this.panel.classList.remove('active');
        this.currentPartId = null;
    }

    _renderTab(tab) {
        const content = document.getElementById('info-content');
        const part = this._partData;

        switch (tab) {
            case 'general':
                content.innerHTML = `
                    <div class="info-description">${part.description || 'Aucune description disponible.'}</div>
                    ${part.image_url ? `<img class="info-image" src="${part.image_url}" alt="${part.name_fr}">` : ''}
                `;
                break;

            case 'specs':
                const specs = typeof part.specs === 'string' ? JSON.parse(part.specs) : (part.specs || {});
                let specsHtml = '<table class="specs-table">';
                for (const [key, val] of Object.entries(specs)) {
                    const label = key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
                    specsHtml += `<tr><td class="spec-key">${label}</td><td class="spec-val">${val}</td></tr>`;
                }
                specsHtml += '</table>';
                content.innerHTML = specsHtml;
                break;

            case 'docs':
                const docs = part.documents || [];
                if (docs.length === 0) {
                    content.innerHTML = '<p class="info-empty">Aucun document disponible.</p>';
                } else {
                    content.innerHTML = docs.map(doc => `
                        <div class="doc-card">
                            <div class="doc-type">${doc.doc_type.toUpperCase()}</div>
                            <div class="doc-title">${doc.title}</div>
                            <div class="doc-content">${doc.content || ''}</div>
                            ${doc.file_url ? `<a class="doc-link" href="${doc.file_url}" target="_blank">Ouvrir</a>` : ''}
                        </div>
                    `).join('');
                }
                break;

            case 'maintenance':
                content.innerHTML = `
                    <div class="maintenance-info">
                        <h4>Inspection visuelle mensuelle</h4>
                        <ul>
                            <li>Verifier l'etat des cables et connecteurs</li>
                            <li>Controler les jeux articulaires</li>
                            <li>Inspecter les surfaces pour traces d'usure</li>
                        </ul>
                        <h4>Maintenance preventive annuelle</h4>
                        <ul>
                            <li>Verification des couples de serrage</li>
                            <li>Etat des reducteurs harmoniques</li>
                            <li>Mise a jour logicielle</li>
                            <li>Calibration des capteurs</li>
                        </ul>
                    </div>
                `;
                break;
        }
    }

    _formatCategory(cat) {
        const map = {
            identification: 'Identification',
            alimentation: 'Alimentation',
            raccordement: 'Raccordement',
            installation: 'Installation',
            maintenance: 'Maintenance',
            pieces_detachees: 'Pieces detachees'
        };
        return map[cat] || cat || '';
    }
}
