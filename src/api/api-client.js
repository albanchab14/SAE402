// API Client for MARA backend
// Tous les appels passent par /api → proxy Vite → localhost:8000
const API_URL = '/api/api.php';

/**
 * Wrapper fetch avec timeout automatique (3 secondes par defaut).
 * Jette une erreur si le serveur ne repond pas a temps → le code appelant
 * peut basculer sur les donnees locales sans bloquer le chargement.
 * @param {string} url
 * @param {RequestInit} [options]
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, options = {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}

/**
 * Recupere la liste de tous les composants du robot.
 * @returns {Promise<Array>}
 */
export async function fetchParts() {
    const res = await fetchWithTimeout(`${API_URL}?action=get_parts`);
    return res.json();
}

/**
 * Recupere les details d'un composant (specs + documents).
 * @param {number} id
 * @returns {Promise<Object>}
 */
export async function fetchPart(id) {
    const res = await fetchWithTimeout(`${API_URL}?action=get_part&id=${id}`);
    return res.json();
}

/**
 * Recupere les documents lies a un composant.
 * @param {number} partId
 * @returns {Promise<Array>}
 */
export async function fetchDocs(partId) {
    const res = await fetchWithTimeout(`${API_URL}?action=get_docs&part_id=${partId}`);
    return res.json();
}

/**
 * Recupere les questions/reponses FAQ.
 * @param {number|null} partId - filtre optionnel par composant
 * @returns {Promise<Array>}
 */
export async function fetchFaq(partId = null) {
    const url = partId
        ? `${API_URL}?action=get_faq&part_id=${partId}`
        : `${API_URL}?action=get_faq`;
    const res = await fetchWithTimeout(url);
    return res.json();
}

/**
 * Envoie une question à l'assistant IA Gemini (via le backend PHP).
 * Lance une erreur enrichie si le backend ou Gemini retourne une erreur,
 * avec `.apiResponse` contenant la réponse parsée (pour afficher answer si dispo).
 *
 * @param {string}      question
 * @param {number|null} partId - contexte du composant actif
 * @returns {Promise<{status: string, answer: string, source: string}>}
 */
export async function askAI(question, partId = null) {
    let res;
    try {
        res = await fetchWithTimeout(API_URL, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ action: 'ask_ai', question, part_id: partId })
        }, 20000); // 20 s pour Gemini
    } catch (networkErr) {
        // Timeout ou pas de réseau → backend PHP probablement arrêté
        const err = new Error('Backend PHP injoignable. Lancez : php -S 127.0.0.1:8000 -t api/');
        err.code = 'NETWORK';
        throw err;
    }

    // Parser le JSON quelle que soit la réponse (le PHP renvoie toujours du JSON)
    let data;
    try {
        data = await res.json();
    } catch {
        const err = new Error('Réponse invalide du serveur (pas du JSON).');
        err.code = 'PARSE';
        throw err;
    }

    // Si le PHP a signalé une erreur, propager avec les détails
    if (data.status === 'error') {
        const err = new Error(data.message || 'Erreur inconnue du backend.');
        err.code        = 'API_ERROR';
        err.apiResponse = data; // contient parfois data.answer (message utilisateur lisible)
        throw err;
    }

    return data;
}

/**
 * Enregistre une interaction utilisateur (fire-and-forget, pas de timeout critique).
 * @param {string} actionType
 * @param {number|null} partId
 * @param {Object} metadata
 */
export async function logInteraction(actionType, partId = null, metadata = {}) {
    fetch(API_URL, {
        method : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body   : JSON.stringify({ action: 'log_interaction', action_type: actionType, part_id: partId, metadata })
    }).catch(() => {});
}
