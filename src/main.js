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

let currentPart = null;   // composant sélectionné
let chatOpen    = false;  // panneau chat visible
let xrActive    = false;  // session WebXR en cours
let apiOnline   = false;  // backend PHP accessible

// ─── Refs DOM (écran de chargement) ──────────────────────────────────────────

const loadingScreen = document.getElementById('loading-screen');
const loadingBar    = document.getElementById('loading-progress');
const loadingStatus = document.getElementById('loading-status');

/**
 * Met à jour la barre de chargement.
 * @param {number} pct  - Pourcentage 0-100
 * @param {string} text - Texte de statut
 */
function setLoading(pct, text) {
    if (loadingBar)    loadingBar.style.width   = pct + '%';
    if (loadingStatus) loadingStatus.textContent = text;
}

/** Cache l'écran de chargement. */
function hideLoading() {
    if (loadingScreen) loadingScreen.classList.add('hidden');
}

/**
 * Met à jour le badge de statut API (haut gauche).
 * @param {boolean} connected
 */
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

    // ── Données composants (API ou fallback JSON) ──────────────────────────────
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

    // ── Viewer Three.js ────────────────────────────────────────────────────────
    setLoading(60, 'Initialisation viewer 3D...');
    const viewerCanvas = document.getElementById('viewer-canvas');
    initViewer(viewerCanvas, parts, async (part, screenPos) => {
        await showPartInfo(part, screenPos);
        logInteraction('hotspot_click', part.id, { name: part.name });
    });

    // ── Interface ─────────────────────────────────────────────────────────────
    setLoading(80, 'Initialisation interface...');
    setupInfoPanel();
    setupChatPanel();
    setupSideMenu(parts);
    await setupModeToggle();

    // Démarrer en mode Viewer 3D (fond sombre, grille visible)
    setViewerMode(false);

    setLoading(100, 'Prêt !');
    setTimeout(hideLoading, 600);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bascule Viewer 3D / AR WebXR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Configure le bouton de bascule Viewer 3D ↔ AR WebXR.
 * Vérifie la compatibilité WebXR au démarrage :
 *   - Compatible  → bouton "Mode AR" actif
 *   - Non compatible → bouton grisé avec tooltip explicatif
 */
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
            // ── Lancer la session AR ──────────────────────────────────────────
            try {
                btn.textContent         = 'Démarrage AR...';
                btn.style.pointerEvents = 'none';

                await startXRSession(() => {
                    // Robot posé → masquer les instructions, allumer l'indicateur
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
            // ── Quitter la session AR ─────────────────────────────────────────
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

    // Bouton "Quitter AR" dans l'overlay dom-overlay
    document.getElementById('ar-quit-btn')?.addEventListener('click', () => {
        if (xrActive) btn.click();
    });
}

/**
 * Met à jour l'indicateur de statut (bas droite).
 * @param {boolean} active - true = point vert animé
 * @param {string}  text
 */
function _setIndicator(active, text) {
    document.querySelector('.indicator-dot')?.classList.toggle('found', active);
    const s = document.getElementById('marker-status');
    if (s) s.textContent = text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Panneau fiche technique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ferme le panneau fiche technique et réinitialise son positionnement.
 */
function _closeInfoPanel() {
    const panel = document.getElementById('info-panel');
    panel.classList.remove('active', 'contextual', 'expanded');
    panel.style.maxHeight = '';
    // Effacer les inline styles éventuellement posés par _positionPanel ou drag
    panel.style.left            = '';
    panel.style.top             = '';
    panel.style.right           = '';
    panel.style.transformOrigin = '';
    currentPart = null;
    clearMeshSelection();
    // En mode AR : réafficher le viseur quand on ferme la fiche technique
    if (xrActive) {
        const crosshair = document.getElementById('ar-crosshair');
        if (crosshair) crosshair.style.display = 'block';
    }
}

/**
 * Positionne le panneau sur le côté droit de l'écran (ne recouvre pas le robot).
 * Sur desktop (largeur > 768 px) uniquement.
 */
function _positionPanel() {
    const panel   = document.getElementById('info-panel');
    const PANEL_W = 340;
    const MARGIN  = 20;

    // Toujours à droite de l'écran, centré verticalement
    const x = window.innerWidth - PANEL_W - MARGIN;
    const y = MARGIN + 40; // un peu sous le bouton AR

    panel.style.left            = x + 'px';
    panel.style.top             = y + 'px';
    panel.style.right           = '';
    panel.style.transformOrigin = 'right center';
    panel.classList.add('contextual');
}

/**
 * Branche la poignée de glissement (drag handle) du panneau bottom-sheet.
 * Actif uniquement sur mobile (max-width 768px).
 *
 * Comportement :
 *   - Glisser vers le haut  → agrandit le panneau (jusqu'à 88vh)
 *   - Glisser vers le bas   → réduit le panneau  (jusqu'à 25vh)
 *   - La fermeture se fait uniquement via le bouton ✕
 *   - La taille est conservée à l'endroit où l'utilisateur relâche
 */
function _setupDragHandle() {
    const panel  = document.getElementById('info-panel');
    const handle = panel.querySelector('.drag-handle');
    if (!handle) return;

    const MIN_VH = 25;   // hauteur minimale en vh
    const MAX_VH = 88;   // hauteur maximale en vh

    let startY       = 0;
    let startHeightPx = 0;
    let dragging     = false;

    handle.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768) return;
        dragging      = true;
        startY        = e.touches[0].clientY;
        // Lire la hauteur actuelle réelle du panneau
        startHeightPx = panel.getBoundingClientRect().height;
        panel.classList.add('dragging');
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
        if (!dragging || window.innerWidth > 768) return;
        const deltaY  = e.touches[0].clientY - startY;
        // Glisser vers le haut (deltaY < 0) → agrandit, vers le bas → réduit
        const newHeightPx = startHeightPx - deltaY;
        const minPx = (MIN_VH / 100) * window.innerHeight;
        const maxPx = (MAX_VH / 100) * window.innerHeight;
        panel.style.maxHeight = Math.min(maxPx, Math.max(minPx, newHeightPx)) + 'px';
    }, { passive: true });

    const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        panel.classList.remove('dragging');
        // Pas de snap : on conserve la maxHeight là où l'utilisateur a relâché
    };
    handle.addEventListener('touchend',    onEnd);
    handle.addEventListener('touchcancel', onEnd);
}

/** Branche les événements du panneau fiche technique. */
function setupInfoPanel() {
    document.querySelector('#info-panel .close-btn').addEventListener('click', () => {
        _closeInfoPanel();
    });

    // ── Drag handle : bottom-sheet mobile ─────────────────────────────────────
    _setupDragHandle();

    // ── Drag souris desktop : déplacement libre du panneau ────────────────────
    _setupPanelDrag();

    document.querySelectorAll('#info-panel .tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('#info-panel .tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('#info-panel .tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    document.getElementById('ask-ai-btn').addEventListener('click', () => {
        openChat(currentPart?.id);
    });
}

/**
 * Permet de déplacer le panneau en maintenant le clic souris sur le header.
 * Actif sur desktop (écran > 768 px).
 */
function _setupPanelDrag() {
    const panel  = document.getElementById('info-panel');
    const header = panel.querySelector('.panel-header');
    if (!header) return;

    let dragging  = false;
    let offsetX   = 0;
    let offsetY   = 0;

    header.style.cursor = 'grab';

    header.addEventListener('mousedown', (e) => {
        if (window.innerWidth <= 768) return;
        // Ne pas déclencher si clic sur le bouton fermer
        if (e.target.closest('.close-btn')) return;

        dragging = true;
        const rect = panel.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        header.style.cursor = 'grabbing';
        panel.style.transition = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth  - 100));
        const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - 100));
        panel.style.left = x + 'px';
        panel.style.top  = y + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        header.style.cursor = 'grab';
        panel.style.transition = '';
    });
}

/**
 * Remplit et affiche le panneau fiche technique pour un composant.
 * Sur desktop, positionne le panneau près du hotspot cliqué (coordonnées écran).
 *
 * @param {Object}                     part      - données minimales du composant
 * @param {{ x: number, y: number }|null} screenPos - position écran du hotspot (null = défaut gauche)
 */
async function showPartInfo(part, screenPos = null) {
    const panel = document.getElementById('info-panel');
    const isAlreadyActive = panel.classList.contains('active');

    if (isAlreadyActive && currentPart && currentPart.id !== part.id) {
        panel.classList.remove('active');
        await new Promise(r => setTimeout(r, 350));
    }

    currentPart = part;

    let fullPart = part;
    if (apiOnline) {
        try {
            const fetched = await fetchPart(part.id);
            if (fetched && !fetched.status) fullPart = fetched;
        } catch { /* utiliser les données locales */ }
    }

    document.getElementById('panel-title').textContent       = fullPart.name_fr || fullPart.name;
    document.getElementById('panel-category').textContent    = _formatCategory(fullPart.category);
    document.getElementById('panel-description').textContent = fullPart.description || '';

    // Onglet Specs
    const specs = typeof fullPart.specs === 'string'
        ? JSON.parse(fullPart.specs)
        : (fullPart.specs || {});

    document.getElementById('specs-table').innerHTML = Object.entries(specs)
        .map(([k, v]) => `<tr><td class="spec-key">${k.replace(/_/g, ' ')}</td><td class="spec-val">${v}</td></tr>`)
        .join('');

    // Onglet Documents
    const docs = fullPart.documents || [];
    const docIcons = {
        'Principe de fonctionnement et Architecture': 'auto_stories',
        'Directives d\'Installation & Câblage': 'build',
        'Sécurité et Fonctions PFL': 'gpp_maybe',
        'Recommandations de Maintenance': 'engineering'
    };
    document.getElementById('docs-list').innerHTML = docs.length
        ? docs.map(d => {
            const icon = docIcons[d.title] || 'description';
            return `
            <div class="doc-card">
                <div class="doc-header">
                    <span class="doc-icon material-icons-outlined">${icon}</span>
                    <span class="doc-title">${d.title}</span>
                </div>
                <div class="doc-content">${d.content || ''}</div>
            </div>`;
        }).join('')
        : '<p style="color:rgba(255,255,255,0.3);text-align:center;padding:20px 0">Aucun document disponible.</p>';

    // Onglet Maintenance
    const maintenanceDoc = docs.find(d => d.title && d.title.toLowerCase().includes('maintenance'));
    document.getElementById('maintenance-info').innerHTML = maintenanceDoc
        ? `<div class="doc-card">
            <div class="doc-header">
                <span class="doc-icon material-icons-outlined">engineering</span>
                <span class="doc-title">${maintenanceDoc.title}</span>
            </div>
            <div class="doc-content">${maintenanceDoc.content}</div>
           </div>`
        : '<p style="color:rgba(255,255,255,0.3);text-align:center;padding:20px 0">Aucune donnée de maintenance.</p>';

    // Revenir à l'onglet Général
    document.querySelectorAll('#info-panel .tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#info-panel .tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('#info-panel .tab[data-tab="general"]').classList.add('active');
    document.getElementById('tab-general').classList.add('active');

    // ── Positionnement contextuel (desktop uniquement) ────────────────────────
    // Sur mobile (≤768 px) la fiche remonte depuis le bas (CSS) — pas de repositionnement JS.
    panel.classList.remove('contextual');    // reset d'une éventuelle ouverture précédente
    panel.style.left = panel.style.top = panel.style.right = panel.style.transformOrigin = '';

    if (window.innerWidth > 768) {
        _positionPanel();
    }

    requestAnimationFrame(() => {
        panel.classList.add('active');
    });

    // ── Animation caméra : zoom sur la partie sélectionnée ─────────────────────
    if (!xrActive) {
        focusOnPart(fullPart);
    }

    // En mode AR : masquer le viseur pendant que la fiche est ouverte
    if (xrActive) {
        const crosshair = document.getElementById('ar-crosshair');
        if (crosshair) crosshair.style.display = 'none';
    }
}

/**
 * Formate un identifiant de catégorie en libellé lisible.
 * @param {string} cat
 * @returns {string}
 */
function _formatCategory(cat) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Panneau chat / assistant IA
// ─────────────────────────────────────────────────────────────────────────────

/** Branche les événements du panneau chat. */
function setupChatPanel() {
    document.getElementById('chat-toggle').addEventListener('click', () => {
        chatOpen ? closeChat() : openChat();
    });

    document.querySelector('#chat-panel .chat-header button').addEventListener('click', closeChat);

    document.getElementById('chat-input').addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
    });

    document.getElementById('chat-send-btn').addEventListener('click', sendQuestion);

    _setupChatMic();
}

/**
 * Ouvre le panneau chat avec les FAQ suggérées.
 * @param {number|null} partId - contexte du composant actif (null = général)
 */
async function openChat(partId = null) {
    chatOpen = true;
    
    // Fermer l'info panel s'il est ouvert
    _closeInfoPanel();
    
    document.getElementById('chat-panel').classList.add('active');
    document.getElementById('chat-toggle').classList.add('hidden');

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
                        f.question.length > 60
                            ? f.question.substring(0, 57) + '...'
                            : f.question
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

/** Ferme le panneau chat. */
function closeChat() {
    chatOpen = false;
    document.getElementById('chat-panel').classList.remove('active');
    document.getElementById('chat-toggle').classList.remove('hidden');
}

/**
 * Envoie la question à l'assistant IA et affiche la réponse.
 */
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
    } catch (e) {
        typing.remove();
        // Si le backend a renvoyé une réponse "answer" malgré l'erreur, l'afficher
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


/** Initialise la Web Speech API pour dicter aux micro. */
function _setupChatMic() {
    const micBtn = document.getElementById('chat-mic-btn');
    const input = document.getElementById('chat-input');
    if (!micBtn) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.style.display = 'none'; // Cacher le micro si non supporté par le navigateur
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = false;
    recognition.interimResults = false;

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
        const transcript = event.results[0][0].transcript;
        input.value = (input.value + ' ' + transcript).trim();
        // Modification : le texte est juste inséré, on attend que l'utilisateur valide (Enter/Bouton Envoyer)
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
// Menu latéral — Documentation, Composants, FAQ, À propos
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Initialise le menu latéral : accordéon, hamburger, PDF, composants, FAQ.
 * @param {Array} parts - liste des composants du robot
 */
function setupSideMenu(parts) {
    const menu      = document.getElementById('side-menu');
    const backdrop  = document.getElementById('menu-backdrop');
    const toggleBtn = document.getElementById('menu-toggle');
    const closeBtn  = menu.querySelector('.menu-close');

    // ── Ouvrir / fermer ──────────────────────────────────────────────────────
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

    toggleBtn.addEventListener('click', () =>
        menu.classList.contains('open') ? closeMenu() : openMenu()
    );
    closeBtn.addEventListener('click',  closeMenu);
    backdrop.addEventListener('click',  closeMenu);

    // ── Accordéon sections ───────────────────────────────────────────────────
    menu.querySelectorAll('.menu-section-header').forEach(header => {
        header.addEventListener('click', () => {
            const body   = header.nextElementSibling;
            const isOpen = body.classList.contains('open');
            // Ferme toutes les sections ouvertes
            menu.querySelectorAll('.menu-section-body').forEach(b => b.classList.remove('open'));
            menu.querySelectorAll('.menu-section-header').forEach(h => h.classList.remove('active'));
            // Ouvre celle-ci si elle était fermée
            if (!isOpen) {
                body.classList.add('open');
                header.classList.add('active');
            }
        });
    });

    // ── Remplir les sections ─────────────────────────────────────────────────
    _buildPdfLibrary();
    _buildPartsList(parts, closeMenu);
    _buildMenuFaq(closeMenu);
    _updateAboutSection();
}

/**
 * Construit la bibliothèque PDF depuis le catalogue JSON.
 */
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

/**
 * Construit la liste des composants du robot dans le menu.
 * @param {Array}    parts     - composants
 * @param {Function} closeMenu - ferme le menu latéral
 */
function _buildPartsList(parts, closeMenu) {
    const container = document.getElementById('parts-list');
    const countEl   = document.getElementById('parts-count');
    if (!container || !parts?.length) return;

    const catLabels = {
        identification:   'Identification',
        alimentation:     'Alimentation',
        raccordement:     'Raccordement',
        installation:     'Installation',
        maintenance:      'Maintenance',
        pieces_detachees: 'Pièces détachées',
    };

    container.innerHTML = parts.map(p => `
        <div class="part-menu-item" data-id="${p.id}">
            <span class="part-menu-dot"></span>
            <span class="part-menu-name">${p.name_fr || p.name}</span>
            <span class="part-menu-cat">${catLabels[p.category] || p.category}</span>
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
 * @param {Function} closeMenu - ferme le menu après clic
 */
async function _buildMenuFaq(closeMenu) {
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
                closeMenu();
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

/**
 * Met à jour la section "À propos" avec le statut API et AR.
 */
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

/**
 * Ouvre la visionneuse PDF plein écran.
 * @param {string} fileUrl  - chemin du PDF (ex: /docs/UR5e_Manual.pdf)
 * @param {string} title    - titre dans l'en-tête
 * @param {string} subtitle - sous-titre (pages, taille…)
 */
function openPdfViewer(fileUrl, title, subtitle) {
    const viewer  = document.getElementById('pdf-viewer');
    const embed   = document.getElementById('pdf-frame');
    const titleEl = document.getElementById('pdf-title');
    const subEl   = document.getElementById('pdf-subtitle');
    const dlLink  = document.getElementById('pdf-download');
    const tabLink = document.getElementById('pdf-open-tab');
    if (!viewer) return;

    titleEl.textContent = title;
    subEl.textContent   = subtitle;
    dlLink.href  = fileUrl;
    tabLink.href = fileUrl;

    // Réinitialise l'embed avant de charger le nouveau PDF
    embed.removeAttribute('src');
    // Petit délai pour que le browser recharge bien l'embed
    requestAnimationFrame(() => { embed.src = fileUrl; });

    viewer.classList.add('open');
    viewer.setAttribute('aria-hidden', 'false');
    document.getElementById('pdf-close').onclick = closePdfViewer;
    document.addEventListener('keydown', _onPdfEscape);
}

/** Ferme la visionneuse PDF. */
function closePdfViewer() {
    const viewer = document.getElementById('pdf-viewer');
    const frame  = document.getElementById('pdf-frame');
    if (!viewer) return;
    viewer.classList.remove('open');
    viewer.setAttribute('aria-hidden', 'true');
    setTimeout(() => { frame.src = ''; }, 400);
    document.removeEventListener('keydown', _onPdfEscape);
}

/** Ferme la visionneuse avec la touche Échap. */
function _onPdfEscape(e) { if (e.key === 'Escape') closePdfViewer(); }
