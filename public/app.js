// PhishGuard — frontend game engine. No framework. Vanilla JS.

const TIER_ORDER = ['easy', 'medium', 'hard', 'apt'];
const TIER_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard', apt: 'APT' };
const TIER_UNLOCK_SCORE = { easy: 0, medium: 25, hard: 60, apt: 100 };

const SCORE = {
  CORRECT_VERDICT: 30,
  WRONG_VERDICT: -25,
  INDICATOR_FOUND: 15,
  INDICATOR_MISSED: -5,
  FALSE_POSITIVE: -8,
};

const state = {
  emails: [],
  currentId: null,
  reviewed: new Set(),
  score: 0,
  tier: 'easy',
  flagged: new Map(),       // id -> Set<selector>
  perEmailResult: new Map(), // id -> { verdictCorrect, found, missed, falsePositive }
  byIndicatorType: {},      // type -> {found, total}
};

// ------------------------- Load data ---------------------------------
async function loadEmails() {
  const res = await fetch('data/emails.json');
  if (!res.ok) throw new Error('failed to load emails');
  const json = await res.json();
  state.emails = json.emails;
}

// ------------------------- Inbox rendering ---------------------------
function visibleEmails() {
  const allowedTiers = new Set();
  for (const t of TIER_ORDER) {
    if (state.score >= TIER_UNLOCK_SCORE[t]) allowedTiers.add(t);
    else break;
  }
  return state.emails.filter(e => allowedTiers.has(e.difficulty));
}

function renderInbox() {
  const ul = document.getElementById('email-list');
  ul.innerHTML = '';
  for (const e of visibleEmails()) {
    const li = document.createElement('li');
    if (state.currentId === e.id) li.classList.add('active');
    if (state.reviewed.has(e.id)) li.classList.add('done');
    li.dataset.id = e.id;
    li.innerHTML = `
      <div class="preview-from">${escapeHtml(e.from.name)}</div>
      <div class="preview-subject">${escapeHtml(e.subject)}</div>
      <div class="preview-status">${TIER_LABEL[e.difficulty]} · ${
      state.reviewed.has(e.id) ? 'reviewed' : 'unread'
    }</div>
    `;
    li.addEventListener('click', () => selectEmail(e.id));
    ul.appendChild(li);
  }
  updateHud();
}

function updateHud() {
  const total = state.emails.length;
  document.getElementById('hud-reviewed').textContent =
    `${state.reviewed.size} / ${total}`;
  document.getElementById('hud-score').textContent = state.score;
  let tier = 'easy';
  for (const t of TIER_ORDER) {
    if (state.score >= TIER_UNLOCK_SCORE[t]) tier = t;
  }
  state.tier = tier;
  document.getElementById('hud-tier').textContent = TIER_LABEL[tier];
}

// ------------------------- Email rendering ---------------------------
function selectEmail(id) {
  state.currentId = id;
  const email = state.emails.find(e => e.id === id);
  if (!email) return;

  document.getElementById('email-empty').classList.add('hidden');
  document.getElementById('email-pane').classList.remove('hidden');
  document.getElementById('result-pane').classList.add('hidden');

  const pane = document.getElementById('email-pane');
  pane.querySelector('.from-name').textContent = email.from.name;
  pane.querySelector('.from-addr').textContent = `<${email.from.address}>`;
  pane.querySelector('[data-zone="to"]').textContent = email.to;
  pane.querySelector('[data-zone="subject"]').textContent = email.subject;
  pane.querySelector('.date').textContent = new Date(email.date).toLocaleString();

  // Attachments
  const attBox = document.getElementById('attachments');
  attBox.innerHTML = '';
  (email.attachments || []).forEach((a, idx) => {
    const el = document.createElement('span');
    el.className = 'attachment';
    el.dataset.indicator = a.indicator || '';
    el.innerHTML = `<span class="file-icon">📎</span>${escapeHtml(a.name)}`;
    if (a.indicator) registerIndicatorClickable(el, a.indicator, email.id);
    attBox.appendChild(el);
  });

  document.getElementById('email-body').innerHTML = email.bodyHtml;

  // Header zones (from/to/subject) — also clickable indicator targets.
  for (const zoneEl of pane.querySelectorAll('[data-zone]')) {
    const z = zoneEl.dataset.zone;
    const ind = (email.headerIndicators || {})[z];
    if (ind) registerIndicatorClickable(zoneEl, ind, email.id);
    else clearIndicatorClickable(zoneEl);
  }

  // Body indicator targets
  document.querySelectorAll('#email-body [data-indicator]').forEach(el => {
    registerIndicatorClickable(el, el.dataset.indicator, email.id);
  });

  // Reset flagged for this email if not yet reviewed
  if (!state.reviewed.has(email.id)) {
    state.flagged.set(email.id, new Set());
  }
  renderFlaggedList();
  renderInbox();
}

function registerIndicatorClickable(el, id, emailId) {
  el.classList.add('indicator-target');
  el.dataset.indicatorBound = id;
  el.onclick = ev => {
    ev.stopPropagation();
    toggleFlag(emailId, id, el);
  };
}
function clearIndicatorClickable(el) {
  el.classList.remove('indicator-target', 'flagged', 'correct', 'wrong');
  el.onclick = null;
}

function toggleFlag(emailId, indicatorId, el) {
  if (state.reviewed.has(emailId)) return;
  const set = state.flagged.get(emailId) || new Set();
  if (set.has(indicatorId)) {
    set.delete(indicatorId);
    el.classList.remove('flagged');
  } else {
    set.add(indicatorId);
    el.classList.add('flagged');
  }
  state.flagged.set(emailId, set);
  renderFlaggedList();
}

function renderFlaggedList() {
  const ul = document.getElementById('flagged-list');
  ul.innerHTML = '';
  const set = state.flagged.get(state.currentId) || new Set();
  if (set.size === 0) {
    ul.innerHTML = '<li class="empty">Nothing flagged yet.</li>';
    return;
  }
  const email = state.emails.find(e => e.id === state.currentId);
  for (const id of set) {
    const li = document.createElement('li');
    const ind = (email.indicators || []).find(i => i.id === id);
    const label = ind ? ind.type : 'unknown';
    li.innerHTML = `<span class="tag">flagged</span>${escapeHtml(label)}`;
    ul.appendChild(li);
  }
}

// ------------------------- Submission ---------------------------------
function submitVerdict(userSaysPhishing) {
  const email = state.emails.find(e => e.id === state.currentId);
  if (!email || state.reviewed.has(email.id)) return;

  const flagged = state.flagged.get(email.id) || new Set();
  const trueIndicatorIds = new Set((email.indicators || []).map(i => i.id));

  const found = [...flagged].filter(id => trueIndicatorIds.has(id));
  const missed = [...trueIndicatorIds].filter(id => !flagged.has(id));
  const falsePositive = [...flagged].filter(id => !trueIndicatorIds.has(id));

  const verdictCorrect = (userSaysPhishing === email.isPhishing);

  let delta = 0;
  delta += verdictCorrect ? SCORE.CORRECT_VERDICT : SCORE.WRONG_VERDICT;
  delta += found.length * SCORE.INDICATOR_FOUND;
  delta += missed.length * SCORE.INDICATOR_MISSED;
  delta += falsePositive.length * SCORE.FALSE_POSITIVE;

  state.score += delta;
  state.reviewed.add(email.id);
  state.perEmailResult.set(email.id, {
    verdictCorrect, found, missed, falsePositive, delta,
  });

  // Indicator-type breakdown
  for (const ind of email.indicators || []) {
    const t = ind.type;
    if (!state.byIndicatorType[t]) state.byIndicatorType[t] = { found: 0, total: 0 };
    state.byIndicatorType[t].total++;
    if (found.includes(ind.id)) state.byIndicatorType[t].found++;
  }

  paintResult(email, { verdictCorrect, found, missed, falsePositive, delta });
  updateHud();
  renderInbox();

  if (state.reviewed.size === state.emails.length) {
    setTimeout(showFinalReport, 600);
  }
}

function paintResult(email, res) {
  // Mark visible indicator targets with correctness coloring.
  for (const ind of email.indicators || []) {
    const els = document.querySelectorAll(`[data-indicator-bound="${ind.id}"]`);
    els.forEach(el => {
      el.classList.remove('flagged');
      el.classList.add(res.found.includes(ind.id) ? 'correct' : 'missed');
    });
  }
  // Highlight false positives
  for (const fpId of res.falsePositive) {
    const els = document.querySelectorAll(`[data-indicator-bound="${fpId}"]`);
    els.forEach(el => { el.classList.remove('flagged'); el.classList.add('wrong'); });
  }

  const pane = document.getElementById('result-pane');
  pane.classList.remove('hidden');
  document.getElementById('email-pane').classList.add('hidden');

  const verdictClass = res.verdictCorrect ? 'win' : 'lose';
  const verdictText = res.verdictCorrect
    ? `Correct — this was ${email.isPhishing ? 'phishing' : 'legitimate'}.`
    : `Wrong — this was actually ${email.isPhishing ? 'phishing' : 'legitimate'}.`;

  const indHtml = (email.indicators || []).map(ind => {
    const got = res.found.includes(ind.id);
    return `<li>
      <span class="icon">${got ? '✅' : '❌'}</span>
      <strong>${escapeHtml(ind.type)}</strong> — ${escapeHtml(ind.explanation)}
    </li>`;
  }).join('') || '<li><em>No deceptive indicators in this email.</em></li>';

  const fpHtml = res.falsePositive.length
    ? `<h4>False positives</h4><ul>${
        res.falsePositive.map(id => `<li>⚠️ You flagged ${escapeHtml(id)} but it wasn't an indicator (−${Math.abs(SCORE.FALSE_POSITIVE)})</li>`).join('')
      }</ul>`
    : '';

  pane.innerHTML = `
    <h2>${escapeHtml(email.subject)}</h2>
    <div class="verdict ${verdictClass}">${verdictText} (${res.delta >= 0 ? '+' : ''}${res.delta} pts)</div>
    <h3>Indicators</h3>
    <ul class="indicator-summary">${indHtml}</ul>
    ${fpHtml}
    <button class="btn-next" id="btn-next">Next email →</button>
  `;
  document.getElementById('btn-next').addEventListener('click', goToNext);
}

function goToNext() {
  document.getElementById('result-pane').classList.add('hidden');
  document.getElementById('email-pane').classList.remove('hidden');
  // pick next unreviewed visible email
  const next = visibleEmails().find(e => !state.reviewed.has(e.id));
  if (next) {
    selectEmail(next.id);
  } else {
    document.getElementById('email-pane').classList.add('hidden');
    document.getElementById('email-empty').classList.remove('hidden');
    document.getElementById('email-empty').textContent =
      'All visible emails reviewed. Higher tiers unlock as your score grows.';
  }
}

// ------------------------- Final report -------------------------------
function showFinalReport() {
  const modal = document.getElementById('final-report');
  modal.classList.remove('hidden');
  const totalEmails = state.emails.length;
  const correctVerdicts = [...state.perEmailResult.values()].filter(r => r.verdictCorrect).length;
  const allFound = [...state.perEmailResult.values()].reduce((a, r) => a + r.found.length, 0);
  const allMissed = [...state.perEmailResult.values()].reduce((a, r) => a + r.missed.length, 0);
  const allFP = [...state.perEmailResult.values()].reduce((a, r) => a + r.falsePositive.length, 0);
  const survivalPct = Math.round((correctVerdicts / totalEmails) * 100);

  document.getElementById('final-stats').innerHTML = `
    <div class="stat-row"><span class="label">Final score</span><span class="value">${state.score}</span></div>
    <div class="stat-row"><span class="label">Correct verdicts</span><span class="value">${correctVerdicts} / ${totalEmails}</span></div>
    <div class="stat-row"><span class="label">Indicators caught</span><span class="value">${allFound}</span></div>
    <div class="stat-row"><span class="label">Indicators missed</span><span class="value">${allMissed}</span></div>
    <div class="stat-row"><span class="label">False positives</span><span class="value">${allFP}</span></div>
    <div class="stat-row"><span class="label">"You'd survive"</span><span class="value">${survivalPct}%</span></div>
  `;

  const breakdown = Object.entries(state.byIndicatorType)
    .map(([type, s]) => {
      const pct = s.total ? Math.round((s.found / s.total) * 100) : 0;
      return `<div style="margin:8px 0">
        <div style="display:flex; justify-content:space-between"><span>${escapeHtml(type)}</span><span>${s.found}/${s.total} (${pct}%)</span></div>
        <div class="bar"><div style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
  document.getElementById('final-breakdown').innerHTML = breakdown || '<em>No indicators encountered.</em>';
}

// ------------------------- Utils --------------------------------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function restart() {
  state.currentId = null;
  state.reviewed.clear();
  state.score = 0;
  state.tier = 'easy';
  state.flagged.clear();
  state.perEmailResult.clear();
  state.byIndicatorType = {};
  document.getElementById('final-report').classList.add('hidden');
  document.getElementById('email-pane').classList.add('hidden');
  document.getElementById('result-pane').classList.add('hidden');
  document.getElementById('email-empty').classList.remove('hidden');
  document.getElementById('email-empty').textContent = 'Select an email from the inbox to begin.';
  renderInbox();
}

// ------------------------- AI Tutor (optional backend) ---------------
const AI_BASE = window.PHISHGUARD_AI_BASE || 'http://localhost:5057';
let aiOnline = false;

async function probeTutor() {
  try {
    const r = await fetch(`${AI_BASE}/healthz`, { method: 'GET' });
    if (!r.ok) return;
    const j = await r.json();
    aiOnline = !!j.ai_enabled;
    const s = document.getElementById('tutor-status');
    s.textContent = aiOnline ? 'AI tutor online.' : 'Backend up, but no API key configured.';
    if (aiOnline) s.classList.add('online');
  } catch { /* backend down — leave default text */ }
}

async function askTutor() {
  const question = document.getElementById('tutor-input').value.trim();
  const out = document.getElementById('tutor-output');
  if (!state.currentId) { out.textContent = 'Select an email first.'; return; }
  if (!aiOnline) { out.textContent = 'Tutor offline. Start the Flask backend with `python -m src.app`.'; return; }
  const email = state.emails.find(e => e.id === state.currentId);
  const flagged = [...(state.flagged.get(state.currentId) || [])];
  out.textContent = 'Thinking…';
  try {
    const r = await fetch(`${AI_BASE}/api/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, flagged, question }),
    });
    const j = await r.json();
    out.textContent = j.reply || j.error || '(no reply)';
  } catch (e) {
    out.textContent = `Tutor request failed: ${e.message}`;
  }
}

// ------------------------- Wire up ------------------------------------
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadEmails();
  } catch (e) {
    document.getElementById('email-empty').textContent =
      'Failed to load emails. Are you serving this over HTTP (not file://)?';
    return;
  }
  renderInbox();
  document.getElementById('btn-phish').addEventListener('click', () => submitVerdict(true));
  document.getElementById('btn-legit').addEventListener('click', () => submitVerdict(false));
  document.getElementById('btn-restart').addEventListener('click', restart);
  document.getElementById('btn-close-final').addEventListener('click', restart);
  document.getElementById('btn-tutor').addEventListener('click', askTutor);
  probeTutor();
});
