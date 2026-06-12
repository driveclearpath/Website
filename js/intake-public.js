// Public "Talk to us" intake — client logic.
// States: entry → chat → pending-confirm → (magic link) → confirmed.
// Also handles ?confirmed=1 / ?confirmed=0 redirects from the magic-link endpoint.

const API = {
  validateEntry: '/api/public-validate-entry',
  turn:          '/api/public-chat-turn',
  submit:        '/api/public-submit-intake',
};

const state = {
  sessionToken: null,
  visitorName: null,
  openingMessage: null,
  sending: false,
  done: false,
  turnstileWidgetId: null,
  turnstileToken: null,
  attachment: null, // { data, mediaType, previewUrl } — base64 JPEG, held in memory only
};

// -------- Session persistence --------
// A refresh shouldn't eat a five-minute conversation. We keep the session token and a
// text-only copy of the bubbles in localStorage (screenshot images are never persisted)
// and restore on load. Cleared the moment the conversation ends, any way it can end.
const STORAGE_KEY = 'cp_talk_session';
const STORAGE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const history = [];

function saveSession() {
  if (!state.sessionToken) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: state.sessionToken,
      name: state.visitorName,
      bubbles: history,
      ts: Date.now(),
    }));
  } catch { /* storage unavailable — persistence is best-effort */ }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

function recordBubble(role, text, hadImage) {
  history.push({ role, text, img: !!hadImage });
  saveSession();
}

function restoreSession() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return false; }
  if (!saved?.token || !Array.isArray(saved.bubbles) || !saved.bubbles.length) return false;
  if (!saved.ts || Date.now() - saved.ts > STORAGE_MAX_AGE_MS) { clearSession(); return false; }
  state.sessionToken = saved.token;
  state.visitorName = saved.name || null;
  for (const b of saved.bubbles) {
    history.push(b);
    const text = b.img ? (b.text ? `(screenshot sent)\n${b.text}` : '(screenshot sent)') : b.text;
    addBubble(b.role, text);
  }
  go('chat');
  return true;
}

function go(stateName) {
  document.querySelectorAll('.state').forEach((el) => {
    el.classList.toggle('active', el.dataset.state === stateName);
  });
  if (stateName === 'chat') {
    const input = document.getElementById('chat-input');
    if (input) setTimeout(() => input.focus(), 150);
  }
}

// -------- Magic-link return handling --------
// If we landed via /api/confirm-intake → redirect, the URL will have ?confirmed=1 / ?confirmed=0
function handleConfirmReturn() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('confirmed')) return false;
  clearSession();

  if (params.get('confirmed') === '1') {
    go('confirmed');
    // Clean URL so refresh doesn't re-show
    window.history.replaceState({}, '', '/intake-public.html');
    return true;
  }

  // Failure modes
  const reason = params.get('reason') || 'invalid_token';
  const errorText = document.getElementById('error-text');
  if (errorText) {
    errorText.textContent =
      reason === 'missing_token' ? 'That confirmation link is missing its token. Try clicking again from your email.' :
      reason === 'invalid_token' ? "That confirmation link didn't work. It may have already been used." :
      reason === 'quarantined'   ? "Couldn't confirm this one — please email me directly at info@driveclearpath.com." :
      "That confirmation link didn't work.";
  }
  go('error');
  window.history.replaceState({}, '', '/intake-public.html');
  return true;
}

// -------- Turnstile rendering --------
// Cloudflare Turnstile script is loaded in the page head. It exposes window.turnstile
// asynchronously — we mount when ready. The site key comes from the meta tag, which
// Brad replaces with his real Cloudflare site key during setup.
function mountTurnstile() {
  const meta = document.getElementById('cp-turnstile-sitekey');
  const siteKey = meta?.getAttribute('content') || '';
  const mount = document.getElementById('turnstile-mount');
  if (!mount) return;

  // No site key configured → render nothing. The server bypasses verification when
  // TURNSTILE_SECRET_KEY is also unset, so the form submits cleanly. The mount has
  // `display: none` when empty (CSS :empty rule), so no layout space is wasted.
  if (!siteKey || siteKey.includes('__TURNSTILE_SITE_KEY__')) {
    return;
  }

  function render() {
    if (!window.turnstile) {
      setTimeout(render, 100);
      return;
    }
    state.turnstileWidgetId = window.turnstile.render(mount, {
      sitekey: siteKey,
      theme: 'light',
      callback: (token) => { state.turnstileToken = token; },
      'expired-callback': () => { state.turnstileToken = null; },
      'error-callback': () => { state.turnstileToken = null; },
    });
  }
  render();
}

function resetTurnstile() {
  state.turnstileToken = null;
  if (window.turnstile && state.turnstileWidgetId !== null) {
    try { window.turnstile.reset(state.turnstileWidgetId); } catch { /* noop */ }
  }
}

// -------- Entry form --------
const entryForm = document.getElementById('entry-form');
const entrySubmit = document.getElementById('entry-submit');
const entryError = document.getElementById('entry-error');
const entryName = document.getElementById('entry-name');
const entryEmail = document.getElementById('entry-email');
const entryHoneypot = document.getElementById('entry-honeypot');

function showEntryError(msg) {
  entryError.textContent = msg;
}

entryForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  showEntryError('');

  const name = entryName.value.trim();
  const email = entryEmail.value.trim();
  // Snapshot the honeypot value, then immediately clear it. Real users with aggressive
  // autofill extensions can have hidden fields filled silently — clearing on submit means
  // we only catch bots that are submitting programmatically without going through the form.
  const honeypot = entryHoneypot.value.trim();
  entryHoneypot.value = '';

  if (!name || name.length < 2) {
    showEntryError('Tell me your name (2 or more characters).');
    entryName.focus();
    return;
  }
  if (!email || !email.includes('@')) {
    showEntryError('Enter the email Brad should reach back at.');
    entryEmail.focus();
    return;
  }
  if (!state.turnstileToken) {
    // If the Turnstile widget never resolved (or got reset), tell them to wait/retry.
    // In dev with no key set, server bypasses, so we don't block the submit here.
    const meta = document.getElementById('cp-turnstile-sitekey');
    const hasKey = meta && !meta.getAttribute('content').includes('__TURNSTILE');
    if (hasKey) {
      showEntryError('Hang on — finishing the human check…');
      return;
    }
  }

  entrySubmit.disabled = true;
  entrySubmit.classList.add('loading');

  try {
    const resp = await fetch(API.validateEntry, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        email,
        cp_field_b: honeypot,             // server checks honeypot under this key
        turnstile_token: state.turnstileToken,
      }),
    });
    const data = await resp.json();

    if (!resp.ok) {
      showEntryError(data.error || 'Could not start. Please try again.');
      resetTurnstile();
      return;
    }

    // Honeypot trip → fake-success path: route to the "confirmed" state without
    // starting a chat. Bots think they submitted; real humans (rare with the JS
    // clear) at least see a coherent end state instead of an error.
    if (data.bot_likely) {
      go('confirmed');
      return;
    }

    state.sessionToken = data.session_token;
    state.visitorName = data.visitor_name || name;
    state.openingMessage = data.opening_message;

    addBubble('assistant', state.openingMessage);
    recordBubble('assistant', state.openingMessage);
    go('chat');
  } catch (err) {
    console.error(err);
    showEntryError('Network error. Check your connection and try again.');
  } finally {
    entrySubmit.disabled = false;
    entrySubmit.classList.remove('loading');
  }
});

// -------- Chat --------
const chatStream = document.getElementById('chat-stream');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatEnd = document.getElementById('chat-end');
const chatAttach = document.getElementById('chat-attach');
const chatFile = document.getElementById('chat-file');
const attachRow = document.getElementById('attach-row');
const attachThumb = document.getElementById('attach-thumb');
const attachName = document.getElementById('attach-name');
const attachRemove = document.getElementById('attach-remove');

function addBubble(role, text, imageUrl) {
  const div = document.createElement('div');
  div.className = `bubble ${role}`;
  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'bubble-img';
    img.src = imageUrl;
    img.alt = 'Screenshot you sent';
    div.appendChild(img);
  }
  if (text) div.appendChild(document.createTextNode(text));
  chatStream.appendChild(div);
  chatStream.scrollTop = chatStream.scrollHeight;
  return div;
}

// -------- Screenshot attachment --------
// Images are downscaled and re-encoded to JPEG client-side before sending. The re-encode
// strips EXIF/location metadata and keeps the payload small; the server passes the image
// to the AI for one-turn analysis and never stores it.
const MAX_IMAGE_EDGE = 1568;

async function prepareImage(file) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
    throw new Error('Use a PNG, JPG, WebP, or GIF screenshot.');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Couldn't read that image — try a different screenshot."));
      i.src = objectUrl;
    });
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    let previewUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (previewUrl.length > 4_000_000) previewUrl = canvas.toDataURL('image/jpeg', 0.6);
    if (previewUrl.length > 4_000_000) throw new Error('That image is too large — crop it down and try again.');
    return { data: previewUrl.split(',')[1], mediaType: 'image/jpeg', previewUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function setAttachment(att, label) {
  state.attachment = att;
  if (att) {
    attachThumb.src = att.previewUrl;
    attachName.textContent = label || 'Screenshot ready — send when you are';
    attachRow.hidden = false;
  } else {
    attachThumb.removeAttribute('src');
    attachRow.hidden = true;
  }
}

async function takeFile(file, label) {
  if (!file || state.done) return;
  try {
    setAttachment(await prepareImage(file), label);
  } catch (err) {
    addBubble('assistant', err.message || "Couldn't read that image — try a different screenshot.");
  }
  chatInput.focus();
}

chatAttach?.addEventListener('click', () => chatFile.click());

chatFile?.addEventListener('change', () => {
  takeFile(chatFile.files?.[0], chatFile.files?.[0]?.name);
  chatFile.value = '';
});

chatInput?.addEventListener('paste', (e) => {
  const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  takeFile(item.getAsFile(), 'Pasted screenshot');
});

attachRemove?.addEventListener('click', () => setAttachment(null));

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

chatInput?.addEventListener('input', autoGrow);

chatInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

chatForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.sending || state.done) return;

  const text = chatInput.value.trim();
  const attachment = state.attachment;
  if (!text && !attachment) return;

  state.sending = true;
  chatSend.disabled = true;
  chatInput.value = '';
  autoGrow();
  setAttachment(null);

  addBubble('user', text, attachment?.previewUrl);
  recordBubble('user', text, !!attachment);
  const typingEl = addTyping();

  try {
    const resp = await fetch(API.turn, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_token: state.sessionToken,
        user_message: text,
        ...(attachment ? { image: { media_type: attachment.mediaType, data: attachment.data } } : {}),
      }),
    });
    const data = await resp.json();
    typingEl.remove();

    if (!resp.ok) {
      // Dead sessions (already finished, or expired/cleared server-side) are terminal —
      // stop the composer and clear the saved copy so a refresh starts clean.
      if (resp.status === 409 || resp.status === 404) {
        state.done = true;
        chatSend.disabled = true;
        chatInput.disabled = true;
        clearSession();
        addBubble('assistant', resp.status === 409
          ? 'This conversation already wrapped up. If you have more to add, email info@driveclearpath.com.'
          : 'This session expired. Refresh the page to start a fresh conversation.');
        return;
      }
      addBubble('assistant', data.error || 'Something went wrong. Try again in a moment.');
      return;
    }

    if (data.text) {
      addBubble('assistant', data.text);
      recordBubble('assistant', data.text);
    }

    if (data.done) {
      state.done = true;
      chatSend.disabled = true;
      chatInput.disabled = true;
      clearSession();
      // If a confirmation was sent, route to "check your email."
      // If silent_drop, just show the confirmed page (don't tell them they were dropped).
      const next = data.confirmation_required ? 'pending-confirm' : 'confirmed';
      setTimeout(() => go(next), 1600);
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

chatEnd?.addEventListener('click', async () => {
  if (state.done) return;
  const ok = confirm('End the conversation now? You\'ll get an email to confirm before Brad sees anything.');
  if (!ok) return;
  let confirmationRequired = false;
  try {
    const resp = await fetch(API.submit, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_token: state.sessionToken, reason: 'user_ended_manually' }),
    });
    const data = await resp.json().catch(() => ({}));
    confirmationRequired = !!data?.confirmation_required;
  } catch (err) {
    console.error(err);
  }
  state.done = true;
  clearSession();
  go(confirmationRequired ? 'pending-confirm' : 'confirmed');
});

// Beacon-submit on tab close — fire-and-forget. Idempotent.
function beaconSubmit(reason) {
  if (!state.sessionToken || state.done) return;
  const hasStarted = chatStream && chatStream.querySelectorAll('.bubble.user').length > 0;
  if (!hasStarted) return;
  try {
    const payload = JSON.stringify({ session_token: state.sessionToken, reason });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(API.submit, blob);
  } catch (err) { console.error('beacon failed', err); }
}

window.addEventListener('pagehide', () => beaconSubmit('window_closed'));

// -------- Boot --------
(function init() {
  // 1. If this is a magic-link return, show the right state and skip everything else.
  if (handleConfirmReturn()) return;

  // 2. If there's a saved in-flight conversation, restore it and pick up where they left off.
  if (restoreSession()) return;

  // 3. Otherwise we're on the entry page — mount Turnstile and focus the name field.
  mountTurnstile();
  if (entryName) entryName.focus();
})();
