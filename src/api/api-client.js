// API Client for MARA backend
const API_URL = '/api/api.php';

/**
 * Gere la reponse HTTP : verifie le status et parse le JSON.
 * Leve une erreur explicite en cas de probleme reseau ou backend.
 */
async function handleResponse(res) {
    // Lire le body une seule fois
    let body;
    try {
        body = await res.json();
    } catch (e) {
        // Le backend a renvoyé du non-JSON (crash PHP, 502 proxy, etc.)
        throw new Error(
            res.status === 502
                ? 'Backend PHP indisponible. Lancez : php -S 127.0.0.1:8000 -t api/'
                : `Réponse invalide du serveur (HTTP ${res.status})`
        );
    }

    // Le backend renvoie du JSON meme en cas d'erreur (status: "error")
    if (!res.ok) {
        const message = body?.message || body?.answer || `Erreur API (HTTP ${res.status})`;
        const err = new Error(message);
        err.apiResponse = body;   // garder la réponse pour récupérer "answer" si présent
        throw err;
    }

    return body;
}

export async function fetchParts() {
    const res = await fetch(`${API_URL}?action=get_parts`);
    return handleResponse(res);
}

export async function fetchPart(id) {
    const res = await fetch(`${API_URL}?action=get_part&id=${id}`);
    return handleResponse(res);
}

export async function fetchDocs(partId) {
    const res = await fetch(`${API_URL}?action=get_docs&part_id=${partId}`);
    return handleResponse(res);
}

export async function fetchFaq(partId = null) {
    const url = partId ? `${API_URL}?action=get_faq&part_id=${partId}` : `${API_URL}?action=get_faq`;
    const res = await fetch(url);
    return handleResponse(res);
}

export async function askAI(question, partId = null) {
    let res;
    try {
        res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'ask_ai', question, part_id: partId })
        });
    } catch (networkErr) {
        throw new Error('Impossible de contacter le backend. Vérifiez que le serveur PHP est lancé.');
    }

    const body = await handleResponse(res);

    // Le backend peut renvoyer status 200 + status:"error" (ex: cache miss fallback)
    if (body.status === 'error') {
        const err = new Error(body.message || "Erreur de l'assistant IA");
        err.apiResponse = body;
        throw err;
    }

    return body;
}

export async function logInteraction(actionType, partId = null, metadata = {}) {
    // Fire-and-forget : ne jamais casser le frontend pour un log
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'log_interaction', action_type: actionType, part_id: partId, metadata })
        });
    } catch (e) {
        // silently ignore
    }
}
