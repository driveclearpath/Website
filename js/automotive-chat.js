(() => {
  const launcher = document.getElementById('advisor-launcher');
  const panel = document.getElementById('advisor-panel');
  const close = document.getElementById('advisor-close');
  const stream = document.getElementById('advisor-stream');
  const form = document.getElementById('advisor-form');
  const input = document.getElementById('advisor-input');
  const send = document.getElementById('advisor-send');
  const suggestions = document.getElementById('advisor-suggestions');
  if (!launcher || !panel || !form || !input) return;

  const messages = [];
  let busy = false;

  function toggle(open) {
    panel.hidden = !open;
    launcher.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => input.focus(), 100);
  }

  function bubble(role, text) {
    const el = document.createElement('div');
    el.className = `advisor-bubble ${role}`;
    el.textContent = text;
    stream.appendChild(el);
    stream.scrollTop = stream.scrollHeight;
    return el;
  }

  async function ask(text) {
    if (busy || !text.trim()) return;
    busy = true;
    send.disabled = true;
    suggestions.hidden = true;
    const clean = text.trim().slice(0, 1200);
    messages.push({ role: 'user', content: clean });
    bubble('user', clean);
    input.value = '';
    const thinking = bubble('assistant thinking', 'ClearPath is thinking…');
    try {
      const response = await fetch('/api/automotive-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }),
      });
      const data = await response.json();
      thinking.remove();
      if (!response.ok) throw new Error(data.error || 'Please try again.');
      messages.push({ role: 'assistant', content: data.message });
      bubble('assistant', data.message);
    } catch (error) {
      thinking.textContent = error.message || 'The advisor is taking a pit stop. Please try again.';
      thinking.classList.remove('thinking');
      messages.pop();
    } finally {
      busy = false;
      send.disabled = false;
      input.focus();
    }
  }

  launcher.addEventListener('click', () => toggle(panel.hidden));
  close.addEventListener('click', () => toggle(false));
  form.addEventListener('submit', (event) => { event.preventDefault(); ask(input.value); });
  suggestions.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-question]');
    if (button) ask(button.dataset.question);
  });
})();
