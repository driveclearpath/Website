// ClearPath Expert intake — client.
// Four states (code → channel → chat → done). Single-page, vanilla JS.

const API = {
  validate: '/api/validate-invite',
  turn:     '/api/chat-turn',
  submit:   '/api/submit-intake',
};

const state = {
  inviteId: null,
  prospect: null,
  openingMessage: null,
  sending: false,
  done: false,
};

// --------- state transitions ---------
function go(stateName) {
  document.querySelectorAll('.state').forEach((el) => {
    el.classList.toggle('active', el.dataset.state === stateName);
  });
  if (stateName === 'chat') {
    const input = document.getElementById('chat-input');
    if (input) setTimeout(() => input.focus(), 150);
  }
}

// --------- code gate ---------
const codeForm = document.getElementById('code-form');
const codeInput = document.getElementById('code-input');
const codeSubmit = document.getElementById('code-submit');
const codeError = document.getElementById('code-error');

codeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  codeError.textContent = '';
  codeSubmit.disabled = true;
  codeSubmit.classList.add('loading');

  const code = codeInput.value.trim().toUpperCase();
  if (!code) {
    codeError.textContent = 'Enter your code to continue.';
    codeSubmit.disabled = false;
    codeSubmit.classList.remove('loading');
    return;
  }

  try {
    const resp = await fetch(API.validate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      codeError.textContent =
        resp.status === 410 ? 'This invite has expired.' :
        resp.status === 404 ? 'That code isn’t recognized. Double-check with Brad.' :
        data.error || 'Something went wrong. Try again.';
      return;
    }

    state.inviteId = data.invite_id;
    state.prospect = data.prospect;
    state.openingMessage = data.opening_message;
    state.history = data.history || [];
    state.resuming = !!data.resuming;

    if (data.already_submitted) {
      // If they already finished, skip to done
      document.getElementById('done-text').textContent =
        'You already submitted this intake — Brad has it. Talk soon.';
      go('done');
      return;
    }

    // Personalize greeting on channel screen
    const greeting = document.getElementById('channel-greeting');
    const first = (state.prospect.display_name || 'there').split(' ')[0];
    greeting.textContent = state.resuming ? `Welcome back, ${first}.` : `Welcome, ${first}.`;

    // If resuming, skip channel choice — they were in chat, drop them back in
    if (state.resuming) {
      startChat();
      return;
    }

    go('channel');
  } catch (err) {
    console.error(err);
    codeError.textContent = 'Network error. Check your connection.';
  } finally {
    codeSubmit.disabled = false;
    codeSubmit.classList.remove('loading');
  }
});

// --------- channel choice ---------
document.querySelectorAll('.channel-card').forEach((btn) => {
  btn.addEventListener('click', () => {
    const channel = btn.dataset.channel;
    if (channel === 'voice') {
      showVoiceSoon(btn);
      return;
    }
    startChat();
  });
});

function showVoiceSoon(btn) {
  let note = btn.querySelector('.voice-soon-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'voice-soon-note';
    note.textContent =
      "Voice is coming shortly. For now, please use Chat — you'll get the same questions and I'll make sure Brad has everything he needs.";
    btn.appendChild(note);
  }
  note.classList.add('show');
}

function startChat() {
  if (state.resuming && state.history.length > 0) {
    // Replay history — the opener is already in the saved messages, don't double-add it
    for (const m of state.history) addBubble(m.role, m.text);
    // Separator indicating the resume point
    const divider = document.createElement('div');
    divider.style.cssText =
      'align-self:center;font-size:0.75rem;color:var(--text-muted);letter-spacing:0.12em;text-transform:uppercase;padding:6px 0;';
    divider.textContent = '— picked back up —';
    chatStream.appendChild(divider);
    chatStream.scrollTop = chatStream.scrollHeight;
  } else {
    // Fresh session — show the opener
    addBubble('assistant', state.openingMessage);
  }
  go('chat');
}

// --------- chat ---------
const chatStream = document.getElementById('chat-stream');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatEnd = document.getElementById('chat-end');

// Title from prospect
(function () {
  const sub = document.getElementById('chat-sub');
  sub.textContent = "Brad's assistant · private";
})();

function addBubble(role, text) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  div.textContent = text;
  chatStream.appendChild(div);
  chatStream.scrollTop = chatStream.scrollHeight;
  return div;
}

function addTyping() {
  const div = document.createElement('div');
  div.className = 'bubble assistant typing';
  div.setAttribute('aria-label', 'Assistant is thinking');
  for (let i = 0; i < 3; i++) div.appendChild(document.createElement('span'));
  chatStream.appendChild(div);
  chatStream.scrollTop = chatStream.scrollHeight;
  return div;
}

function autoGrow() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
}

chatInput.addEventListener('input', autoGrow);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.sending || state.done) return;

  const text = chatInput.value.trim();
  if (!text) return;

  state.sending = true;
  chatSend.disabled = true;
  chatInput.value = '';
  autoGrow();

  addBubble('user', text);
  const typingEl = addTyping();

  try {
    const resp = await fetch(API.turn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: state.inviteId, user_message: text }),
    });
    const data = await resp.json();
    typingEl.remove();

    if (!resp.ok) {
      addBubble('assistant', data.error || 'Something went wrong. Try again in a moment.');
      return;
    }

    if (data.text) addBubble('assistant', data.text);

    if (data.done) {
      state.done = true;
      chatSend.disabled = true;
      chatInput.disabled = true;
      setTimeout(() => go('done'), 1800);
    }
  } catch (err) {
    typingEl.remove();
    console.error(err);
    addBubble('assistant', 'Network hiccup — can you try that once more?');
  } finally {
    state.sending = false;
    if (!state.done) chatSend.disabled = false;
  }
});

chatEnd.addEventListener('click', async () => {
  if (state.done) return;
  const confirmed = confirm('End now and send your notes to Brad? He will get whatever you\'ve shared so far.');
  if (!confirmed) return;
  try {
    await fetch(API.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_id: state.inviteId, reason: 'user_ended_manually' }),
    });
  } catch (err) { console.error(err); }
  state.done = true;
  go('done');
});

// Auto-submit on window close / tab close / nav-away.
// sendBeacon is designed for fire-and-forget requests during page unload — it survives
// the page closing in a way plain fetch does not. Submit-intake is idempotent
// (guards on submitted_at), so firing this even after a manual End is safe.
function beaconSubmit(reason) {
  if (!state.inviteId || state.done) return;
  // Only beacon if we have an actual conversation to submit — avoids sending empty
  // intakes when someone lands on the page and immediately leaves.
  const hasStarted = chatStream.querySelectorAll('.bubble.user').length > 0;
  if (!hasStarted) return;
  try {
    const payload = JSON.stringify({ invite_id: state.inviteId, reason });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(API.submit, blob);
  } catch (err) { console.error('beacon failed', err); }
}

// pagehide is the right signal for tab/window closure. Unlike visibilitychange, it
// does NOT fire when a mobile user backgrounds the app and comes back — which would
// otherwise prematurely submit an intake someone intended to continue.
window.addEventListener('pagehide', () => beaconSubmit('window_closed'));

// focus code input on load
codeInput.focus();
