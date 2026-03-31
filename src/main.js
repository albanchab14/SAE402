// MARA - Main Application Logic (A-Frame + AR.js + Three.js viewer)
import './components/hotspot.js';
import './components/robot-info.js';
import { fetchParts, fetchPart, fetchFaq, askAI, logInteraction } from './api/api-client.js';
import fallbackData from './data/robot-parts.json';
import { initViewer, stopViewer } from './viewer3d.js';

// --- State ---
let currentPart = null;
let chatOpen    = false;
let arMode      = true;
let apiOnline   = false;

// --- DOM refs (loading screen) ---
const loadingScreen = document.getElementById('loading-screen');
const loadingBar    = document.getElementById('loading-progress');
const loadingStatus = document.getElementById('loading-status');

/**
 * Met a jour la barre de chargement.
 * @param {number} pct  - Pourcentage 0-100
 * @param {string} text - Texte de statut
 */
function setLoading(pct, text) {
    if (loadingBar)    loadingBar.style.width = pct + '%';
    if (loadingStatus) loadingStatus.textContent = text;
}

/** Cache l'ecran de chargement avec une transition. */
function hideLoading() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
}

/**
 * Met a jour le badge de statut affiché en haut a gauche.
 * @param {boolean} connected - true si API MySQL accessible
 */
function updateStatusBadge(connected) {
    const badge = document.querySelector('.status-badge');
    if (!badge) return;
    if (connected) {
        badge.textContent = 'API Connectée';
        badge.className   = 'status-badge connected';
    } else {
        badge.textContent = 'Mode Hors-ligne';
        badge.className   = 'status-badge offline';
    }
}

// --- Demarrage ---
setLoading(10, 'Initialisation...');

document.addEventListener('DOMContentLoaded', async () => {
    setLoading(30, 'Chargement des données...');

    // --- Chargement des composants (API ou fallback JSON) ---
    let parts;
    try {
        parts = await fetchParts();
        if (!Array.isArray(parts) || parts.length === 0) throw new Error('empty');
        apiOnline = true;
        setLoading(50, 'Données API chargées ✓');
    } catch (e) {
        console.warn('[MARA] API indisponible, utilisation données locales');
        apiOnline = false;
        // Normaliser le format du JSON local pour correspondre a l API
        parts = fallbackData.parts.map(p => ({
            ...p,
            hotspot_x: p.hotspot_position?.x ?? 0,
            hotspot_y: p.hotspot_position?.y ?? 0,
            hotspot_z: p.hotspot_position?.z ?? 0
        }));
        setLoading(50, 'Données locales chargées');
    }
    updateStatusBadge(apiOnline);

    setLoading(60, 'Création des hotspots AR...');
    createHotspotsAR(parts);

    setLoading(80, 'Initialisation interface...');
    setupInfoPanel();
    setupChatPanel();
    setupModeToggle(parts);

    // --- Ecoute des clics sur les hotspots AR ---
    window.addEventListener('hotspot-click', async (e) => {
        const { partId } = e.detail;
        // Chercher d'abord par ID exact, sinon par index
        const part = parts.find(p => p.id === partId) || parts[partId - 1];
        if (part) {
            await showPartInfo(part);
            logInteraction('hotspot_click_ar', part.id, { name: part.name });
        }
    });

    // --- Detection du marqueur AR ---
    const marker         = document.querySelector('a-marker');
    const indicatorDot   = document.querySelector('.indicator-dot');
    const markerStatus   = document.getElementById('marker-status');
    if (marker) {
        marker.addEventListener('markerFound', () => {
            if (indicatorDot) indicatorDot.classList.add('found');
            if (markerStatus) markerStatus.textContent = 'Marqueur détecté ✓';
        });
        marker.addEventListener('markerLost', () => {
            if (indicatorDot) indicatorDot.classList.remove('found');
            if (markerStatus) markerStatus.textContent = 'Recherche marqueur...';
        });
    }

    setLoading(100, 'Prêt !');
    setTimeout(hideLoading, 600);
});

// ============================================================
// Création des hotspots dans la scene A-Frame (mode AR)
// ============================================================

/**
 * Crée les spheres hotspot cliquables dans la scene A-Frame.
 * Positions issues de hotspot_x/y/z (coordonnées relatives au marqueur AR).
 * @param {Array} parts - Tableau des composants du robot
 */
function createHotspotsAR(parts) {
    const marker = document.querySelector('a-marker');
    if (!marker) return;

    parts.forEach(part => {
        const x = parseFloat(part.hotspot_x ?? part.hotspot_position?.x ?? 0);
        const y = parseFloat(part.hotspot_y ?? part.hotspot_position?.y ?? 0);
        const z = parseFloat(part.hotspot_z ?? part.hotspot_position?.z ?? 0);

        // Sphere principale (visible, animée)
        const sphere = document.createElement('a-sphere');
        sphere.setAttribute('position', `${x} ${y} ${z}`);
        sphere.setAttribute('radius', '0.03');
        sphere.setAttribute('color', '#6366f1');
        sphere.setAttribute('material',
            'emissive: #6366f1; emissiveIntensity: 0.5; transparent: true; opacity: 0.85'
        );
        sphere.classList.add('clickable');
        sphere.setAttribute('data-part-id', part.id);

        // Animation pulsation (A-Frame accepte un objet directement)
        sphere.setAttribute('animation', {
            property : 'scale',
            to       : '1.3 1.3 1.3',
            dur      : 800,
            dir      : 'alternate',
            loop     : true,
            easing   : 'easeInOutSine'
        });

        // Clic → ouvre la fiche technique
        sphere.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('hotspot-click', {
                detail: { partId: part.id, label: part.name_fr }
            }));
        });

        marker.appendChild(sphere);
    });
}

// ============================================================
// Panneau fiche technique
// ============================================================

/** Branche les events du panneau fiche technique. */
function setupInfoPanel() {
    // Bouton fermeture
    document.querySelector('#info-panel .close-btn').addEventListener('click', () => {
        document.getElementById('info-panel').classList.remove('active');
        currentPart = null;
    });

    // Onglets
    document.querySelectorAll('#info-panel .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#info-panel .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('#info-panel .tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    // Bouton "Poser une question a l'IA"
    document.getElementById('ask-ai-btn').addEventListener('click', () => {
        openChat(currentPart?.id);
    });
}

/**
 * Remplit et affiche le panneau fiche technique pour un composant.
 * Tente d'abord d'obtenir les données complètes (avec documents) depuis l'API.
 * @param {Object} part - Données du composant (au minimum depuis le fallback JSON)
 */
async function showPartInfo(part) {
    currentPart = part;

    // Tenter de récupérer les détails complets (+ documents) depuis l'API
    let fullPart = part;
    if (apiOnline) {
        try {
            const fetched = await fetchPart(part.id);
            if (fetched && !fetched.status) fullPart = fetched;
        } catch (e) { /* utiliser les données locales */ }
    }

    // En-tête
    document.getElementById('panel-title').textContent = fullPart.name_fr || fullPart.name;
    document.getElementById('panel-category').textContent = formatCategory(fullPart.category);
    document.getElementById('panel-description').textContent = fullPart.description || '';

    // Onglet Specs — tableau clé/valeur
    const specs = typeof fullPart.specs === 'string'
        ? JSON.parse(fullPart.specs)
        : (fullPart.specs || {});

    document.getElementById('specs-table').innerHTML = Object.entries(specs)
        .map(([k, v]) =>
            `<tr>
                <td class="spec-key">${k.replace(/_/g, ' ')}</td>
                <td class="spec-val">${v}</td>
            </tr>`
        ).join('');

    // Onglet Documents
    const docsList = document.getElementById('docs-list');
    const docs = fullPart.documents || [];
    if (docs.length > 0) {
        docsList.innerHTML = docs.map(d => `
            <div class="doc-card">
                <div class="doc-type">${(d.doc_type || 'TEXT').toUpperCase()}</div>
                <div class="doc-title">${d.title}</div>
                <div class="doc-content">${(d.content || '').substring(0, 200)}${d.content && d.content.length > 200 ? '…' : ''}</div>
            </div>
        `).join('');
    } else {
        docsList.innerHTML = '<p style="color:rgba(255,255,255,0.3);text-align:center;padding:20px 0">Aucun document disponible.</p>';
    }

    // Onglet Maintenance — tableau standard UR5e
    document.getElementById('maintenance-info').innerHTML = `
        <table class="maintenance-table">
            <tr><td>Mensuel</td><td>Inspection câbles, connecteurs, fixations</td></tr>
            <tr><td>3 mois</td><td>Vérifier couple base (9 Nm), tester fonctions sécurité</td></tr>
            <tr><td>6 mois</td><td>Vérifier version PolyScope, sauvegarder programmes</td></tr>
            <tr><td>1 an</td><td>Inspection joints O-ring (réf 131095)</td></tr>
            <tr><td>5 ans</td><td>Remplacer batterie CR2032 (réf 170009)</td></tr>
            <tr><td>35 000 h</td><td>Remplacer Wrist 1 (réf 124100)</td></tr>
            <tr><td>35 000 h</td><td>Remplacer Wrist 2 (réf 124101)</td></tr>
            <tr><td>35 000 h</td><td>Remplacer Wrist 3 (réf 102414)</td></tr>
        </table>
    `;

    // Revenir a l'onglet "General" et afficher le panneau
    document.querySelectorAll('#info-panel .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#info-panel .tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('#info-panel .tab[data-tab="general"]').classList.add('active');
    document.getElementById('tab-general').classList.add('active');

    document.getElementById('info-panel').classList.add('active');
}

/**
 * Formate l'identifiant de catégorie en libellé lisible.
 * @param {string} cat - Identifiant de catégorie
 * @returns {string} Libellé formaté
 */
function formatCategory(cat) {
    const map = {
        identification  : 'Identification',
        alimentation    : 'Alimentation',
        raccordement    : 'Raccordement',
        installation    : 'Installation',
        maintenance     : 'Maintenance',
        pieces_detachees: 'Pièces détachées'
    };
    return map[cat] || cat || '';
}

// ============================================================
// Panneau chat / assistant IA
// ============================================================

/** Branche les events du panneau chat. */
function setupChatPanel() {
    // Bouton flottant toggle
    document.getElementById('chat-toggle').addEventListener('click', () => {
        if (chatOpen) closeChat();
        else openChat();
    });

    // Bouton fermeture dans le panneau
    document.querySelector('#chat-panel .chat-header button').addEventListener('click', closeChat);

    // Envoi au clavier (Entrée)
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendQuestion();
        }
    });

    // Bouton Envoyer
    document.getElementById('chat-send-btn').addEventListener('click', sendQuestion);
}

/**
 * Ouvre le panneau chat et charge les FAQ suggérées.
 * @param {number|null} partId - ID du composant contexte (ou null pour général)
 */
async function openChat(partId = null) {
    chatOpen = true;
    document.getElementById('chat-panel').classList.add('active');
    document.getElementById('chat-toggle').classList.add('hidden');

    // Afficher le contexte actif
    const ctx = document.getElementById('chat-context');
    ctx.textContent = partId
        ? `Contexte : ${currentPart?.name_fr || 'Composant #' + partId}`
        : 'Contexte : Général UR5e';

    // Charger les FAQ suggérées
    try {
        const faqs = await fetchFaq(partId);
        const faqContainer = document.getElementById('chat-faq');
        if (Array.isArray(faqs) && faqs.length > 0) {
            faqContainer.innerHTML =
                '<div class="faq-label">Questions fréquentes :</div>' +
                faqs.slice(0, 3).map((f, i) =>
                    `<button class="faq-btn" data-idx="${i}">${
                        f.question.length > 60
                            ? f.question.substring(0, 57) + '...'
                            : f.question
                    }</button>`
                ).join('');

            faqContainer.querySelectorAll('.faq-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx);
                    document.getElementById('chat-input').value = faqs[idx].question;
                    sendQuestion();
                });
            });
        } else {
            faqContainer.innerHTML = '';
        }
    } catch (e) { /* FAQ non critique */ }

    document.getElementById('chat-input').focus();
}

/** Ferme le panneau chat. */
function closeChat() {
    chatOpen = false;
    document.getElementById('chat-panel').classList.remove('active');
    document.getElementById('chat-toggle').classList.remove('hidden');
}

/**
 * Envoie la question a l'API Gemini et affiche la réponse.
 * Vide l'input et affiche un indicateur de chargement pendant l'appel.
 */
async function sendQuestion() {
    const input    = document.getElementById('chat-input');
    const question = input.value.trim();
    if (!question) return;

    input.value = '';
    // Désactiver input pendant la requête
    input.disabled = true;
    document.getElementById('chat-send-btn').disabled = true;

    appendMessage('user', question);
    document.getElementById('chat-faq').innerHTML = '';

    const typingEl = appendMessage('ai typing', '● ● ●');

    try {
        const result = await askAI(question, currentPart?.id || null);
        typingEl.remove();
        appendMessage('ai', result.answer || 'Pas de réponse.');
        // Si c'est du cache, ajouter un indicateur discret
        if (result.source === 'cache') {
            const lastMsg = document.getElementById('chat-messages').lastElementChild;
            if (lastMsg) lastMsg.title = 'Réponse depuis le cache FAQ';
        }
    } catch (e) {
        typingEl.remove();
        appendMessage('ai error', 'Erreur de connexion avec l\'assistant IA. Vérifiez que le backend PHP est lancé.');
    } finally {
        input.disabled = false;
        document.getElementById('chat-send-btn').disabled = false;
        input.focus();
    }
}

/**
 * Ajoute un message dans la bulle de chat.
 * @param {string} type - 'user' | 'ai' | 'ai typing' | 'ai error'
 * @param {string} text - Contenu du message
 * @returns {HTMLElement} L'élément créé (pour pouvoir le supprimer en cas de typing)
 */
function appendMessage(type, text) {
    const container = document.getElementById('chat-messages');
    const msg       = document.createElement('div');
    msg.className   = `chat-msg ${type}`;
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
}

// ============================================================
// Bascule AR / Viewer 3D
// ============================================================

/**
 * Configure le bouton de bascule entre mode AR et mode Viewer 3D.
 * @param {Array} parts - Données des composants (passées au viewer 3D)
 */
function setupModeToggle(parts) {
    const btn = document.getElementById('mode-toggle');
    if (!btn) return;

    btn.addEventListener('click', () => {
        arMode = !arMode;

        const arScene        = document.getElementById('ar-scene');
        const viewerCanvas   = document.getElementById('viewer-canvas');
        const markerIndicator= document.getElementById('marker-indicator');
        const viewerHint     = document.getElementById('viewer-hint');

        if (arMode) {
            // --- Retour mode AR ---
            if (arScene)         arScene.style.display        = '';
            if (viewerCanvas)    viewerCanvas.style.display   = 'none';
            if (markerIndicator) markerIndicator.style.display= '';
            if (viewerHint)      viewerHint.style.display     = 'none';
            btn.textContent      = 'Mode Viewer 3D';
            btn.style.borderColor= '';
            stopViewer(); // Libérer les ressources Three.js
        } else {
            // --- Passage mode Viewer 3D ---
            if (arScene)         arScene.style.display        = 'none';
            if (viewerCanvas)    viewerCanvas.style.display   = 'block';
            if (markerIndicator) markerIndicator.style.display= 'none';
            if (viewerHint)      viewerHint.style.display     = 'block';
            btn.textContent      = 'Mode AR';
            btn.style.borderColor= 'rgba(99,102,241,0.5)';

            // Initialiser le viewer Three.js
            initViewer(viewerCanvas, parts, async (part) => {
                await showPartInfo(part);
                logInteraction('hotspot_click_3d', part.id, { name: part.name });
            });
        }
    });
}
