// API Client for MARA backend
const API_URL = '/api/api.php';

export async function fetchParts() {
    const res = await fetch(`${API_URL}?action=get_parts`);
    return res.json();
}

export async function fetchPart(id) {
    const res = await fetch(`${API_URL}?action=get_part&id=${id}`);
    return res.json();
}

export async function fetchDocs(partId) {
    const res = await fetch(`${API_URL}?action=get_docs&part_id=${partId}`);
    return res.json();
}

export async function fetchFaq(partId = null) {
    const url = partId ? `${API_URL}?action=get_faq&part_id=${partId}` : `${API_URL}?action=get_faq`;
    const res = await fetch(url);
    return res.json();
}

export async function askAI(question, partId = null) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ask_ai', question, part_id: partId })
    });
    return res.json();
}

export async function logInteraction(actionType, partId = null, metadata = {}) {
    fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_interaction', action_type: actionType, part_id: partId, metadata })
    }).catch(() => {});
}
