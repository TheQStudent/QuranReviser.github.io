const API_BASE = 'https://api.quran.com/api/v4';

// Elements
const els = {
  setupSection: document.getElementById('setup-section'),
  scopeKind: document.getElementById('scope-kind'),
  scopeSurahs: document.getElementById('scope-surahs'),
  scopeSurahsInput: document.getElementById('scope-surahs-input'),
  scopeJuz: document.getElementById('scope-juz'),
  scopeJuzInput: document.getElementById('scope-juz-input'),
  scopeHizb: document.getElementById('scope-hizb'),
  scopeHizbInput: document.getElementById('scope-hizb-input'),
  mode: document.getElementById('mode'),
  xWrapper: document.getElementById('x-wrapper'),
  fontWrapper: document.getElementById('font-wrapper'),
  metaWrapper: document.getElementById('meta-wrapper'),
  xCount: document.getElementById('x-count'),
  fontPx: document.getElementById('font-px'),
  recShowMeta: document.getElementById('rec-show-meta'),
  tajweed: document.getElementById('tajweed'),
  seed: document.getElementById('seed'),
  start: document.getElementById('start'),
  // Recite mode
  reciteSection: document.getElementById('recite-section'),
  recPrompt: document.getElementById('recite-prompt'),
  recMeta: document.getElementById('recite-meta'),
  recBtn: document.getElementById('rec-btn'),
  recAudio: document.getElementById('rec-audio'),
  recAnswer: document.getElementById('rec-answer'),
  // MCQ mode
  mcqSection: document.getElementById('mcq-section'),
  mcqPrompt: document.getElementById('mcq-prompt'),
  mcqChoices: document.getElementById('mcq-choices'),
  mcqNext: document.getElementById('mcq-next'),
  // Order mode
  orderSection: document.getElementById('order-section'),
  orderList: document.getElementById('order-list'),
  orderCheck: document.getElementById('order-check'),
  orderNext: document.getElementById('order-next'),
  orderResult: document.getElementById('order-result'),
};

const PREFS_KEY = 'qr_prefs';
const HIFDH_KEY = 'hifdh_progress';

const state = {
  rng: Math.random,
  versesFlat: [], // list of {verse_key, text_uthmani, page_number}
  orderCorrect: [],
  orderUser: [],
  recShowMeta: false,
};

const recState = { mediaRec: null, chunks: [], recording: false, bound: false };

function applyFontSize(px){
  const n = Math.max(18, Math.min(60, parseInt(px,10)||36));
  document.documentElement.style.setProperty('--arabic-size', n + 'px');
}

function parseRangeList(input, max){
  if (!input || typeof input !== 'string') return [];
  const out = new Set();
  input.split(',').map(s => s.trim()).filter(Boolean).forEach(chunk => {
    const m = chunk.match(/^([0-9]{1,3})(?:\s*-\s*([0-9]{1,3}))?$/);
    if (!m) return;
    const a = Math.max(1, Math.min(max, parseInt(m[1],10)||0));
    const b = m[2] ? Math.max(1, Math.min(max, parseInt(m[2],10)||0)) : a;
    const start = Math.min(a,b), end = Math.max(a,b);
    for(let i=start;i<=end;i++) out.add(i);
  });
  return Array.from(out.values()).sort((x,y)=>x-y);
}

function seededRng(seed){
  if (!seed) return Math.random;
  let s = 0;
  const str = String(seed);
  for (let i=0;i<str.length;i++){ s = (s*31 + str.charCodeAt(i)) >>> 0; }
  return function(){ s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s>>>0) % 1_000_000) / 1_000_000; };
}

function pickRandom(arr){ if(!arr||!arr.length) return undefined; const i = Math.floor(state.rng()*arr.length); return arr[i]; }

async function fetchVersesByChapter(ch){
  const res = await fetch(`${API_BASE}/verses/by_chapter/${ch}?per_page=300&words=false&fields=text_uthmani,page_number`);
  if(!res.ok) throw new Error('Chapter HTTP ' + res.status);
  const data = await res.json();
  return data.verses || [];
}

async function fetchVersesBy(range, id){
  // range: 'juz' | 'hizb'
  const collected = [];
  let page = 1;
  while(true){
    const url = `${API_BASE}/verses/by_${range}/${id}?per_page=300&page=${page}&words=false&fields=text_uthmani,page_number`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(`${range} HTTP ${res.status}`);
    const data = await res.json();
    collected.push(...(data.verses||[]));
    const next = (data.pagination && data.pagination.next_page) || (data.meta && data.meta.next_page) || null;
    if(!next) break; page = next; if (page>20) break;
  }
  return collected;
}

async function fetchVersesByPage(page){
  const res = await fetch(`${API_BASE}/verses/by_page/${page}?per_page=300&words=false&fields=text_uthmani,page_number`);
  if(!res.ok) throw new Error('Page HTTP ' + res.status);
  const data = await res.json();
  return data.verses || [];
}

function verseKeyToTuple(k){ const [s,v] = String(k).split(':').map(n=>parseInt(n,10)||0); return [s,v]; }
function cmpVerseKey(a,b){ const [sa,va] = verseKeyToTuple(a); const [sb,vb] = verseKeyToTuple(b); return sa===sb ? (va-vb) : (sa-sb); }

async function buildScopeVerses(){
  const kind = els.scopeKind.value;
  if (kind === 'progress'){
    // Read saved progress: sid -> memorized count
    let progress = {};
    try { progress = JSON.parse(localStorage.getItem(HIFDH_KEY)||'{}')||{}; } catch {}
    const chapters = Object.keys(progress).map(k=>parseInt(k,10)).filter(n=>n>=1&&n<=114);
    const all = [];
    for (const sid of chapters){
      const verses = await fetchVersesByChapter(sid);
      const upto = Math.max(0, Math.min(verses.length, Number(progress[sid])||0));
      all.push(...verses.slice(0, upto));
    }
    return all.sort((a,b)=>cmpVerseKey(a.verse_key,b.verse_key));
  }
  if (kind === 'surahs'){
    const ids = parseRangeList(els.scopeSurahsInput.value||'', 114);
    const all = [];
    for (const sid of ids){ all.push(...await fetchVersesByChapter(sid)); }
    return all.sort((a,b)=>cmpVerseKey(a.verse_key,b.verse_key));
  }
  if (kind === 'juz'){
    const ids = parseRangeList(els.scopeJuzInput.value||'', 30);
    const all = [];
    for (const j of ids){ all.push(...await fetchVersesBy('juz', j)); }
    return all.sort((a,b)=>cmpVerseKey(a.verse_key,b.verse_key));
  }
  if (kind === 'hizb'){
    const ids = parseRangeList(els.scopeHizbInput.value||'', 60);
    const all = [];
    for (const h of ids){ all.push(...await fetchVersesBy('hizb', h)); }
    return all.sort((a,b)=>cmpVerseKey(a.verse_key,b.verse_key));
  }
  return [];
}

function ensureFont(){
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');
    // In 'order' mode, ignore local control and use settings like Reader
    const useSettingsOnly = (els.mode && els.mode.value === 'order');
    const px = useSettingsOnly ? (prefs.font_px || 36) : (parseInt(els.fontPx.value,10) || prefs.font_px || 36);
    applyFontSize(px);
  } catch { applyFontSize(36); }
}

function setVisible(section){
  [els.reciteSection, els.mcqSection, els.orderSection].forEach(el => { if (el) el.hidden = (el !== section); });
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){ const j = Math.floor(state.rng()*(i+1)); [arr[i],arr[j]] = [arr[j],arr[i]]; }
  return arr;
}

// Mode 1: Recite next X
function prepareRecite(){
  const list = state.versesFlat;
  if (!list.length) { els.recPrompt.textContent = 'No verses in scope.'; els.recAnswer.textContent=''; return; }
  const X = Math.max(1, Math.min(20, parseInt(els.xCount.value,10)||3));
  let idx = -1;
  for (let tries=0; tries<50; tries++){
    const i = Math.floor(state.rng() * list.length);
    if (i + X < list.length) { idx = i; break; }
  }
  if (idx < 0) idx = Math.max(0, list.length - (X+1));
  const start = list[idx];
  const follow = list.slice(idx+1, idx+1+X);
  els.recPrompt.textContent = start.text_uthmani || '—';
  els.recAnswer.classList.add('hidden');
  els.recAnswer.innerHTML = follow.map(v=>v.text_uthmani).join('<br>');
  if (state.recShowMeta && els.recMeta){
    const [sid, vid] = verseKeyToTuple(start.verse_key);
    let name = 'Surah ' + sid;
    if (Array.isArray(window.CHAPTERS_DATA)){
      const ch = window.CHAPTERS_DATA.find(c=>c.id===sid);
      if (ch) name = ch.name_simple;
    }
    els.recMeta.textContent = `${name} ${sid}:${vid}`;
    els.recMeta.classList.remove('hidden');
  } else if (els.recMeta){
    els.recMeta.classList.add('hidden');
  }
  els.recAudio.classList.add('hidden');
  els.recAudio.removeAttribute('src');
  els.recBtn.textContent = 'Record';
}

async function toggleRec(){
  if (recState.recording){
    try { recState.mediaRec && recState.mediaRec.stop(); } catch {}
    recState.recording = false;
    els.recBtn.textContent = 'Record';
    els.recAnswer.classList.remove('hidden');
  } else {
    if (!els.recAnswer.classList.contains('hidden')) {
      prepareRecite();
    }
    try { els.recAudio.pause(); els.recAudio.currentTime = 0; } catch {}
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recState.mediaRec = new MediaRecorder(stream);
      recState.chunks = [];
      recState.mediaRec.ondataavailable = e => { if (e.data && e.data.size>0) recState.chunks.push(e.data); };
      recState.mediaRec.onstop = () => {
        try {
          const blob = new Blob(recState.chunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          els.recAudio.src = url;
          els.recAudio.classList.remove('hidden');
          els.recAudio.play();
        } catch {}
      };
      recState.mediaRec.start();
      recState.recording = true;
      els.recBtn.textContent = 'Stop';
      els.recAnswer.classList.add('hidden');
    } catch(e){ alert('Microphone not available.'); }
  }
}

function runRecite(){
  setVisible(els.reciteSection);
  if (!recState.bound && els.recBtn){ els.recBtn.addEventListener('click', toggleRec); recState.bound = true; }
  prepareRecite();
}

// Mode 2: MCQ Next Verse
function runMcq(){
  setVisible(els.mcqSection);
  const list = state.versesFlat;
  if (list.length < 2) { els.mcqPrompt.textContent = 'Not enough verses in scope.'; els.mcqChoices.innerHTML=''; return; }
  let idx = -1;
  for(let tries=0; tries<50; tries++){
    const i = Math.floor(state.rng()*list.length);
    if (i+1 < list.length) { idx = i; break; }
  }
  if (idx<0) idx = 0;
  const promptV = list[idx];
  const correct = list[idx+1];
  els.mcqPrompt.textContent = promptV.text_uthmani || '—';
  // Build 4 distractors from other verses (exclude correct)
  const pool = list.filter((_,i)=> i!==idx+1);
  const distract = shuffle(pool.slice()).slice(0,4);
  const options = shuffle([correct, ...distract]);
  els.mcqChoices.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn secondary';
    btn.textContent = opt.text_uthmani || '—';
    if (opt === correct) btn.dataset.correct = '1';
    btn.addEventListener('click', () => {
      const buttons = Array.from(els.mcqChoices.querySelectorAll('button'));
      buttons.forEach(b => b.disabled = true);
      if (opt === correct) {
        btn.classList.remove('secondary');
        btn.classList.add('primary');
        btn.textContent = '✓ ' + btn.textContent;
        buttons.forEach(b => { if (b !== btn) { b.classList.add('danger'); b.textContent = '✗ ' + b.textContent; } });
      } else {
        btn.classList.add('danger');
        btn.textContent = '✗ ' + btn.textContent;
        const correctBtn = buttons.find(b => b.dataset.correct === '1');
        if (correctBtn) {
          correctBtn.classList.remove('secondary');
          correctBtn.classList.add('primary');
          correctBtn.textContent = '✓ ' + correctBtn.textContent;
        }
      }
    }, { once: true });
    els.mcqChoices.appendChild(btn);
  });
  els.mcqNext.onclick = ()=> runMcq();
}

// Mode 3: Order the page
async function runOrder(){
  ensureFont();
  setVisible(els.orderSection);
  // Build set of pages from scope, pick one at random
  const pages = Array.from(new Set((state.versesFlat||[]).map(v=>v.page_number).filter(p=>typeof p==='number' && p>=1 && p<=604)));
  if (!pages.length) { els.orderList.innerHTML=''; els.orderResult.textContent='No page in scope.'; return; }
  const page = pickRandom(pages);
  const verses = await fetchVersesByPage(page);
  // Correct order is as returned (sorted by verse_key)
  const ordered = verses.slice().sort((a,b)=>cmpVerseKey(a.verse_key,b.verse_key));
  state.orderCorrect = ordered.map(v=>v.verse_key);
  // First stays fixed, rest shuffled
  const first = ordered[0];
  const rest = ordered.slice(1);
  shuffle(rest);
  state.orderUser = [first.verse_key, ...rest.map(v=>v.verse_key)];
  renderOrderList(ordered, rest);
  els.orderResult.textContent = `Page ${page}: arrange verses`;
}

function renderOrderList(correct, restShuffled){
  els.orderList.innerHTML='';
  // First (locked)
  const li0 = document.createElement('li'); li0.textContent = correct[0].text_uthmani || '—'; li0.className='locked'; li0.setAttribute('draggable','false'); li0.dataset.key = correct[0].verse_key; els.orderList.appendChild(li0);
  // Rest (draggable)
  restShuffled.forEach(v => {
    const li = document.createElement('li'); li.textContent = v.text_uthmani || '—'; li.dataset.key = v.verse_key; li.setAttribute('draggable','true'); els.orderList.appendChild(li);
  });
  // Drag handlers
  let dragEl = null;
  els.orderList.querySelectorAll('li:not(.locked)').forEach(li => {
    li.addEventListener('dragstart', (e)=>{ dragEl = li; e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragover', (e)=>{ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    li.addEventListener('drop', (e)=>{ e.preventDefault(); if (!dragEl || dragEl===li) return; const list = Array.from(els.orderList.children); const idxFrom = list.indexOf(dragEl); const idxTo = list.indexOf(li); if (idxFrom<0||idxTo<0) return; if (idxTo===0) return; // cannot drop before locked
      if (idxFrom < idxTo) els.orderList.insertBefore(dragEl, li.nextSibling); else els.orderList.insertBefore(dragEl, li);
    });
  });
}

function checkOrder(){
  const items = Array.from(els.orderList.children);
  const keys = items.map(li=>li.dataset.key).filter(Boolean);
  const correct = state.orderCorrect;
  let ok = 0;
  for (let i=0;i<Math.min(keys.length, correct.length);i++){
    const li = items[i];
    const isCorrect = (keys[i] === correct[i]);
    if (isCorrect) {
      ok++;
      // Lock and highlight correct items
      li.classList.add('correct', 'locked');
      li.setAttribute('draggable','false');
    }
  }
  els.orderResult.textContent = `${ok}/${correct.length} in correct position.`;
}

async function startTest(){
  ensureFont();
  state.rng = seededRng((els.seed && els.seed.value)||'');
  state.recShowMeta = els.recShowMeta ? !!els.recShowMeta.checked : false;
  const verses = await buildScopeVerses();
  state.versesFlat = verses;
  // Hide setup once test starts
  if (els.setupSection) els.setupSection.hidden = true;
  const mode = els.mode.value;
  if (mode === 'recite') runRecite();
  else if (mode === 'mcq') runMcq();
  else runOrder();
}

// Wiring
els.scopeKind.addEventListener('change', ()=>{
  const v = els.scopeKind.value;
  els.scopeSurahs.hidden = v !== 'surahs';
  els.scopeJuz.hidden = v !== 'juz';
  els.scopeHizb.hidden = v !== 'hizb';
});
els.mode.addEventListener('change', ()=>{
  const v = els.mode.value;
  els.xWrapper.hidden = (v !== 'recite');
  if (els.metaWrapper) els.metaWrapper.hidden = (v !== 'recite');
  if (els.fontWrapper) els.fontWrapper.hidden = (v === 'order');
  if (els.fontPx) els.fontPx.disabled = (v === 'order');
  ensureFont();
});
els.fontPx.addEventListener('change', ()=> ensureFont());
els.start.addEventListener('click', ()=> startTest());
if (els.orderCheck) els.orderCheck.addEventListener('click', checkOrder);
if (els.orderNext) els.orderNext.addEventListener('click', ()=> runOrder());

// Initial UI
try { const prefs = JSON.parse(localStorage.getItem(PREFS_KEY)||'{}'); if (typeof prefs.font_px==='number') els.fontPx.value = prefs.font_px; } catch {}
ensureFont();
els.xWrapper.hidden = (els.mode.value !== 'recite');
if (els.metaWrapper) els.metaWrapper.hidden = (els.mode.value !== 'recite');
if (els.fontWrapper) els.fontWrapper.hidden = (els.mode.value === 'order');
if (els.fontPx) els.fontPx.disabled = (els.mode.value === 'order');
