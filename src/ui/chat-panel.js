import { askAI, fetchFaq } from '../api/api-client.js';

// AI Chat panel for asking questions about the robot
export class ChatPanel {
    constructor() {
        this.panel = document.getElementById('chat-panel');
        this.currentPartId = null;
        this.isOpen = false;
        this._build();
    }

    _build() {
        this.panel.innerHTML = `
            <div class="chat-header">
                <span class="chat-title">Assistant IA - UR5e</span>
                <span class="chat-close" id="chat-close">&times;</span>
            </div>
            <div class="chat-context" id="chat-context"></div>
            <div class="chat-messages" id="chat-messages"></div>
            <div class="chat-faq" id="chat-faq"></div>
            <div class="chat-input-row">
                <input type="text" id="chat-input" placeholder="Posez votre question..." autocomplete="off">
                <button id="chat-send">&#10148;</button>
            </div>
        `;

        document.getElementById('chat-close').addEventListener('click', () => this.hide());
        document.getElementById('chat-send').addEventListener('click', () => this._send());
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._send();
        });

        // Floating toggle button
        this.toggleBtn = document.getElementById('chat-toggle');
        this.toggleBtn.addEventListener('click', () => {
            if (this.isOpen) this.hide();
            else this.show();
        });
    }

    async show(partId = null) {
        if (partId) this.currentPartId = partId;
        this.isOpen = true;
        this.panel.classList.add('active');
        this.toggleBtn.classList.add('hidden');

        // Show context
        const ctx = document.getElementById('chat-context');
        ctx.textContent = this.currentPartId ? `Contexte : Composant #${this.currentPartId}` : 'Contexte : General UR5e';

        // Load FAQ suggestions
        await this._loadFaq();

        document.getElementById('chat-input').focus();
    }

    hide() {
        this.isOpen = false;
        this.panel.classList.remove('active');
        this.toggleBtn.classList.remove('hidden');
    }

    setPartContext(partId) {
        this.currentPartId = partId;
        if (this.isOpen) {
            const ctx = document.getElementById('chat-context');
            ctx.textContent = `Contexte : Composant #${partId}`;
        }
    }

    async _loadFaq() {
        const faqContainer = document.getElementById('chat-faq');
        try {
            const faqs = await fetchFaq(this.currentPartId);
            if (faqs.length > 0) {
                faqContainer.innerHTML = '<div class="faq-label">Questions frequentes :</div>' +
                    faqs.slice(0, 3).map(f =>
                        `<button class="faq-btn" data-q="${f.question.replace(/"/g, '&quot;')}">${f.question.length > 60 ? f.question.substring(0, 57) + '...' : f.question}</button>`
                    ).join('');
                faqContainer.querySelectorAll('.faq-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.getElementById('chat-input').value = btn.dataset.q;
                        this._send();
                    });
                });
            } else {
                faqContainer.innerHTML = '';
            }
        } catch (e) {
            faqContainer.innerHTML = '';
        }
    }

    async _send() {
        const input = document.getElementById('chat-input');
        const question = input.value.trim();
        if (!question) return;

        input.value = '';
        this._addMessage(question, 'user');

        // Hide FAQ after first question
        document.getElementById('chat-faq').innerHTML = '';

        // Show typing indicator
        const typingId = this._addMessage('...', 'ai typing');

        try {
            const result = await askAI(question, this.currentPartId);
            this._removeMessage(typingId);
            this._addMessage(result.answer || 'Pas de reponse.', 'ai');
        } catch (e) {
            this._removeMessage(typingId);
            this._addMessage('Erreur de connexion avec l\'assistant IA.', 'ai error');
        }
    }

    _addMessage(text, type) {
        const messages = document.getElementById('chat-messages');
        const msg = document.createElement('div');
        const id = 'msg-' + Date.now();
        msg.id = id;
        msg.className = `chat-msg ${type}`;
        msg.textContent = text;
        messages.appendChild(msg);
        messages.scrollTop = messages.scrollHeight;
        return id;
    }

    _removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }
}
