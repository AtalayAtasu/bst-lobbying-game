/* Shared client code: connection with automatic reconnect, small DOM helpers. */
window.LG = (function () {
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    sget(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} }
  };
  let clientId = store.get('lg-client');
  if (!clientId) { clientId = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(16).padStart(2, '0')).join(''); store.set('lg-client', clientId); }

  function connect(hello, handlers) {
    let ws, alive = false, retry = 0, queue = [];
    const dot = document.querySelector('.dot');
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => { alive = true; retry = 0; dot && dot.classList.add('on'); ws.send(JSON.stringify(Object.assign({ t: 'hello', clientId }, hello()))); queue.splice(0).forEach(m => ws.send(m)); };
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } (handlers[m.t] || (() => {}))(m); };
      ws.onclose = () => { alive = false; dot && dot.classList.remove('on'); setTimeout(open, Math.min(8000, 500 * 2 ** retry++)); };
    };
    open();
    return { send(m) { const s = JSON.stringify(m); if (alive && ws.readyState === 1) ws.send(s); else queue.push(s); }, get alive() { return alive; } };
  }

  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const mmss = ms => { if (ms == null) return ''; const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let toastTimer;
  function toast(msg) { let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500); }
  function shock(s) {
    let el = $('.shock'); if (!el) { el = document.createElement('div'); el.className = 'shock'; el.setAttribute('role', 'alert'); el.innerHTML = '<div class="note"><p class="k">Breaking news</p><p class="txt"></p></div>'; document.body.appendChild(el); }
    if (s && s.text) { if (el.dataset.at !== String(s.at)) { el.dataset.at = s.at; $('.txt', el).textContent = s.text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); } }
    else el.classList.remove('show');
  }
  const PHASE_LABEL = { lobby: 'Joining', brief: 'Briefing', position: 'Take a position', decide: 'Regulator deciding', reveal: 'Outcome' };
  const ruleName = (rules, id) => (rules.find(r => r.id === id) || {}).name || id;
  return { store, clientId, connect, $, esc, mmss, toast, shock, PHASE_LABEL, ruleName };
})();
