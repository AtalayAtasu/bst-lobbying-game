/* The Lobbying Game — classroom server.
   Plain Node http (static files) + WebSocket (live state). One process can run several rooms.
   Environment: PORT (Render sets it), HOST_PASSWORD (required in production), DATA_DIR (optional). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const MODEL = require('./public/model.js');

const PORT = +process.env.PORT || 3000;
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'change-me';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC = path.join(__dirname, 'public');
if (!process.env.HOST_PASSWORD) console.warn('[warn] HOST_PASSWORD is not set; using the default "change-me".');

const PHASES = ['lobby', 'brief', 'position', 'negotiate', 'final', 'decide', 'reveal'];
const RULE_IDS = MODEL.RULES.map(r => r.id);
const SHOCK_PRESETS = MODEL.SHOCKS;

/* ---------------- state ---------------- */
let rooms = {};
const hostTokens = new Set();
const now = () => Date.now();
const uid = (n = 8) => crypto.randomBytes(n).toString('hex');

function newRoom(code) {
  const params = JSON.parse(JSON.stringify(MODEL.DEFAULT_PARAMS));
  const teams = {};
  params.groups.forEach(g => { teams[g.id] = { id: g.id, clientId: null, claimedAt: null, position: null, firstPosition: null, final: null, commits: [], study: null, stars: null }; });
  return { code, createdAt: now(), startedAt: null, phase: 'lobby', numbersVisible: false, showTally: false,
    rulesEnabled: RULE_IDS.slice(), params, teams, proposals: [], shock: null, shocks: [], mood: {}, epilogue: null, decision: null, log: [] };
}
function code4() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms[c]); return c; }
function log(room, type, team, detail) { room.log.push({ at: now() - (room.startedAt || room.createdAt), type, team: team || null, detail: detail || null }); if (room.log.length > 2000) room.log.shift(); }

/* persistence (best effort; Render's free disk is wiped on restart) */
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(path.join(DATA_DIR, 'rooms.json'), JSON.stringify(rooms)); } catch (e) { console.error('save failed', e.message); } }, 400); }
try { rooms = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rooms.json'), 'utf8')); console.log('restored rooms:', Object.keys(rooms).join(', ') || 'none'); } catch (_) { rooms = {}; }
Object.values(rooms).forEach(r => { r.mood = r.mood || {}; r.epilogue = r.epilogue || null; Object.values(r.teams).forEach(t => { t.commits = t.commits || []; t.study = t.study || null; t.stars = t.stars == null ? null : t.stars; delete t.points; }); });

/* ---------------- derived numbers ---------------- */
function finalRule(t) { return (t.final && t.final.rule) || (t.position && t.position.rule) || null; }
function partners(room, teamId, rule) {
  const set = new Set();
  room.proposals.forEach(p => { if (p.status === 'accepted' && p.rule === rule && (p.from === teamId || p.to === teamId)) set.add(p.from === teamId ? p.to : p.from); });
  return [...set].filter(j => finalRule(room.teams[j]) === rule);
}
const spent = t => (t.commits || []).reduce((a, c) => a + c.pts, 0) + (t.study ? MODEL.STUDY_COST : 0);
const pointsBy = t => { const o = {}; (t.commits || []).forEach(c => { o[c.rule] = (o[c.rule] || 0) + c.pts; }); return o; };
function tally(room) {
  const out = {}; RULE_IDS.forEach(r => out[r] = { score: 0, rawPoints: 0, mood: room.mood[r] || 1, supporters: [] });
  Object.values(room.teams).forEach(t => {
    const fr = finalRule(t);
    const credible = !t.firstPosition || !fr || t.firstPosition.rule === fr;
    const cred = credible ? 1 : MODEL.CREDIBILITY;
    const star = t.stars == null ? 1 : MODEL.STAR_MULT[t.stars];
    for (const r of RULE_IDS) {
      const cs = (t.commits || []).filter(c => c.rule === r); if (!cs.length) continue;
      const timed = cs.reduce((a, c) => a + c.pts * c.mult, 0), pts = cs.reduce((a, c) => a + c.pts, 0);
      const mult = fr === r ? 1 + MODEL.COALITION_BONUS * partners(room, t.id, r).length : 1;
      out[r].score += timed * cred * mult * star; out[r].rawPoints += pts;
      out[r].supporters.push({ team: t.id, points: pts, timed: Math.round(timed * 10) / 10, cred, mult, star });
    }
  });
  RULE_IDS.forEach(r => { out[r].score = Math.round(out[r].score * out[r].mood * 10) / 10; });
  return out;
}

/* ---------------- views (what each role may see) ---------------- */
function view(room, role, teamId) {
  const phaseIdx = PHASES.indexOf(room.phase);
  const positionsPublic = phaseIdx >= PHASES.indexOf('negotiate');
  const revealed = room.phase === 'reveal';
  const teams = {};
  Object.values(room.teams).forEach(t => {
    const mine = role === 'team' && t.id === teamId;
    const all = role === 'host' || revealed;
    teams[t.id] = {
      id: t.id, claimed: !!t.clientId,
      position: (all || mine || positionsPublic) ? t.position : (t.position ? { submitted: true, at: t.position.at } : null),
      firstPosition: (all || mine) ? t.firstPosition : null,
      final: (all || mine || room.phase === 'decide') ? t.final : (t.final ? { submitted: true } : null),
      points: (all || mine) ? pointsBy(t) : null,
      commits: (all || mine) ? t.commits : null,
      spent: (all || mine) ? spent(t) : null,
      study: (all || mine) ? t.study : null,
      stars: (role === 'host' || revealed) ? t.stars : null
    };
  });
  const v = { code: room.code, phase: room.phase, phases: PHASES, numbersVisible: room.numbersVisible, rulesEnabled: room.rulesEnabled,
    params: room.params, teams, shock: room.shock, mood: room.mood, epilogue: (revealed || role === 'host') ? room.epilogue : null,
    budget: MODEL.BUDGET, studyCost: MODEL.STUDY_COST, phaseMult: MODEL.PHASE_MULT, decision: (revealed || role === 'host') ? room.decision : null, shockPresets: role === 'host' ? SHOCK_PRESETS : undefined,
    proposals: room.proposals.filter(p => role === 'host' || revealed || p.status === 'accepted' || (role === 'team' && (p.from === teamId || p.to === teamId))),
    serverTime: now(), startedAt: room.startedAt };
  if (role === 'host' || (role === 'screen' && room.showTally) || revealed) v.tally = tally(room);
  if (role === 'host' || revealed) v.log = room.log;
  if (role === 'host') v.showTally = room.showTally;
  if (role === 'team') v.you = teamId;
  return v;
}

/* ---------------- websocket ---------------- */
const clients = new Set(); // { ws, room, role, teamId, clientId }
function broadcast(code) {
  const room = rooms[code]; if (!room) return;
  clients.forEach(c => { if (c.room === code && c.ws.readyState === 1) c.ws.send(JSON.stringify({ t: 'state', state: view(room, c.role, c.teamId) })); });
  save();
}
const err = (ws, msg) => ws.send(JSON.stringify({ t: 'error', msg }));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

function handle(c, m) {
  const { ws } = c;
  if (m.t === 'noop') return;
  if (m.t === 'host_login') {
    const ok = typeof m.password === 'string' && m.password.length === HOST_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(m.password), Buffer.from(HOST_PASSWORD));
    if (!ok) return err(ws, 'Wrong password.');
    const token = uid(16); hostTokens.add(token);
    return ws.send(JSON.stringify({ t: 'host_ok', token, rooms: Object.keys(rooms) }));
  }
  if (m.t === 'hello') {
    if (m.role === 'host' && !hostTokens.has(m.token)) return ws.send(JSON.stringify({ t: 'host_needed' }));
    if (m.role === 'host' && m.create) { const code = code4(); rooms[code] = newRoom(code); m.room = code; save(); }
    const code = String(m.room || '').toUpperCase();
    if (!rooms[code]) return err(ws, m.role === 'host' ? 'No such room.' : 'No game with that code. Check the code on the screen.');
    Object.assign(c, { room: code, role: ['team', 'screen', 'host'].includes(m.role) ? m.role : 'screen', clientId: clean(m.clientId, 40) || uid(), teamId: null });
    if (c.role === 'team') { const t = Object.values(rooms[code].teams).find(t => t.clientId === c.clientId); if (t) c.teamId = t.id; }
    ws.send(JSON.stringify({ t: 'welcome', room: code, clientId: c.clientId, rules: MODEL.RULES }));
    return broadcast(code);
  }
  if (m.t === 'list_rooms') {
    if (!hostTokens.has(m.token)) return ws.send(JSON.stringify({ t: 'host_needed' }));
    return ws.send(JSON.stringify({ t: 'rooms', rooms: Object.values(rooms).map(r => ({ code: r.code, phase: r.phase, createdAt: r.createdAt, teams: Object.values(r.teams).filter(t => t.clientId).length })) }));
  }
  const room = rooms[c.room]; if (!room) return err(ws, 'Join a game first.');

  /* ----- team actions ----- */
  if (c.role === 'team') {
    if (m.t === 'claim') {
      const t = room.teams[m.team]; if (!t) return err(ws, 'Unknown team.');
      if (t.clientId && t.clientId !== c.clientId) return err(ws, 'Another device already joined as this team. Ask the instructor to release it.');
      Object.values(room.teams).forEach(o => { if (o.clientId === c.clientId) o.clientId = null; });
      t.clientId = c.clientId; t.claimedAt = now(); c.teamId = t.id; log(room, 'join', t.id); return broadcast(c.room);
    }
    const t = room.teams[c.teamId]; if (!t || t.clientId !== c.clientId) return err(ws, 'Choose your team first.');
    const P = room.phase;
    if (m.t === 'position') {
      if (!['position', 'negotiate'].includes(P)) return err(ws, 'Positions can be changed only during the position and negotiation phases.');
      if (!room.rulesEnabled.includes(m.rule)) return err(ws, 'That option is not on the table.');
      const pos = { rule: m.rule, argument: clean(m.argument, 200), at: now() - (room.startedAt || room.createdAt) };
      if (!t.firstPosition && P === 'position') t.firstPosition = { ...pos };
      if (!t.firstPosition && P === 'negotiate') t.firstPosition = { ...pos };
      t.position = pos; log(room, 'position', t.id, pos.rule); return broadcast(c.room);
    }
    if (m.t === 'propose') {
      if (P !== 'negotiate') return err(ws, 'Coalitions open in the negotiation phase.');
      const to = +m.to; if (!room.teams[to] || to === t.id || !room.rulesEnabled.includes(m.rule)) return err(ws, 'Pick another team and an option.');
      if (room.proposals.some(p => p.status !== 'declined' && p.rule === m.rule && ((p.from === t.id && p.to === to) || (p.from === to && p.to === t.id)))) return err(ws, 'You already have a pact or offer with that team on this option.');
      room.proposals.push({ id: uid(4), from: t.id, to, rule: m.rule, status: 'pending', at: now() - (room.startedAt || room.createdAt) });
      log(room, 'propose', t.id, `${to}:${m.rule}`); return broadcast(c.room);
    }
    if (m.t === 'respond') {
      const p = room.proposals.find(p => p.id === m.id && p.to === t.id && p.status === 'pending'); if (!p) return err(ws, 'That offer is no longer open.');
      if (P !== 'negotiate') return err(ws, 'Coalitions can be agreed only in the negotiation phase.');
      p.status = m.accept ? 'accepted' : 'declined'; log(room, m.accept ? 'pact' : 'decline', t.id, `${p.from}:${p.rule}`); return broadcast(c.room);
    }
    if (m.t === 'commit') {
      if (!MODEL.PHASE_MULT[P]) return err(ws, 'Lobbying effort can be committed from the position phase to the final round.');
      if (!room.rulesEnabled.includes(m.rule)) return err(ws, 'That option is not on the table.');
      const pts = clamp(Math.round(+m.pts || 0), 0, MODEL.BUDGET); if (!pts) return err(ws, 'Choose how many points to commit.');
      if (spent(t) + pts > MODEL.BUDGET) return err(ws, 'You have only ' + (MODEL.BUDGET - spent(t)) + ' points left.');
      t.commits.push({ rule: m.rule, pts, phase: P, mult: MODEL.PHASE_MULT[P], at: now() - (room.startedAt || room.createdAt) });
      log(room, 'commit', t.id, pts + '→' + m.rule + ' ×' + MODEL.PHASE_MULT[P]); return broadcast(c.room);
    }
    if (m.t === 'study') {
      if (!['brief', 'position', 'negotiate'].includes(P)) return err(ws, 'Studies can be commissioned until the final round.');
      if (t.study) return err(ws, 'You already have your cost study.');
      if (spent(t) + MODEL.STUDY_COST > MODEL.BUDGET) return err(ws, 'Not enough points left for a study.');
      t.study = { at: now() - (room.startedAt || room.createdAt), phase: P }; log(room, 'study', t.id); return broadcast(c.room);
    }
    if (m.t === 'final') {
      if (P !== 'final') return err(ws, 'Final positions are taken in the final round.');
      if (!room.rulesEnabled.includes(m.rule)) return err(ws, 'That option is not on the table.');
      t.final = { rule: m.rule, at: now() - (room.startedAt || room.createdAt) }; log(room, 'final', t.id, m.rule); return broadcast(c.room);
    }
    return err(ws, 'Unknown action.');
  }

  /* ----- host actions ----- */
  if (c.role === 'host') {
    if (!hostTokens.has(m.token)) return ws.send(JSON.stringify({ t: 'host_needed' }));
    if (m.t === 'phase') {
      if (!PHASES.includes(m.phase)) return err(ws, 'Unknown phase.');
      room.phase = m.phase; if (!room.startedAt && m.phase !== 'lobby') room.startedAt = now();
      log(room, 'phase', null, m.phase); return broadcast(c.room);
    }
    if (m.t === 'toggle' && ['numbersVisible', 'showTally'].includes(m.key)) { room[m.key] = !!m.value; log(room, m.key, null, String(!!m.value)); return broadcast(c.room); }
    if (m.t === 'rules') { const en = (m.enabled || []).filter(r => RULE_IDS.includes(r)); if (!en.length) return err(ws, 'Keep at least one option.'); room.rulesEnabled = RULE_IDS.filter(r => en.includes(r)); return broadcast(c.room); }
    if (m.t === 'shock') {
      const text = clean(m.text, 240); if (!text) return err(ws, 'Write the news first.');
      const preset = SHOCK_PRESETS.find(s => s.text === text), effects = preset ? preset.effects : null;
      if (effects) for (const r in effects) room.mood[r] = Math.round((room.mood[r] || 1) * effects[r] * 1000) / 1000;
      room.shock = { text, at: now(), effects }; room.shocks.push(room.shock); log(room, 'shock', null, text); return broadcast(c.room);
    }
    if (m.t === 'clear_shock') { room.shock = null; return broadcast(c.room); }
    if (m.t === 'clear_mood') { room.mood = {}; log(room, 'mood_reset'); return broadcast(c.room); }
    if (m.t === 'rate') { const t = room.teams[m.team]; if (!t) return err(ws, 'Unknown team.'); t.stars = m.stars == null ? null : clamp(Math.round(+m.stars), 0, 3); log(room, 'rated', t.id, String(t.stars)); return broadcast(c.room); }
    if (m.t === 'epilogue') { const id = m.exit == null ? null : +m.exit; room.epilogue = id && room.teams[id] ? { exit: id } : null; return broadcast(c.room); }
    if (m.t === 'decide') { if (!RULE_IDS.includes(m.rule)) return err(ws, 'Unknown option.'); room.decision = { rule: m.rule, at: now() - (room.startedAt || room.createdAt) }; log(room, 'decision', null, m.rule); return broadcast(c.room); }
    if (m.t === 'release_team') { const t = room.teams[m.team]; if (t) { t.clientId = null; clients.forEach(k => { if (k.room === c.room && k.teamId === t.id) k.teamId = null; }); } return broadcast(c.room); }
    if (m.t === 'set_team') {
      // manual fallback: the instructor records a team's choices
      const t = room.teams[m.team]; if (!t) return err(ws, 'Unknown team.'); const p = m.patch || {};
      if (p.rule && RULE_IDS.includes(p.rule)) { const pos = { rule: p.rule, argument: clean(p.argument != null ? p.argument : (t.position && t.position.argument), 200), at: now() - (room.startedAt || room.createdAt), byHost: true }; t.position = pos; if (!t.firstPosition) t.firstPosition = { ...pos }; }
      if (p.final && RULE_IDS.includes(p.final)) t.final = { rule: p.final, at: now() - (room.startedAt || room.createdAt), byHost: true };
      if (p.points) { const cs = []; let s = 0; RULE_IDS.forEach(r => { const v = clamp(Math.round(+p.points[r] || 0), 0, MODEL.BUDGET); if (v) { cs.push({ rule: r, pts: v, phase: room.phase, mult: 1, at: now() - (room.startedAt || room.createdAt), byHost: true }); s += v; } }); if (s + (t.study ? MODEL.STUDY_COST : 0) <= MODEL.BUDGET) t.commits = cs; }
      if (p.pact && RULE_IDS.includes(p.pact.rule) && room.teams[p.pact.with] && +p.pact.with !== t.id) room.proposals.push({ id: uid(4), from: t.id, to: +p.pact.with, rule: p.pact.rule, status: 'accepted', at: now() - (room.startedAt || room.createdAt), byHost: true });
      log(room, 'host_edit', t.id); return broadcast(c.room);
    }
    if (m.t === 'params') {
      const P = m.params; if (!P || !Array.isArray(P.groups) || P.groups.length !== 5) return err(ws, 'Parameters must list five groups.');
      const num = (v, a, b) => typeof v === 'number' && isFinite(v) && v >= a && v <= b;
      for (const g of P.groups) if (!(num(g.unitsSold, 0, 1e6) && num(g.price, 1, 1e6) && num(g.margin, 0, 1) && num(g.unitsReturned, 0, 1e6) && num(g.weightKg, 0, 1e4) && num(g.toxicity, 0, 100))) return err(ws, `Check the numbers for ${g.name || 'a group'}.`);
      if (!(num(P.handlingPerUnit, 0, 1e4) && num(P.costPerKg, 0, 1e4) && num(P.demandElasticity, 0, 100))) return err(ws, 'Check the cost parameters.');
      room.params = { handlingPerUnit: P.handlingPerUnit, costPerKg: P.costPerKg, demandElasticity: P.demandElasticity,
        groups: P.groups.map((g, i) => ({ ...MODEL.DEFAULT_PARAMS.groups[i], ...g, id: i + 1, name: clean(g.name, 40) || MODEL.DEFAULT_PARAMS.groups[i].name, profile: clean(g.profile, 240) })) };
      return broadcast(c.room);
    }
    if (m.t === 'reset') { const fresh = newRoom(c.room); fresh.params = room.params; fresh.rulesEnabled = room.rulesEnabled; rooms[c.room] = fresh; return broadcast(c.room); }
    if (m.t === 'delete_room') { delete rooms[c.room]; save(); return ws.send(JSON.stringify({ t: 'room_deleted' })); }
    return err(ws, 'Unknown host action.');
  }
  err(ws, 'This screen is read-only.');
}

/* ---------------- http (static files) ---------------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };
const ROUTES = { '/': 'index.html', '/play': 'play.html', '/host': 'host.html', '/screen': 'screen.html' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  const rel = ROUTES[url.pathname] || url.pathname.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' });
    res.end(buf);
  });
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', ws => {
  const c = { ws, room: null, role: null, teamId: null, clientId: null, n: 0, t0: now() };
  clients.add(c);
  ws.on('message', buf => {
    if (now() - c.t0 > 1000) { c.t0 = now(); c.n = 0; } if (++c.n > 30) return; // simple rate limit
    let m; try { m = JSON.parse(buf); } catch (_) { return; }
    try { handle(c, m); } catch (e) { console.error(e); err(ws, 'Something went wrong on the server.'); }
  });
  ws.on('close', () => clients.delete(c));
});
setInterval(() => wss.clients.forEach(ws => { if (ws.readyState === 1) ws.ping(); }), 25000); // keep connections alive behind proxies
server.listen(PORT, () => console.log(`Lobbying game on http://localhost:${PORT}`));
