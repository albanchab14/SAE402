/**
 * main.js — Logique principale MARA
 *
 * Orchestration :
 *   - Chargement des données (API MySQL ou fallback JSON local)
 *   - Initialisation du viewer Three.js
 *   - Bascule Viewer 3D ↔ AR WebXR (hit-test surface)
 *   - Panneau fiche technique (onglets : Général / Specs / Documents / Maintenance)
 *   - Panneau chat assistant IA (Gemini via backend PHP)
 */

import { fetchParts, fetchPart, fetchFaq, askAI, logInteraction } from './api/api-client.js';
import fallbackData from './data/robot-parts.json';
import docsCatalog  from './data/docs-catalog.json';
import {
    initViewer,
    stopViewer,
    setViewerMode,
    isXRSupported,
    startXRSession,
    stopXRSession,
    clearMeshSelection,
    focusOnPart
} from './viewer3d.js';

// ─── État global ──────────────────────────────────────────────────────────────

let currentPart = null;
let xrActive    = false;
let apiOnline   = false;

/** Référence à closeMenu() capturée dans setupSideMenu, utilisée pour rafraîchir la FAQ. */
let _closeMenuRef = () => {};

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Labels lisibles pour les catégories de composants (partagé dans tout le module). */
const CATEGORY_LABELS = {
    identification  : 'Identification',
    alimentation    : 'Alimentation',
    raccordement    : 'Raccordement',
    installation    : 'Installation',
    maintenance     : 'Maintenance',
    pieces_detachees: 'Pièces détachées'
};

/** Icônes Material par titre de document technique. */
const DOC_ICONS = {
    'Principe de fonctionnement et Architecture': 'auto_stories',
    'Directives d\'Installation & Câblage': 'build',
    'Sécurité et Fonctions PFL': 'gpp_maybe',
    'Recommandations de Maintenance': 'engineering'
};

/** Mapping ID composant → fiche PDF générée. */
const PART_PDF_MAP = {
    1:  { file: '/docs/fiche_base_joint1.pdf',             label: 'Fiche technique — Base (Joint 1)' },
    2:  { file: '/docs/fiche_epaule_joint2.pdf',           label: 'Fiche technique — Épaule (Joint 2)' },
    3:  { file: '/docs/fiche_bras_superieur.pdf',          label: 'Fiche technique — Bras supérieur' },
    4:  { file: '/docs/fiche_coude_joint3.pdf',            label: 'Fiche technique — Coude (Joint 3)' },
    5:  { file: '/docs/fiche_avant_bras.pdf',              label: 'Fiche technique — Avant-bras' },
    6:  { file: '/docs/fiche_poignet1_joint4.pdf',         label: 'Fiche technique — Poignet 1 (Joint 4)' },
    7:  { file: '/docs/fiche_poignet2_joint5.pdf',         label: 'Fiche technique — Poignet 2 (Joint 5)' },
    8:  { file: '/docs/fiche_poignet3_bride_joint6.pdf',   label: 'Fiche technique — Poignet 3 + Bride (Joint 6)' },
    9:  { file: '/docs/fiche_boitier_commande.pdf',        label: 'Fiche technique — Boîtier de commande' },
    10: { file: '/docs/fiche_teach_pendant.pdf',           label: 'Fiche technique — Teach Pendant' },
};

// ─── Refs DOM (écran de chargement) ──────────────────────────────────────────

const loadingScreen = document.getElementById('loading-screen');
const loadingBar    = document.getElementById('loading-progress');
const loadingStatus = document.getElementById('loading-status');

function setLoading(pct, text) {
    if (loadingBar)    loadingBar.style.width   = pct + '%';
    if (loadingStatus) loadingStatus.textContent = text;
}

function hideLoading() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
}

function updateStatusBadge(connected) {
    const badge = document.querySelector('.status-badge');
    if (!badge) return;
    badge.textContent = connected ? 'API Connectée' : 'Mode Hors-ligne';
    badge.className   = 'status-badge ' + (connected ? 'connected' : 'offline');
}

// ─────────────────────────────────────────────────────────────────────────────
// Démarrage
// ─────────────────────────────────────────────────────────────────────────────

setLoading(10, 'Initialisation...');

document.addEventListener('DOMContentLoaded', async () => {
    setLoading(30, 'Chargement des données...');

    let parts;
    try {
        parts = await fetchParts();
        if (!Array.isArray(parts) || parts.length === 0) throw new Error('empty');
        apiOnline = true;
        setLoading(50, 'Données API chargées ✓');
    } catch {
        console.warn('[MARA] API indisponible → données locales');
        apiOnline = false;
        parts = fallbackData.parts.map(p => ({
            ...p,
            hotspot_x: p.hotspot_position?.x ?? 0,
            hotspot_y: p.hotspot_position?.y ?? 0,
            hotspot_z: p.hotspot_position?.z ?? 0
        }));
        setLoading(50, 'Données locales chargées');
    }
    updateStatusBadge(apiOnline);

    setLoading(60, 'Initialisation viewer 3D...');
    const viewerCanvas = document.getElementById('viewer-canvas');
    initViewer(viewerCanvas, parts, async (part, screenPos) => {
        await showPartInfo(part, screenPos);
        logInteraction('hotspot_click', part.id, { name: part.name });
    });

    setLoading(80, 'Initialisation interface...');
    setupInfoPanel();
    setupChatPanel();
    setupSideMenu(parts);
    await setupModeToggle();

    setViewerMode(false);

    setLoading(100, 'Prêt !');
    setTimeout(hideLoading, 600);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bascule Viewer 3D / AR WebXR
// ─────────────────────────────────────────────────────────────────────────────

async function setupModeToggle() {
    const btn = document.getElementById('mode-toggle');
    if (!btn) return;

    const supported = await isXRSupported();

    if (!supported) {
        btn.textContent         = 'AR non disponible';
        btn.style.opacity       = '0.4';
        btn.style.cursor        = 'default';
        btn.style.pointerEvents = 'none';
        btn.title = 'WebXR AR nécessite Chrome Android avec ARCore (ou Safari iOS 14+) et HTTPS.';
        return;
    }

    btn.textContent = 'Mode AR';

    btn.addEventListener('click', async () => {
        if (!xrActive) {
            try {
                btn.textContent         = 'Démarrage AR...';
                btn.style.pointerEvents = 'none';

                await startXRSession(() => {
                    const hint = document.getElementById('ar-hint');
                    if (hint) hint.style.display = 'none';
                    _setIndicator(true, 'Robot placé ✓');
                });

                xrActive                = true;
                btn.textContent         = 'Quitter AR';
                btn.style.borderColor   = 'rgba(99,102,241,0.5)';
                btn.style.pointerEvents = 'auto';

                document.getElementById('ar-overlay')?.classList.add('active');
                _setIndicator(false, 'Cherche une surface…');

            } catch (err) {
                console.error('[MARA] Échec démarrage XR :', err);
                btn.textContent         = 'Mode AR';
                btn.style.pointerEvents = 'auto';
                alert('Impossible de démarrer l\'AR : ' + (err.message || err));
            }
        } else {
            stopXRSession();
            xrActive              = false;
            btn.textContent       = 'Mode AR';
            btn.style.borderColor = '';

            document.getElementById('ar-overlay')?.classList.remove('active');
            const hint = document.getElementById('ar-hint');
            if (hint) hint.style.display = '';
            _setIndicator(false, 'Viewer 3D');
        }
    });

    document.getElementById('ar-quit-btn')?.addEventListener('click', () => {
        if (xrActive) btn.click();
    });
}

function _setIndicator(active, text) {
    document.querySelector('.indicator-dot')?.classList.toggle('found', active);
    const s = document.getElementById('marker-status');
    if (s) s.textContent = text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneau fiche technique
// ─────────────────────────────────────────────────────────────────────────────

function _closeInfoPanel() {
    const panel = document.getElementById('info-panel');
    panel.classList.remove('active', 'contextual', 'expanded');
    panel.style.maxHeight = '';
    panel.style.left = panel.style.top = panel.style.right = panel.style.transformOrigin = '';
    currentPart = null;
    clearMeshSelection();

    if (xrActive) {
        const crosshair = document.getElementById('ar-crosshair');
        if (crosshair) crosshair.style.display = 'block';
    }
}

function _positionPanel() {
    const panel   = document.getElementById('info-panel');
    const PANEL_W = 340;
    const MARGIN  = 20;
    const x = window.innerWidth - PANEL_W - MARGIN;
    const y = MARGIN + 40;

    panel.style.left            = x + 'px';
    panel.style.top             = y + 'px';
    panel.style.right           = '';
    panel.style.transformOrigin = 'right center';
    panel.classList.add('contextual');
}

/**
 * Active l'onglet donné et désactive tous les autres.
 * @param {string} tabName - valeur data-tab (general, specs, docs, maintenance)
 */
function _switchTab(tabName) {
    document.querySelectorAll('#info-panel .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#info-panel .tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`#info-panel .tab[data-tab="${tabName}"]`)?.classList.add('active');
    document.getElementById('tab-' + tabName)?.classList.add('active');
}

/**
 * Poignée de glissement bottom-sheet (mobile uniquement).
 * Glisser haut/bas redimensionne le panneau entre 25vh et 88vh.
 */
function _setupDragHandle() {
    const panel  = document.getElementById('info-panel');
    const handle = panel.querySelector('.drag-handle');
    if (!handle) return;

    const MIN_VH = 25;
    const MAX_VH = 88;
    let startY = 0, startHeightPx = 0, dragging = false;

    handle.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768) return;
        dragging      = true;
        startY        = e.touches[0].clientY;
        startHeightPx = panel.getBoundingClientRect().height;
        panel.classList.add('dragging');
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
        if (!dragging || window.innerWidth > 768) return;
        const deltaY    = e.touches[0].clientY - startY;
        const newHeight = startHeightPx - deltaY;
        const minPx     = (MIN_VH / 100) * window.innerHeight;
        const maxPx     = (MAX_VH / 100) * window.innerHeight;
        panel.style.maxHeight = Math.min(maxPx, Math.max(minPx, newHeight)) + 'px';
    }, { passive: true });

    const onEnd = () => { if (dragging) { dragging = false; panel.classList.remove('dragging'); } };
    handle.addEventListener('touchend',    onEnd);
    handle.addEventListener('touchcancel', onEnd);
}

/**
 * Déplacement libre du panneau au clic-glissé sur le header (desktop uniquement).
 */
function _setupPanelDrag() {
    const panel  = document.getElementById('info-panel');
    const header = panel.querySelector('.panel-header');
    if (!header) return;

    let dragging = false, offsetX = 0, offsetY = 0;
    header.style.cursor = 'grab';

    header.addEventListener('mousedown', (e) => {
        if (window.innerWidth <= 768 || e.target.closest('.close-btn')) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        header.style.cursor    = 'grabbing';
        panel.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panel.style.left = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth  - 100)) + 'px';
        panel.style.top  = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - 100)) + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        header.style.cursor    = 'grab';
        panel.style.transition = '';
    });
}

function setupInfoPanel() {
    document.querySelector('#info-panel .close-btn').addEventListener('click', _closeInfoPanel);
    _setupDragHandle();
    _setupPanelDrag();

    document.querySelectorAll('#info-panel .tab').forEach(tab => {
        tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
    });

    document.getElementById('ask-ai-btn').addEventListener('click', () => {
        openChat(currentPart?.id);
    });
}

/**
 * Remplit et affiche le panneau fiche technique pour un composant.
 * @param {Object}                         part      - données minimales du composant
 * @param {{ x: number, y: number }|null}  screenPos - position écran du hotspot
 */
async function showPartInfo(part, screenPos = null) {
    const panel = document.getElementById('info-panel');

    // Transition de fermeture si on change de composant
    if (panel.classList.contains('active') && currentPart && currentPart.id !== part.id) {
        panel.classList.remove('active');
        await new Promise(r => setTimeout(r, 350));
    }

    currentPart = part;

    let fullPart = part;
    if (apiOnline) {
        try {
            const fetched = await fetchPart(part.id);
            if (fetched && !fetched.status) fullPart = fetched;
        } catch { /* fallback local */ }
    }

    document.getElementById('panel-title').textContent       = fullPart.name_fr || fullPart.name;
    document.getElementById('panel-category').textContent    = CATEGORY_LABELS[fullPart.category] || fullPart.category || '';
    document.getElementById('panel-description').textContent = fullPart.description || '';

    // Specs
    const specs = typeof fullPart.specs === 'string' ? JSON.parse(fullPart.specs) : (fullPart.specs || {});
    document.getElementById('specs-table').innerHTML = Object.entries(specs)
        .map(([k, v]) => `<tr><td class="spec-key">${k.replace(/_/g, ' ')}</td><td class="spec-val">${v}</td></tr>`)
        .join('');

    // Documents
    const docs = fullPart.documents || [];
    const partPdf = PART_PDF_MAP[fullPart.id];

    const pdfCardHtml = partPdf ? `
        <div class="doc-card doc-card-pdf" data-file="${partPdf.file}" data-title="${partPdf.label}">
            <div class="doc-header">
                <span class="doc-icon material-icons-outlined">picture_as_pdf</span>
                <span class="doc-title">${partPdf.label}</span>
                <span class="doc-open-hint material-icons-outlined">open_in_new</span>
            </div>
            <div class="doc-content">Appuyez pour ouvrir la fiche PDF complète de ce composant.</div>
        </div>` : '';

    const docsHtml = docs.map(d => `
        <div class="doc-card">
            <div class="doc-header">
                <span class="doc-icon material-icons-outlined">${DOC_ICONS[d.title] || 'description'}</span>
                <span class="doc-title">${d.title}</span>
            </div>
            <div class="doc-content">${d.content || ''}</div>
        </div>`).join('');

    const docsContainer = document.getElementById('docs-list');
    docsContainer.innerHTML = (pdfCardHtml + docsHtml) || '<p class="empty-state">Aucun document disponible.</p>';

    docsContainer.querySelector('.doc-card-pdf')?.addEventListener('click', () => {
        openPdfViewer(partPdf.file, partPdf.label, fullPart.name_fr || fullPart.name);
    });

    // Maintenance
    const maintenanceDoc = docs.find(d => d.title?.toLowerCase().includes('maintenance'));
    document.getElementById('maintenance-info').innerHTML = maintenanceDoc
        ? `<div class="doc-card">
            <div class="doc-header">
                <span class="doc-icon material-icons-outlined">engineering</span>
                <span class="doc-title">${maintenanceDoc.title}</span>
            </div>
            <div class="doc-content">${maintenanceDoc.content}</div>
           </div>`
        : '<p class="empty-state">Aucune donnée de maintenance.</p>';

    _switchTab('general');

    // Positionnement contextuel (desktop > 768px)
    panel.classList.remove('contextual');
    panel.style.left = panel.style.top = panel.style.right = panel.style.transformOrigin = '';
    if (window.innerWidth > 768) _positionPanel();

    requestAnimationFrame(() => panel.classList.add('active'));

    if (!xrActive) focusOnPart(fullPart);

    // En AR : masquer le viseur pendant que la fiche est ouverte
    if (xrActive) {
        const crosshair = document.getElementById('ar-crosshair');
        if (crosshair) crosshair.style.display = 'none';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneau chat / assistant IA
// ─────────────────────────────────────────────────────────────────────────────

function setupChatPanel() {
    const chatPanel  = document.getElementById('chat-panel');
    const chatToggle = document.getElementById('chat-toggle');

    chatToggle.addEventListener('click', () => {
        chatPanel.classList.contains('active') ? closeChat() : openChat();
    });

    document.querySelector('#chat-panel .chat-header button').addEventListener('click', closeChat);

    document.getElementById('chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
    });

    document.getElementById('chat-send-btn').addEventListener('click', sendQuestion);
    _setupChatMic();
}

async function openChat(partId = null) {
    _closeInfoPanel();

    const chatPanel  = document.getElementById('chat-panel');
    const chatToggle = document.getElementById('chat-toggle');
    chatPanel.classList.add('active');
    chatToggle.classList.add('hidden');

    document.getElementById('chat-context').textContent = partId
        ? `Contexte : ${currentPart?.name_fr || 'Composant #' + partId}`
        : 'Contexte : Général UR5e';

    try {
        const faqs = await fetchFaq(partId);
        const faqContainer = document.getElementById('chat-faq');
        if (Array.isArray(faqs) && faqs.length > 0) {
            faqContainer.innerHTML =
                '<div class="faq-label">Questions fréquentes :</div>' +
                faqs.slice(0, 3).map((f, i) =>
                    `<button class="faq-btn" data-idx="${i}">${
                        f.question.length > 60 ? f.question.substring(0, 57) + '...' : f.question
                    }</button>`
                ).join('');

            faqContainer.querySelectorAll('.faq-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.getElementById('chat-input').value = faqs[+btn.dataset.idx].question;
                    sendQuestion();
                });
            });
        } else {
            faqContainer.innerHTML = '';
        }
    } catch { /* FAQ non critique */ }

    document.getElementById('chat-input').focus();
}

function closeChat() {
    document.getElementById('chat-panel').classList.remove('active');
    document.getElementById('chat-toggle').classList.remove('hidden');
}

async function sendQuestion() {
    const input    = document.getElementById('chat-input');
    const question = input.value.trim();
    if (!question) return;

    input.value    = '';
    input.disabled = true;
    document.getElementById('chat-send-btn').disabled = true;

    appendMessage('user', question);
    document.getElementById('chat-faq').innerHTML = '';

    const typing = appendMessage('ai typing', '● ● ●');

    try {
        const result = await askAI(question, currentPart?.id || null);
        typing.remove();
        const msg = appendMessage('ai', result.answer || 'Pas de réponse.');
        if (result.source === 'cache') msg.title = 'Réponse depuis le cache FAQ';

        // Rafraîchir la FAQ du menu seulement si la section est visible
        if (result.source !== 'cache') {
            const faqBody = document.querySelector('[data-section="faq"] .menu-section-body');
            if (faqBody?.classList.contains('open')) _refreshMenuFaq();
            else _faqStale = true; // marquer comme périmée → rechargée à la prochaine ouverture
        }
    } catch (e) {
        typing.remove();
        const fallbackAnswer = e.apiResponse?.answer;
        if (fallbackAnswer) {
            appendMessage('ai', fallbackAnswer);
        } else {
            appendMessage('ai error',
                `Erreur IA : ${e.message || 'Vérifiez que le backend PHP est lancé (php -S 127.0.0.1:8000 -t api/) et que MySQL est démarré.'}`
            );
        }
    } finally {
        input.disabled = false;
        document.getElementById('chat-send-btn').disabled = false;
        input.focus();
    }
}

/**
 * Ajoute un message dans le chat.
 * @param {string} type - 'user' | 'ai' | 'ai typing' | 'ai error'
 * @param {string} text
 * @returns {HTMLElement}
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

/** Dictée vocale (Web Speech API). */
function _setupChatMic() {
    const micBtn = document.getElementById('chat-mic-btn');
    const input  = document.getElementById('chat-input');
    if (!micBtn) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.style.display = 'none';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang            = 'fr-FR';
    recognition.continuous      = false;
    recognition.interimResults  = false;

    micBtn.addEventListener('click', () => {
        if (micBtn.classList.contains('recording')) {
            recognition.stop();
        } else {
            try {
                recognition.start();
                micBtn.classList.add('recording');
                input.placeholder = "Écoute en cours...";
            } catch (e) {
                console.error("Microphone error:", e);
            }
        }
    });

    recognition.onresult = (event) => {
        input.value = (input.value + ' ' + event.results[0][0].transcript).trim();
    };

    recognition.onend = () => {
        micBtn.classList.remove('recording');
        input.placeholder = "Posez votre question…";
    };

    recognition.onerror = (e) => {
        console.error("Speech API error:", e.error);
        micBtn.classList.remove('recording');
        input.placeholder = "Erreur micro. Posez votre question…";
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// Menu latéral
// ═════════════════════════════════════════════════════════════════════════════

/** Indique si la FAQ du menu doit être rechargée à la prochaine ouverture. */
let _faqStale = false;

function setupSideMenu(parts) {
    const menu      = document.getElementById('side-menu');
    const backdrop  = document.getElementById('menu-backdrop');
    const toggleBtn = document.getElementById('menu-toggle');
    const closeBtn  = menu.querySelector('.menu-close');

    function openMenu()  {
        menu.classList.add('open');
        backdrop.classList.add('active');
        toggleBtn.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
    }
    function closeMenu() {
        menu.classList.remove('open');
        backdrop.classList.remove('active');
        toggleBtn.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
    }
    _closeMenuRef = closeMenu;

    toggleBtn.addEventListener('click', () => menu.classList.contains('open') ? closeMenu() : openMenu());
    closeBtn.addEventListener('click',  closeMenu);
    backdrop.addEventListener('click',  closeMenu);

    // Accordéon : une seule section ouverte à la fois
    menu.querySelectorAll('.menu-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const body   = header.nextElementSibling;
            const isOpen = body.classList.contains('open');

            menu.querySelectorAll('.menu-section-body').forEach(b => b.classList.remove('open'));
            menu.querySelectorAll('.menu-section-header').forEach(h => h.classList.remove('active'));

            if (!isOpen) {
                body.classList.add('open');
                header.classList.add('active');

                // Recharger la FAQ si elle est périmée ou à chaque ouverture
                if (header.closest('.menu-section')?.dataset.section === 'faq') {
                    _refreshMenuFaq();
                    _faqStale = false;
                }
            }
        });
    });

    _buildPdfLibrary();
    _buildPartsList(parts, closeMenu);
    _refreshMenuFaq();
    _updateAboutSection();
}

function _buildPdfLibrary() {
    const container = document.getElementById('pdf-library');
    const countEl   = document.getElementById('pdf-count');
    if (!container) return;

    let totalDocs = 0;
    const html = docsCatalog.categories.map(cat => {
        totalDocs += cat.docs.length;
        const items = cat.docs.map(doc => `
            <div class="pdf-item" data-file="${doc.file}" data-title="${doc.title}" data-subtitle="${doc.subtitle} — ${doc.pages} pages — ${doc.size}">
                <div class="pdf-item-icon">📄</div>
                <div class="pdf-item-info">
                    <div class="pdf-item-title">${doc.title}</div>
                    <div class="pdf-item-meta">${doc.pages} pages · ${doc.size} · ${doc.lang}</div>
                </div>
                <span class="pdf-item-arrow">›</span>
            </div>
        `).join('');
        return `<div class="pdf-category"><div class="pdf-category-label">${cat.icon} ${cat.label}</div>${items}</div>`;
    }).join('');

    container.innerHTML = html;
    if (countEl) countEl.textContent = totalDocs;

    container.querySelectorAll('.pdf-item').forEach(item => {
        item.addEventListener('click', () =>
            openPdfViewer(item.dataset.file, item.dataset.title, item.dataset.subtitle)
        );
    });
}

function _buildPartsList(parts, closeMenu) {
    const container = document.getElementById('parts-list');
    const countEl   = document.getElementById('parts-count');
    if (!container || !parts?.length) return;

    container.innerHTML = parts.map(p => `
        <div class="part-menu-item" data-id="${p.id}">
            <span class="part-menu-dot"></span>
            <span class="part-menu-name">${p.name_fr || p.name}</span>
            <span class="part-menu-cat">${CATEGORY_LABELS[p.category] || p.category}</span>
        </div>
    `).join('');

    if (countEl) countEl.textContent = parts.length;

    container.querySelectorAll('.part-menu-item').forEach(item => {
        item.addEventListener('click', async () => {
            const part = parts.find(p => p.id === parseInt(item.dataset.id));
            if (!part) return;
            closeMenu();
            await showPartInfo(part, null);
            logInteraction('menu_part_click', part.id, { name: part.name });
        });
    });
}

/**
 * Charge les FAQ récentes depuis l'API et les affiche dans le menu.
 */
async function _refreshMenuFaq() {
    const container = document.getElementById('menu-faq-list');
    if (!container) return;

    try {
        const faqItems = await fetchFaq();
        if (!faqItems?.length) throw new Error('empty');

        container.innerHTML = faqItems.slice(0, 5).map(item => `
            <div class="faq-menu-item" data-question="${item.question}">
                <div class="faq-menu-q">${item.question}</div>
                <div class="faq-menu-a">${item.reponse || item.answer || ''}</div>
            </div>
        `).join('');

        container.querySelectorAll('.faq-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                _closeMenuRef();
                openChat(null);
                setTimeout(() => {
                    const input = document.getElementById('chat-input');
                    if (input) { input.value = item.dataset.question; input.focus(); }
                }, 400);
            });
        });
    } catch {
        container.innerHTML = '<div class="menu-loading">Aucune FAQ disponible.</div>';
    }
}

function _updateAboutSection() {
    const apiRow = document.getElementById('about-api-status');
    const arRow  = document.getElementById('about-ar-status');
    if (apiRow) {
        const s = apiRow.querySelector('strong');
        if (s) { s.textContent = apiOnline ? '✓ En ligne' : '✗ Hors ligne'; s.style.color = apiOnline ? '#22c55e' : '#ef4444'; }
    }
    if (arRow) {
        isXRSupported().then(supported => {
            const s = arRow.querySelector('strong');
            if (s) { s.textContent = supported ? '✓ WebXR disponible' : '✗ Non disponible'; s.style.color = supported ? '#22c55e' : '#f59e0b'; }
        });
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Visionneuse PDF
// ═════════════════════════════════════════════════════════════════════════════

function openPdfViewer(fileUrl, title, subtitle) {
    const viewer  = document.getElementById('pdf-viewer');
    const embed   = document.getElementById('pdf-frame');
    if (!viewer) return;

    document.getElementById('pdf-title').textContent    = title;
    document.getElementById('pdf-subtitle').textContent = subtitle;
    document.getElementById('pdf-download').href = fileUrl;
    document.getElementById('pdf-open-tab').href = fileUrl;

    // Force le rechargement de l'embed entre deux PDFs
    embed.removeAttribute('src');
    requestAnimationFrame(() => { embed.src = fileUrl; });

    viewer.classList.add('open');
    viewer.setAttribute('aria-hidden', 'false');
    document.getElementById('pdf-close').onclick = closePdfViewer;
    document.addEventListener('keydown', _onPdfEscape);
}

function closePdfViewer() {
    const viewer = document.getElementById('pdf-viewer');
    const frame  = document.getElementById('pdf-frame');
    if (!viewer) return;
    viewer.classList.remove('open');
    viewer.setAttribute('aria-hidden', 'true');
    setTimeout(() => { frame.src = ''; }, 400);
    document.removeEventListener('keydown', _onPdfEscape);
}

function _onPdfEscape(e) { if (e.key === 'Escape') closePdfViewer(); }
