/**
 * admin-assistant.js — Floating AI chat widget for the admin backend
 *
 * Injects a blue chat bubble at the bottom-right of every admin page.
 * Click to open a panel with full conversation history, sends messages
 * to /api/assistant/chat, and persists every exchange server-side.
 */
(function() {
    // Inject styles once
    if (document.getElementById('ai-asst-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-asst-styles';
    style.textContent = `
        .ai-asst-bubble {
            position: fixed; bottom: 24px; right: 24px; width: 56px; height: 56px;
            border-radius: 50%; background: linear-gradient(135deg, #1d6df2 0%, #2563eb 100%);
            box-shadow: 0 10px 25px rgba(29,109,242,0.4), 0 2px 6px rgba(0,0,0,0.15);
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; z-index: 9998; border: none;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .ai-asst-bubble:hover { transform: scale(1.07); box-shadow: 0 12px 30px rgba(29,109,242,0.5), 0 2px 8px rgba(0,0,0,0.2); }
        .ai-asst-bubble svg { color: #fff; }

        .ai-asst-panel {
            position: fixed; bottom: 96px; right: 24px;
            width: 420px; height: 600px; max-height: calc(100vh - 120px);
            background: #fff; border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.1);
            display: none; flex-direction: column;
            z-index: 9999; overflow: hidden;
            font-family: 'Inter', sans-serif;
            animation: ai-panel-fade 0.2s ease-out;
        }
        .ai-asst-panel.open { display: flex; }
        @keyframes ai-panel-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .ai-asst-hdr { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
        .ai-asst-hdr-title { display: flex; align-items: center; gap: 0.6rem; color: #fff; }
        .ai-asst-hdr-title svg { flex-shrink: 0; }
        .ai-asst-hdr-title h3 { margin: 0; font-size: 0.95rem; font-weight: 700; }
        .ai-asst-hdr-title p  { margin: 0; font-size: 0.72rem; color: #94a3b8; }
        .ai-asst-hdr-btns { display: flex; gap: 0.25rem; }
        .ai-asst-icon-btn { background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; padding: 0.35rem; border-radius: 6px; font-size: 0; line-height: 0; }
        .ai-asst-icon-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

        .ai-asst-body { flex: 1; overflow-y: auto; padding: 1.25rem; background: #f7f9fa; display: flex; flex-direction: column; gap: 0.75rem; }
        .ai-asst-empty { text-align: center; padding: 2.5rem 1rem; color: #718096; }
        .ai-asst-empty svg { color: #cbd5e0; margin-bottom: 1rem; }
        .ai-asst-empty h4 { margin: 0 0 0.5rem; font-size: 1rem; color: #2d3748; }
        .ai-asst-empty p  { margin: 0 0 1.25rem; font-size: 0.85rem; line-height: 1.5; }
        .ai-asst-suggest { display: flex; flex-direction: column; gap: 0.4rem; }
        .ai-asst-suggest button {
            border: 1px solid #e2e8f0; background: #fff; border-radius: 8px;
            padding: 0.6rem 0.85rem; font-size: 0.82rem; color: #2d3748;
            cursor: pointer; font-family: inherit; text-align: left;
            transition: border-color 0.15s, color 0.15s;
        }
        .ai-asst-suggest button:hover { border-color: #1d6df2; color: #1d6df2; }

        .ai-asst-msg { max-width: 85%; padding: 0.7rem 0.95rem; border-radius: 14px; font-size: 0.88rem; line-height: 1.5; word-wrap: break-word; }
        .ai-asst-msg.user { background: #1d6df2; color: #fff; align-self: flex-end; border-bottom-right-radius: 4px; }
        .ai-asst-msg.assistant { background: #fff; color: #1a202c; align-self: flex-start; border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; }
        .ai-asst-msg p { margin: 0 0 0.5rem; }
        .ai-asst-msg p:last-child { margin: 0; }
        .ai-asst-msg pre { background: #0f172a; color: #e2e8f0; padding: 0.75rem; border-radius: 6px; font-size: 0.78rem; overflow-x: auto; margin: 0.5rem 0; }
        .ai-asst-msg code { background: rgba(0,0,0,0.05); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.85em; }
        .ai-asst-msg.user code { background: rgba(255,255,255,0.18); color: #fff; }
        .ai-asst-msg h2, .ai-asst-msg h3 { margin: 0.75rem 0 0.4rem; font-size: 0.95rem; font-weight: 700; }
        .ai-asst-msg ul, .ai-asst-msg ol { margin: 0.25rem 0 0.5rem; padding-left: 1.25rem; }
        .ai-asst-msg li { margin-bottom: 0.2rem; }
        .ai-asst-msg a { color: inherit; text-decoration: underline; }

        .ai-asst-typing { display: inline-flex; gap: 4px; align-self: flex-start; padding: 0.7rem 0.95rem; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; }
        .ai-asst-typing span { width: 7px; height: 7px; background: #cbd5e0; border-radius: 50%; animation: ai-dot 1.3s infinite ease-in-out; }
        .ai-asst-typing span:nth-child(2) { animation-delay: 0.2s; }
        .ai-asst-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes ai-dot { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1); } }

        .ai-asst-input-wrap { border-top: 1px solid #edf2f7; padding: 0.85rem; background: #fff; }
        .ai-asst-input-row { display: flex; gap: 0.5rem; align-items: flex-end; }
        .ai-asst-input {
            flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; resize: none;
            padding: 0.65rem 0.85rem; font-family: inherit; font-size: 0.88rem;
            color: #1a202c; max-height: 120px; min-height: 40px; outline: none;
            transition: border-color 0.15s;
        }
        .ai-asst-input:focus { border-color: #1d6df2; box-shadow: 0 0 0 3px rgba(29,109,242,0.1); }
        .ai-asst-send {
            width: 40px; height: 40px; border-radius: 10px; border: none;
            background: #1d6df2; color: #fff; cursor: pointer; flex-shrink: 0;
            display: flex; align-items: center; justify-content: center;
            transition: opacity 0.15s;
        }
        .ai-asst-send:hover { opacity: 0.9; }
        .ai-asst-send:disabled { opacity: 0.4; cursor: not-allowed; }
        .ai-asst-hint { font-size: 0.68rem; color: #a0aec0; margin-top: 0.4rem; text-align: center; }

        @media (max-width: 520px) {
            .ai-asst-panel { width: calc(100vw - 32px); right: 16px; bottom: 88px; height: calc(100vh - 120px); }
            .ai-asst-bubble { right: 16px; bottom: 16px; }
        }
    `;
    document.head.appendChild(style);

    // ── Inject DOM ────────────────────────────────────────────────────────
    const bubble = document.createElement('button');
    bubble.className = 'ai-asst-bubble';
    bubble.setAttribute('aria-label', 'Open AI assistant');
    bubble.innerHTML = `
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <circle cx="9" cy="10" r="1" fill="currentColor"></circle>
            <circle cx="15" cy="10" r="1" fill="currentColor"></circle>
        </svg>`;

    const panel = document.createElement('div');
    panel.className = 'ai-asst-panel';
    panel.innerHTML = `
        <div class="ai-asst-hdr">
            <div class="ai-asst-hdr-title">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z"></path><path d="M19 11a7 7 0 0 1-14 0"></path><line x1="12" y1="18" x2="12" y2="22"></line><line x1="8" y1="22" x2="16" y2="22"></line></svg>
                <div>
                    <h3>MNLH Assistant</h3>
                    <p>Powered by GPT</p>
                </div>
            </div>
            <div class="ai-asst-hdr-btns">
                <button class="ai-asst-icon-btn" id="ai-asst-clear" title="Clear conversation" aria-label="Clear conversation">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"></path></svg>
                </button>
                <button class="ai-asst-icon-btn" id="ai-asst-close" title="Close" aria-label="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div class="ai-asst-body" id="ai-asst-body"></div>
        <div class="ai-asst-input-wrap">
            <div class="ai-asst-input-row">
                <textarea class="ai-asst-input" id="ai-asst-input" placeholder="Ask me anything…" rows="1"></textarea>
                <button class="ai-asst-send" id="ai-asst-send" aria-label="Send">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </div>
            <div class="ai-asst-hint">Enter to send · Shift+Enter for newline</div>
        </div>
    `;

    document.body.appendChild(bubble);
    document.body.appendChild(panel);

    const bodyEl  = document.getElementById('ai-asst-body');
    const inputEl = document.getElementById('ai-asst-input');
    const sendBtn = document.getElementById('ai-asst-send');
    const closeBtn = document.getElementById('ai-asst-close');
    const clearBtn = document.getElementById('ai-asst-clear');

    let history = [];
    let isSending = false;

    // ── Basic markdown-ish rendering (headings, bold, code, lists, links) ─
    function renderContent(text) {
        const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Code fences first, protect content from further processing
        const codeBlocks = [];
        text = text.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, lang, code) => {
            codeBlocks.push(`<pre><code>${esc(code.trim())}</code></pre>`);
            return `\x00CODE${codeBlocks.length - 1}\x00`;
        });

        text = esc(text);
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        text = text.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        text = text.replace(/^## (.+)$/gm, '<h2>$1</h2>');

        // Lists (very lightweight)
        text = text.replace(/(?:^[-*] .+(?:\n|$))+/gm, (m) => {
            const items = m.trim().split('\n').map(l => `<li>${l.replace(/^[-*] /, '')}</li>`).join('');
            return `<ul>${items}</ul>`;
        });
        text = text.replace(/(?:^\d+\. .+(?:\n|$))+/gm, (m) => {
            const items = m.trim().split('\n').map(l => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('');
            return `<ol>${items}</ol>`;
        });

        // Paragraphs
        text = text.split(/\n{2,}/).map(p => {
            const t = p.trim();
            if (!t) return '';
            if (/^<(h\d|ul|ol|pre)/.test(t)) return t;
            return `<p>${t.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        // Restore code blocks
        text = text.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[+i]);

        return text;
    }

    function appendMessage(role, content) {
        const div = document.createElement('div');
        div.className = `ai-asst-msg ${role}`;
        div.innerHTML = renderContent(content);
        bodyEl.appendChild(div);
        bodyEl.scrollTop = bodyEl.scrollHeight;
        return div;
    }

    function appendTyping() {
        const div = document.createElement('div');
        div.className = 'ai-asst-typing';
        div.id = 'ai-asst-typing';
        div.innerHTML = '<span></span><span></span><span></span>';
        bodyEl.appendChild(div);
        bodyEl.scrollTop = bodyEl.scrollHeight;
    }
    function removeTyping() {
        const el = document.getElementById('ai-asst-typing');
        if (el) el.remove();
    }

    function renderEmpty() {
        bodyEl.innerHTML = `
            <div class="ai-asst-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a5 5 0 0 1 5 5v2a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z"></path>
                    <path d="M19 11a7 7 0 0 1-14 0"></path>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="8" y1="22" x2="16" y2="22"></line>
                </svg>
                <h4>How can I help?</h4>
                <p>Ask me to draft copy, explain a feature, debug something, or write a quick email to a lead.</p>
                <div class="ai-asst-suggest">
                    <button data-suggest="Write a bio for a new featured agent named Jessica Lindqvist who specializes in Lake Minnetonka luxury waterfront.">Draft an agent bio</button>
                    <button data-suggest="How do I change an agent's membership tier in the admin?">Admin how-to</button>
                    <button data-suggest="Write a warm follow-up email to a buyer lead who went quiet after a showing.">Follow-up email</button>
                    <button data-suggest="Suggest a blog post idea I should publish next for SEO on Minnesota lake homes.">Blog idea</button>
                </div>
            </div>`;
        bodyEl.querySelectorAll('.ai-asst-suggest button').forEach(b => {
            b.addEventListener('click', () => {
                inputEl.value = b.dataset.suggest;
                sendMessage();
            });
        });
    }

    async function loadHistory() {
        try {
            const res = await fetch('/api/assistant/history');
            if (!res.ok) throw new Error();
            history = await res.json();
            if (!history.length) {
                renderEmpty();
            } else {
                bodyEl.innerHTML = '';
                history.forEach(m => appendMessage(m.role, m.content));
            }
        } catch {
            renderEmpty();
        }
    }

    async function sendMessage() {
        const msg = inputEl.value.trim();
        if (!msg || isSending) return;

        isSending = true;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        sendBtn.disabled = true;

        // Remove empty state if it's showing
        const empty = bodyEl.querySelector('.ai-asst-empty');
        if (empty) bodyEl.innerHTML = '';

        appendMessage('user', msg);
        appendTyping();

        try {
            const res = await fetch('/api/assistant/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg }),
            });
            const data = await res.json().catch(() => ({}));
            removeTyping();
            if (!res.ok) {
                appendMessage('assistant', `**Error:** ${data.error || 'Request failed.'}`);
            } else {
                appendMessage('assistant', data.reply);
            }
        } catch (err) {
            removeTyping();
            appendMessage('assistant', `**Error:** ${err.message}`);
        } finally {
            isSending = false;
            sendBtn.disabled = false;
            inputEl.focus();
        }
    }

    async function clearHistory() {
        if (!confirm('Clear the entire conversation? This cannot be undone.')) return;
        try {
            await fetch('/api/assistant/history', { method: 'DELETE' });
            renderEmpty();
        } catch {
            alert('Failed to clear history.');
        }
    }

    // ── Wire events ───────────────────────────────────────────────────────
    bubble.addEventListener('click', () => {
        panel.classList.add('open');
        if (!bodyEl.hasChildNodes()) loadHistory();
        setTimeout(() => inputEl.focus(), 100);
    });
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));
    clearBtn.addEventListener('click', clearHistory);
    sendBtn.addEventListener('click', sendMessage);

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    });

    // Preload conversation history on page load so the panel opens instantly
    loadHistory();
})();
