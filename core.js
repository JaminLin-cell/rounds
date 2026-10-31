'use strict';
// Core logic shared by the app (index.html) and the tests (../tests/). No DOM access here.

// ---------- constants ----------
const KEY = 'rounds.v1';
let TODAY_OVERRIDE = null;          // tests pin "today"
let NO_SAVE = false;                // tests never touch the app's storage
// [key, label, low, high] — one shared reference range, no sex adjustment
const LAB_KEYS = [
  ['WBC','WBC',4,10],['Hb','Hb',12,17],['Plt','Plt',150,400],['CRP','CRP',null,5],
  ['BUN','BUN',6,20],['Crea','Crea',0.6,1.3],['Na','Na',135,145],['K','K',3.5,5.1],
  ['AST','AST',null,40],['ALT','ALT',null,40],['BilT','Bil-T',null,1.2]
];
const LAB_SETS = [
  ['全套','CBC/DC, BUN/Crea, AST/ALT/Bil-T, Na/K, CRP'],['CBC/DC','CBC/DC'],['BCS','BUN/Crea, Na/K'],
  ['肝功能','AST/ALT/Bil-T'],['CRP','CRP']
];
const DIETS = ['NG decompression','NPO','Sip water','Clear liquid','Full liquid','Soft','Full'];
const IVF_TYPES = ['NS','LR','D5S','D5W','B-fluid','TPN'];
const IVF_SPECIAL = ['Keep open','On lock'];
const IVF_RATES = [40,60,80,100,120];
const TUBES = ['Foley','VB(L)','VB(R)','JP','NG','DJ(L)','DJ(R)','PCN(L)','PCN(R)','Cystostomy'];
const EXAMS = ['KUB','CT','MRI','Bone scan','Renal echo','Cystography'];
const IMG_PARTS = [['B','Brain'],['C','Chest'],['A','Abdomen'],['P','Pelvis']];
const CONSULTS = ['腎臟科','感染科','心臟科','胸腔科','腸胃科','新陳代謝科','神經內科','復健科','營養師','安寧'];
const VB_COLORS = ['Fresh blood','Dark red','Serosanguineous','Ascites'];
const FOLEY_COLORS = ['Clear','Pink','Light red'];
const CULTURE_SITES = ['U/C','B/C','Sp/C','W/C','Pus/C'];
const DEFAULT_PROCS = ['RARP','RANUx','RAPN','TURBT','TURP','RIRS','PCNL','URS'];
const DEFAULT_ROOMS = ['9','10','11','12','38','39','53'];
const DEFAULT_ROBOT_ROOMS = ['10','38','39','53'];
const DEFAULT_CHECKLIST = [
  {id:'anes', label:'麻醉評估', when:'all'},
  {id:'consent', label:'自費同意書', when:'all'},
  {id:'img', label:'影像已確認', when:'all'},
  {id:'anti', label:'抗凝藥已停', when:'anti'},
  {id:'call', label:'已聯絡病人報到', when:'outpatient'}
];
const PREOP_DAYS = 3;               // every checklist item is due 3 days before surgery
const CARDS = [['dx','主診斷'],['status','Current status'],['preop','術前準備'],['io','I/O'],['labs','Lab'],['orders','Order'],['meds','用藥']];
const ABX_RE = /cef|ceph|penem|piperacillin|tazobactam|tazocin|betamycin|ampicillin|amoxicillin|sulbactam|unasyn|augmentin|curam|oxacillin|penicillin|vancomycin|teicoplanin|floxacin|metronidazole|gentamicin|amikacin|colistin|cycline|clindamycin|baktar|sulfamethoxazole|trimethoprim|fluconazole|micafungin|anidulafungin|voriconazole|isavuconazole|nitrofurantoin|fosfomycin|linezolid|daptomycin|azithromycin|clarithromycin|flomoxef|cefa/i;
// Typical pre-op hold days (reference only; follow attending / anesthesia instructions)
const ANTI = [
  ['Aspirin',/aspirin|bokey|\basa\b/i,7],['Clopidogrel',/clopidogrel|plavix/i,5],['Ticagrelor',/ticagrelor|brilinta/i,5],
  ['Prasugrel',/prasugrel|efient/i,7],['Cilostazol',/cilostazol|pletaal/i,2],['Warfarin',/warfarin|coumadin/i,5],
  ['Rivaroxaban',/rivaroxaban|xarelto/i,2],['Apixaban',/apixaban|eliquis/i,2],['Edoxaban',/edoxaban|lixiana/i,2],
  ['Dabigatran',/dabigatran|pradaxa/i,2]
];
const WD = '日一二三四五六';
const ROBOT_RE = /^RA|robot|da ?vinci|達文西/i;

// ---------- date & text helpers ----------
const pad = n => String(n).padStart(2,'0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today = () => TODAY_OVERRIDE || ymd(new Date());
const dayDiff = (a,b) => Math.round((new Date(b+'T00:00') - new Date(a+'T00:00'))/864e5);
const addDays = (s, n) => { const d = new Date(s+'T00:00'); d.setDate(d.getDate()+n); return ymd(d); };
const md = s => s ? `${+s.slice(5,7)}/${+s.slice(8,10)}` : '';
const wd = s => WD[new Date(s+'T00:00').getDay()];
const ym = s => s.slice(0,7);
const uid = () => Math.random().toString(36).slice(2,10);
const has = v => v !== null && v !== undefined && v !== '';
const stripHash = s => String(s||'').replace(/^\s*#\s*/, '');
function bedShort(b){
  const m = String(b||'').match(/^[A-Z]*0*(\d+)F\d{2}(\d{2}[A-Z]?)$/i);
  return m ? `${m[1]}F${m[2]}` : (b||'');
}
function mdToYmd(mo, d, ref){
  const y = +ref.slice(0,4);
  const s = `${y}-${pad(mo)}-${pad(d)}`;
  return dayDiff(s, ref) > 180 ? `${y+1}-${pad(mo)}-${pad(d)}` : s;
}
// Before surgery: "11/5"; surgery day: "OP"; after: "POD n".
function podLabel(opDate, d){
  if(!opDate) return '';
  const n = dayDiff(opDate, d);
  return n < 0 ? md(opDate) : n === 0 ? 'OP' : `POD${n}`;
}
// "POD1" / "OP" / "今天" / "昨天" / "11/5" / "2026-11-05" -> date, relative to base (the date being viewed).
function parseOpInput(s, base){
  s = String(s||'').trim(); if(!s) return '';
  let m;
  if((m = s.match(/^POD\s*#?\s*(\d+)$/i))) return addDays(base, -m[1]);
  if(/^(OP|今天|today)$/i.test(s)) return base;
  if(/^(昨天|yesterday)$/i.test(s)) return addDays(base, -1);
  if(/^(明天|tomorrow)$/i.test(s)) return addDays(base, 1);
  if((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if((m = s.match(/^(\d{1,2})\/(\d{1,2})$/))) return mdToYmd(m[1], m[2], base);
  return null;
}
// W1 = Monday ... W7 = Sunday; the first such day after `from`.
function nextWeekday(from, w){
  const target = w % 7;
  for(let i = 1; i <= 7; i++){ const d = addDays(from, i); if(new Date(d+'T00:00').getDay() === target) return d; }
}

// ---------- state ----------
let S = emptyState();
function emptyState(){
  return {version:2, patients:{}, surgeries:{}, attendings:[], months:{}, settings:{
    filter:'', layout:CARDS.map(c => c[0]), hidden:[], procedures:[...DEFAULT_PROCS], rooms:[...DEFAULT_ROOMS],
    robotRooms:[...DEFAULT_ROBOT_ROOMS], checklist:DEFAULT_CHECKLIST.map(c => ({...c})), lastBackup:null
  }};
}
function emptyStatus(){ return {diet:null, ivf:null, tubes:[], exams:[], cultures:[]}; }
function migrate(s){
  if(!s || !s.patients) return emptyState();
  const base = emptyState();
  s.surgeries = s.surgeries || {};
  s.attendings = s.attendings || [];
  s.months = s.months || {};
  s.settings = {...base.settings, ...(s.settings || {})};
  for(const c of CARDS) if(!s.settings.layout.includes(c[0])) s.settings.layout.push(c[0]);
  for(const p of Object.values(s.patients)){
    if(p.active === false && !p.dischargedOn && !p.planned) p.dischargedOn = p.lastSeen || today();
    if(p.planned && !p.adm && !p.plannedAdm) p.plannedAdm = p.opDate || today();
    delete p.active;
    p.short = stripHash(p.short); p.dx = stripHash(p.dx);
    p.status = {...emptyStatus(), ...(p.status || {})};
    p.todos = p.todos || []; p.labs = p.labs || {}; p.io = p.io || {}; p.meds = p.meds || []; p.abx = p.abx || {}; p.history = p.history || [];
    for(const d of Object.keys(p.io)){
      for(const it of p.io[d].items || []) if(!it.cat){ it.cat = guessCat(it.name); if(has(it.value) && !has(it.total)) it.total = it.value; delete it.value; }
    }
  }
  s.version = 2;
  return s;
}
function loadState(){
  let s = null;
  try{ s = JSON.parse(localStorage.getItem(KEY)); }catch(e){}
  return migrate(s);
}
function saveState(){
  if(NO_SAVE) return true;
  try{ localStorage.setItem(KEY, JSON.stringify(S)); return true; }catch(e){ return false; }
}
function newPatient(mrn){ return {mrn, labs:{}, io:{}, todos:[], abx:{}, meds:[], history:[], status:emptyStatus()}; }

// ---------- list membership by date ----------
const isPending = p => !!(p.planned && !p.adm);   // pre-admission, not yet seen in TeamPro
// Which stay (current or past) puts this patient on the list for date d.
function stayOn(p, d){
  const start = p.adm || p.plannedAdm;
  const projectedOut = !p.dischargedOn && p.mbd && d > p.mbd && d > today();   // expected discharge, future views only
  if(start && start <= d && (!p.dischargedOn || d < p.dischargedOn) && !projectedOut) return {current:true};
  for(const h of p.history || []) if(h.adm <= d && (!h.dischargedOn || d < h.dischargedOn)) return {current:false, dx:h.dx, opDate:h.opDate};
  return null;
}
function attOrder(p){ const i = S.attendings.indexOf(p.attending); return i < 0 ? 999 : i; }
function patientsOn(d, filter){
  return Object.values(S.patients).filter(p => (!filter || p.attending === filter) && stayOn(p, d))
    .sort((a,b) => attOrder(a) - attOrder(b) || String(a.bed||'~').localeCompare(String(b.bed||'~')));
}
const admittedNow = p => { if(isPending(p)) return false; const st = stayOn(p, today()); return !!(st && st.current); };

// List label: short dx with live counters ("Abx D3", "C3D2"); the POD/OP date is shown separately.
function displayShort(p, d){
  let s = p.short || p.dx || '';
  const starts = Object.values(p.abx || {}).sort();
  if(starts.length) s = s.replace(/\bAbx(\s*D\d+)?\b/i, `Abx D${dayDiff(starts[0], d) + 1}`);
  if(p.cycle && p.cycle.d1) s = s.replace(/\bC\d+\s*D\d+\b/i, `C${p.cycle.c}D${dayDiff(p.cycle.d1, d) + 1}`);
  return s;
}

// ---------- TeamPro parsing ----------
const HEAD = /病歷號[:：]\s*(\d+)\s+姓名[:：]\s*(\S+)\s+年齡[:：]\s*(\d+)\s+(\S+)\s+入院日期[:：]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/;
const MED = /^(.+?)\s+([\d.\/]+)\s*(PC|MG|GT|BT|PU|PK|ML|UN|IU|U|G|GM|MCG|CC|AMP|VI|TAB|CAP|SUP|PUFF|DROP)\s+([A-Z0-9]+)\s*$/i;
const ATT_LINE = /^([A-Z]{1,3}\d{3,5})$/i;        // attending code on its own line, e.g. MA1234
const PRE_HEAD = /^病歷號[:：]\s*(\d+)\s*(.*)$/;     // pre-admission entry: 病歷號 without bed/admission date
const HX_HEAD = /^(underlying(?:\s+(?:hx|disease|history))?|hx|u\/d|past\s+(?:medical\s+)?history|pmh|病史)\s*[:：]?\s*(.*)$/i;
const BULLET = /^[.\-•·*‧・]\s*/;
const EXAM_RE = /\b(CT|MRI|bone scan|PET|KUB|echo|sono|cystography|cystoscopy|IVP|RGP|renal scan|VCUG|uroflow)\b/i;
const CULTURE_RE = /\b(U\/C|B\/C|Sp\/C|W\/C|Pus\/C)\s*[:：]\s*([^,;，；]+)/gi;

function cleanMed(s){
  s = s.replace(/^\[[^\]]*\]/, '');
  const w = s.match(/^自備藥口服\s*[\(（](.*)[\)）]\s*$/); if(w) s = w[1];
  s = s.replace(/[\(（]自備藥[\)）]/g, '');
  let prev;
  do { prev = s; s = s.replace(/(.)\s*[\(（][^()（）]*[\)）]/g, '$1'); } while(s !== prev);
  s = s.replace(/\/(prefilled syringe|tab|cap|vial|amp|bot|bag|sachet|syringe|dose|pc)\b/gi, '');
  s = s.replace(/,\s*\d+\s*dose\b/gi, '').replace(/\binj\b\.?/gi, '');
  s = s.replace(/^[\(（](.*)[\)）]$/, '$1');
  s = s.replace(/,\s*\d{1,2}:\d{2}\b/g, '').replace(/\s*"[^"]*"?/g, '');
  const dup = s.match(/^([A-Za-z]+)\s*,\s*(.*)$/); // "Alprazolam , Alprazolam Tablets 0.5mg"
  if(dup && dup[2].toLowerCase().startsWith(dup[1].toLowerCase())) s = dup[2].replace(/\s+Tablets?\b/i, '');
  return s.replace(/\s+/g,' ').replace(/[\s,]+$/,'').trim();
}
const isAbx = raw => ABX_RE.test(raw) && !/\boph\b|eye|oint|cream|gel/i.test(raw);
const abxKey = n => n.split(/[\s(]/)[0].toLowerCase();
function fmtDose(n,u){ u = u.toUpperCase(); return u === 'PC' ? n : n + u.toLowerCase(); }
function findAnti(text){
  const out = [];
  for(const [name, re] of ANTI){
    if(!re.test(text)) continue;
    const src = `(?:${re.source})`;
    const near = text.match(new RegExp(src + '[^\\n]*?停\\s*(\\d+)\\s*天', 'i')) || text.match(new RegExp(src + '[^\\n]*?(?:hold|stop)\\s*(\\d+)\\s*d', 'i'));
    out.push({drug:name, holdDays: near && near[1] ? +near[1] : null});
  }
  return out;
}
// "Chest CT 11/2 10am, bone scan 11/3 13:00" -> one exam per piece, keeping the text as typed.
function parseExams(l, ref){
  return l.split(/[,，;；]/).map(s => s.trim()).filter(s => s && EXAM_RE.test(s)).map(text => {
    const m = text.match(/(\d{1,2})\/(\d{1,2})/);
    return {id:uid(), text, date: m ? mdToYmd(m[1], m[2], ref) : null};
  });
}
function parseCultures(l){
  const out = []; let m; CULTURE_RE.lastIndex = 0;
  while((m = CULTURE_RE.exec(l))) out.push({site:m[1].replace(/^(.)(.*)$/, (a,b,c) => b.toUpperCase() + c), org:m[2].trim()});
  return out;
}
function parseCycle(s, ref){
  const m = String(s||'').match(/\bC(\d+)\s*D(\d+)\b/i);
  return m ? {c:+m[1], d1:addDays(ref, -(m[2]-1))} : null;
}

// Free-text lines typed under a patient: dx, sex, Hx block, iPSA/PV/MRI, exams, cultures, notes.
// Offline fallback; with an API key Claude sorts the text instead (organizeNotes in index.html).
function parseNotes(rawLines, ref){
  const o = {}; const extra = []; const hx = []; const exams = []; const cultures = [];
  let inHx = false;
  for(const raw of rawLines){
    let l = raw.trim(); if(!l) continue;
    const indented = /^\s{2,}/.test(raw);
    let m;
    if((m = l.match(/^(\d{1,3})\s*([MF])\b[,，\s]*/))){ o.sex = m[2]; l = l.slice(m[0].length).trim(); if(!l) continue; }
    else if((m = l.match(/^([MF])\s*(?:[,，]|$)\s*/))){ o.sex = m[1]; l = l.slice(m[0].length).trim(); if(!l) continue; }
    if((m = l.match(HX_HEAD))){ inHx = true; if(m[2]) hx.push(...m[2].split(/[;；]/).map(s => s.replace(BULLET,'').trim()).filter(Boolean)); continue; }
    if(inHx && BULLET.test(l)){ hx.push(l.replace(BULLET,'')); continue; }
    if(inHx && indented && hx.length){ hx[hx.length-1] += ' ' + l; continue; }
    inHx = false;
    const cs = parseCultures(l); if(cs.length){ cultures.push(...cs); continue; }
    let used = false;
    if((m = l.match(/\bi?PSA\s*[:：=]?\s*([\d.]+)/i))){ o.ipsa = m[1]; used = true; }
    if((m = l.match(/\b(?:PV|prostate volume)\s*[:：=]?\s*([\d.]+)/i))){ o.pv = m[1]; used = true; }
    if((m = l.match(/\bMRI\s*[:：]\s*([^,，;；]+)/i))){ o.mri = m[1].trim(); used = true; }
    if(used) continue;
    if(!o.dx){
      let dx = stripHash(l);
      if((m = dx.match(/\bPOD\s*#?\s*(\d+)\b/i))){ o.opDate = addDays(ref, -m[1]); dx = dx.replace(m[0], ''); }
      else if((m = dx.match(/(?:\bOP|手術)\s*[:：]?\s*(\d{1,2})\/(\d{1,2})|(\d{1,2})\/(\d{1,2})\s*(?:OP\b|手術)/i))){
        o.opDate = mdToYmd(m[1]||m[3], m[2]||m[4], ref); dx = dx.replace(m[0], '');
      }
      dx = dx.replace(/\s+/g,' ').replace(/[\s,;]+$/,'').trim();
      const parts = dx.split(/\s*\|\s*/);          // "RAPN | Robotic Lt' partial Nx" = list name | full dx
      if(parts.length > 1){ o.short = parts[0]; o.dx = parts.slice(1).join(' | '); } else o.dx = dx;
      continue;
    }
    if(EXAM_RE.test(l) && /\d{1,2}\/\d{1,2}/.test(l)){ exams.push(...parseExams(l, ref)); continue; }
    if(ANTI.some(([, re]) => re.test(l))){ hx.push(l); continue; }   // "CAD under Aspirin" belongs with Hx
    extra.push(l);
  }
  if(hx.length) o.hx = hx;
  if(exams.length) o.exams = exams;
  if(cultures.length) o.cultures = cultures;
  if(extra.length) o.note = extra.join('\n');
  o.anti = findAnti(rawLines.join('\n'));
  const cyc = parseCycle(o.short || o.dx, ref); if(cyc) o.cycle = cyc;
  return o;
}

function parseTeamPro(text){
  const pts = [], pres = [], bad = [], atts = [];
  let cur = null, att = '';
  const t = today();
  for(const raw0 of String(text).split(/\r?\n/)){
    const raw = raw0.replace(/ /g,' ');
    const line = raw.trim();
    if(!line) continue;
    const a = line.match(ATT_LINE);
    if(a){ att = a[1].toUpperCase(); if(!atts.includes(att)) atts.push(att); cur = null; continue; }
    const h = line.match(HEAD);
    if(h){
      cur = {mrn:h[1], name:h[2], age:+h[3], bed:h[4], adm:`${h[5]}-${pad(h[6])}-${pad(h[7])}`, att, notes:[], meds:[]};
      pts.push(cur); continue;
    }
    const pre = line.match(PRE_HEAD);
    if(pre){
      const rest = pre[2], nm = rest.match(/姓名[:：]\s*(\S+)/), dt = rest.match(/(\d{1,2})\/(\d{1,2})/);
      cur = {mrn:pre[1], name:nm ? nm[1] : '', admDate:dt ? mdToYmd(dt[1], dt[2], t) : '', att, notes:[], meds:null};
      pres.push(cur); continue;
    }
    if(!cur){ bad.push(line); continue; }
    const m = line.match(MED);
    if(cur.meds === null || (!m && !cur.meds.length)){ cur.notes.push(raw); continue; }
    const name = m ? m[1] : line;
    cur.meds.push({n:cleanMed(name), d:m?fmtDose(m[2],m[3]):'', f:m?m[4].toUpperCase():'', own:/自備藥/.test(name), abx:isAbx(name)});
  }
  for(const q of [...pts, ...pres]) q.info = parseNotes(q.notes, t);
  return {pts, pres, bad, atts};
}
const noteText = q => q.notes.join('\n').trim();

function applyInfo(p, info){
  for(const k of ['dx','opDate','ipsa','pv','mri','sex']) if(has(info[k])) p[k] = info[k];
  if(has(info.note)) p.note = [p.note, info.note].filter(Boolean).filter((v,i,a) => a.indexOf(v) === i).join('\n');
  if(info.hx && info.hx.length) p.hx = info.hx.join('\n');
  if(has(info.dx)) p.short = info.short || info.dx;
  if(info.anti && info.anti.length) p.anti = info.anti;
  if(info.cycle) p.cycle = info.cycle;
  p.status = p.status || emptyStatus();
  for(const e of info.exams || []) if(!p.status.exams.some(x => x.text === e.text)) p.status.exams.push({...e, id:e.id || uid()});
  for(const c of info.cultures || []) if(!p.status.cultures.some(x => x.site === c.site && x.org === c.org)) p.status.cultures.push(c);
}

function diffMeds(a, b){
  const group = list => { const g = new Map(); for(const m of list){ const k = m.n.toLowerCase(); g.set(k, [...(g.get(k)||[]), `${m.d} ${m.f}`].sort()); } return g; };
  const A = group(a), B = group(b);
  const added = [], changed = [], stopped = [];
  for(const [k,v] of B){ if(!A.has(k)) added.push(k); else if(A.get(k).join('|') !== v.join('|')) changed.push(k); }
  for(const m of a){ const k = m.n.toLowerCase(); if(!B.has(k) && !stopped.some(x => x.n.toLowerCase() === k)) stopped.push(m); }
  return {added, changed, stopped};
}
const medDiffCount = p => { const d = p.medDiff; return d ? d.added.length + d.changed.length + d.stopped.length : 0; };

// ---------- import ----------
// A previously discharged patient showing up with a new admission date.
const isReadmit = (p, q) => !!(p && p.adm && p.dischargedOn && p.adm !== q.adm);
function archiveStay(p){
  p.history = p.history || [];
  p.history.unshift({adm:p.adm, dischargedOn:p.dischargedOn || '', dx:p.short || p.dx || '', opDate:p.opDate || ''});
  Object.assign(p, {adm:'', dischargedOn:null, dx:'', short:'', opDate:'', cycle:null, todos:[], io:{}, abx:{}, meds:[], medsPrev:null,
    medDiff:null, medsDate:null, bed:'', prevBed:'', anti:null, mbd:null, surgId:null, status:emptyStatus()});
}
function planImport(parsed){
  const mrns = new Set(parsed.pts.map(p => p.mrn));
  const atts = new Set(parsed.pts.map(q => q.att));
  // TeamPro paste = the complete list for each attending it contains; missing ones have been discharged
  const missing = Object.values(S.patients).filter(p => admittedNow(p) && !mrns.has(p.mrn) && atts.has(p.attending || '') && !p.mrn.startsWith('tmp-'));
  // manually added patients without MRN that look like one of the imported patients
  const merges = [];
  for(const q of parsed.pts){
    if(S.patients[q.mrn]) continue;
    const tmp = Object.values(S.patients).find(p => p.mrn.startsWith('tmp-') && admittedNow(p) && ((p.name && p.name === q.name) || (p.bed && bedShort(p.bed) === bedShort(q.bed))));
    if(tmp && !merges.some(m => m.tmp === tmp.mrn)) merges.push({tmp:tmp.mrn, mrn:q.mrn, name:q.name, tmpName:tmp.name, tmpBed:tmp.bed});
  }
  return {
    newOnes: parsed.pts.filter(q => !S.patients[q.mrn] || isPending(S.patients[q.mrn])),
    readmits: parsed.pts.filter(q => isReadmit(S.patients[q.mrn], q)),
    moved: parsed.pts.filter(q => { const p = S.patients[q.mrn]; return p && admittedNow(p) && p.bed && p.bed !== q.bed; }),
    withInfo: parsed.pts.filter(q => q.info.dx),
    surgeries: parsed.pts.filter(q => findSurgeryFor(q.mrn, q.adm)),
    missing, merges
  };
}
function applyImport(parsed, dischargeMrns, mergePairs){
  const t = today();
  for(const q of [...parsed.pts, ...parsed.pres]) if(q.att && !S.attendings.includes(q.att)) S.attendings.push(q.att);
  for(const {tmp, mrn} of mergePairs || []){
    const old = S.patients[tmp]; if(!old || S.patients[mrn]) continue;
    S.patients[mrn] = {...old, mrn}; delete S.patients[tmp];
  }
  for(const q of parsed.pres){
    const p = S.patients[q.mrn] || (S.patients[q.mrn] = newPatient(q.mrn));
    if(admittedNow(p)){ applyInfo(p, q.info); continue; }
    if(p.adm) archiveStay(p);
    Object.assign(p, {planned:true, plannedAdm:q.admDate || p.plannedAdm || t, name:q.name || p.name || '', attending:q.att || p.attending || ''});
    applyInfo(p, q.info);
  }
  for(const q of parsed.pts){
    let p = S.patients[q.mrn];
    if(!p) p = S.patients[q.mrn] = newPatient(q.mrn);
    if(isReadmit(p, q)) archiveStay(p);
    if(p.bed && p.bed !== q.bed && admittedNow(p)){ p.prevBed = p.bed; p.bedChangedOn = t; }
    Object.assign(p, {name:q.name, age:q.age, bed:q.bed, adm:q.adm, attending:q.att || p.attending || '', planned:false, plannedAdm:null, dischargedOn:null, lastSeen:t});
    applyInfo(p, q.info);
    linkSurgery(p);
    if(p.medsDate !== t){ if(p.medsDate) p.medsPrev = p.meds; p.medsDate = t; }
    p.meds = q.meds;
    p.medDiff = p.medsPrev ? diffMeds(p.medsPrev, p.meds) : null;
    // antibiotic day counting: first import assumes started on admission
    const seen = new Set();
    p.abx = p.abx || {};
    for(const m of p.meds) if(m.abx){
      const k = abxKey(m.n); seen.add(k);
      if(!p.abx[k]) p.abx[k] = p.medsPrev ? t : (p.adm || t);
    }
    for(const k of Object.keys(p.abx)) if(!seen.has(k)) delete p.abx[k];
  }
  for(const mrn of dischargeMrns){ const p = S.patients[mrn]; if(p) p.dischargedOn = t; }
}
// Lines starting with a bed number add info to patients already on today's list ("3F21A Hx: DM").
function parseSupplement(text){
  const groups = []; let cur = null;
  for(const raw of String(text).split(/\r?\n/)){
    const m = raw.trim().match(/^([A-Z]?\d{1,2}F\d{2,4}[A-Z]?)\s*[:：]?\s*(.*)$/i);
    if(m){ cur = {bed:m[1].toUpperCase(), lines:m[2] ? [m[2]] : []}; groups.push(cur); continue; }
    if(cur) cur.lines.push(raw);
  }
  const pts = patientsOn(today(), '');
  return groups.map(g => ({...g, patient: pts.find(p => bedShort(p.bed).toUpperCase() === bedShort(g.bed).toUpperCase() || String(p.bed).toUpperCase() === g.bed) || null}));
}

// ---------- current status & orders ----------
// Each structured order updates the patient's status and returns the order text.
function applyOrder(p, kind, data, d){
  const st = p.status = p.status || emptyStatus();
  let t = '';
  switch(kind){
    case 'diet': {
      const prev = st.diet && st.diet.v;
      st.diet = {v:data.v, since:d};
      t = prev && prev !== data.v ? `${prev} → ${data.v}` : data.v; break;
    }
    case 'ivf': {
      const prev = st.ivf && st.ivf.v;
      if(data.v === 'DC'){ st.ivf = null; t = prev ? `DC IVF (${prev})` : 'DC IVF'; break; }
      st.ivf = {v:data.v, since:d};
      const pm = prev && prev.match(/^(.*?)\s*(\d+)$/), nm = data.v.match(/^(.*?)\s*(\d+)$/);
      t = 'IVF ' + (pm && nm && pm[1] === nm[1] ? `${prev} → ${nm[2]}` : prev ? `${prev} → ${data.v}` : data.v); break;
    }
    case 'lab': t = `${data.set} on ${data.label} (${md(data.due)})`; break;
    case 'exam': {
      const e = {id:uid(), text:data.text, date:data.date || null};
      st.exams.push(e);
      t = 'Arrange ' + data.text; break;
    }
    case 'tubeOut': st.tubes = st.tubes.filter(x => x.name !== data.name); t = `拔 ${data.name}`; break;
    case 'tubeIn': if(!st.tubes.some(x => x.name === data.name)) st.tubes.push({name:data.name, since:d}); t = `放 ${data.name}`; break;
    case 'drugAdd': t = `Add ${data.name}${data.self ? '（自費）' : ''}`; break;
    case 'drugDC': t = `DC ${data.name}`; break;
    case 'consult': t = `Consult ${data.dept}`; break;
    case 'mbd': p.mbd = data.date; t = `MBD ${md(data.date)}`; break;
    case 'rtc': p.rtc = data.date; t = `RTC ${md(data.date)}（${wd(data.date)}）`; break;
    default: t = data.text || '';
  }
  return t;
}
function addTodo(p, text, opts){
  text = String(text||'').trim(); if(!text) return null;
  const o = opts || {};
  const x = {id:uid(), t:text, d:o.d || today(), done:false, due:o.due || null, kind:o.kind || null};
  (p.todos = p.todos || []).push(x);
  return x;
}
// Lab reminders: a lab order is due on its date (today also shows overdue ones) until labs for that date are entered.
function labDue(p, d){
  return (p.todos || []).filter(x => x.kind === 'lab' && !x.done && x.due && (x.due === d || (d === today() && x.due < d)));
}
function markLabsDone(p, date){
  for(const x of p.todos || []) if(x.kind === 'lab' && !x.done && x.due && x.due <= date){ x.done = true; x.doneOn = date; }
}
function remindersOn(d){
  const out = [];
  for(const p of patientsOn(d, '')) for(const x of p.todos || [])
    if(x.due && !x.done && (x.due === d || (d === today() && x.due < d))) out.push({p, x});
  return out;
}
function dischargeMeds(p){ return (p.meds || []).filter(m => !m.own); }
function antiList(p){
  const list = [...(p.anti || [])];
  for(const a of findAnti(p.hx || '')) if(!list.some(x => x.drug === a.drug)) list.push(a);
  for(const a of findAnti((p.meds || []).map(m => m.n).join('\n'))) if(!list.some(x => x.drug === a.drug)) list.push({...a, onMed:true});
  return list.map(a => {
    const days = a.holdDays ?? (ANTI.find(x => x[0] === a.drug) || [])[2] ?? null;
    return {...a, days, ref:a.holdDays == null, stop: p.opDate && days ? addDays(p.opDate, -days) : null};
  });
}
// Hx lines with the antithrombotic stop date written inline: "CAD s/p PCI, on aspirin（11/4 停用）".
function hxLines(p){
  const lines = String(p.hx || '').split('\n').map(s => s.trim()).filter(Boolean).map(text => ({text, anti:null}));
  for(const a of antiList(p)){
    const re = (ANTI.find(x => x[0] === a.drug) || [])[1];
    const line = re && lines.find(l => re.test(l.text));
    if(line) line.anti = a; else lines.push({text:a.drug, anti:a});
  }
  return lines.map(l => ({text:l.text, tag: !l.anti ? '' : l.anti.stop ? `（${md(l.anti.stop)} 停用）` : l.anti.days ? `（術前停 ${l.anti.days} 天）` : ''}));
}

// ---------- RTC suggestion from this month's clinic days ----------
function clinicDays(att, date){
  const m = S.months[ym(date)] || Object.values(S.months).slice(-1)[0];
  const a = m && (m.attendings || []).find(x => x.code === att);
  return a ? a.days : [];
}
function suggestRTC(att, from){
  const days = clinicDays(att, from);
  if(!days.length) return [addDays(from, 7), addDays(from, 14)];
  const out = []; let d = addDays(from, 5);
  for(let i = 0; i < 40 && out.length < 3; i++, d = addDays(d, 1)) if(days.includes(new Date(d+'T00:00').getDay())) out.push(d);
  return out;
}

// ---------- I/O ----------
function guessCat(name){
  const n = String(name||'');
  if(/飲食|藥物|點滴|輸血|IVF|TPN|intake|oral|含水|PO\b/i.test(n)) return 'intake';
  if(/尿|urine|foley|U\/?O\b|void|cystostomy|PCN/i.test(n)) return 'urine';
  if(/VB|vacuum|hemovac|JP|drain|引流/i.test(n)) return 'vb';
  return 'other';
}
const ioTotal = it => has(it.total) ? +it.total : (['d','e','n'].some(k => has(it[k])) ? ['d','e','n'].reduce((s,k) => s + (+it[k] || 0), 0) : null);
// Rows for display: Intake (or NG decompression), Urine, each VB, others.
function ioRows(p, date){
  const rec = p.io && p.io[date]; if(!rec) return [];
  const items = rec.items || [];
  const sum = list => {
    const r = {d:null, e:null, n:null, total:null};
    for(const it of list){ for(const k of ['d','e','n']) if(has(it[k])) r[k] = (r[k] || 0) + +it[k]; const t = ioTotal(it); if(t != null) r.total = (r.total || 0) + t; }
    return r;
  };
  const rows = [];
  const ngDecomp = p.status && p.status.diet && p.status.diet.v === 'NG decompression';
  const ng = items.filter(it => /\bNG\b/i.test(it.name));
  if(ngDecomp) rows.push({label:'NG decompression', ...sum(ng), parts:[]});
  const intake = items.filter(it => it.cat === 'intake');
  if(!ngDecomp && intake.length) rows.push({label:'Intake', ...sum(intake), parts:intake.length > 1 ? intake.map(it => `${it.name} ${ioTotal(it) ?? ''}`) : []});
  const urine = items.filter(it => it.cat === 'urine');
  if(urine.length) rows.push({label:'Urine', ...sum(urine), parts:urine.length > 1 ? urine.map(it => `${it.name} ${ioTotal(it) ?? ''}`) : [], color:urine.map(it => it.color).filter(Boolean).join(', '), irrigation:urine.some(it => it.irrigation)});
  for(const it of items.filter(it => it.cat === 'vb')) rows.push({label:it.name, ...sum([it]), parts:[], color:it.color || ''});
  for(const it of items.filter(it => it.cat === 'other' && !(ngDecomp && /\bNG\b/i.test(it.name)))) rows.push({label:it.name, ...sum([it]), parts:[]});
  return rows;
}

// ---------- surgeries ----------
function surgItems(s){
  return (S.settings.checklist || DEFAULT_CHECKLIST).filter(c => c.when === 'all' || (c.when === 'outpatient' && s.outpatient) || (c.when === 'anti' && s.anti));
}
// green = all done, orange = pending, red = overdue (past OP-3 and still incomplete)
function surgState(s){
  const items = surgItems(s);
  const done = items.filter(c => s.checks && s.checks[c.id]).length;
  const complete = done === items.length;
  const overdue = !complete && today() > addDays(s.date, -PREOP_DAYS) && today() <= s.date;
  return {done, total:items.length, complete, overdue, color: complete ? 'ok' : overdue ? 'late' : 'pend'};
}
function surgeriesOn(d, att){
  return Object.values(S.surgeries).filter(s => s.date === d && !s.cancelled && (!att || s.attending === att))
    .sort((a,b) => String(a.room).localeCompare(String(b.room), undefined, {numeric:true}) || (a.order||0) - (b.order||0));
}
const isRobot = proc => ROBOT_RE.test(proc || '');
function findSurgeryFor(mrn, adm){
  return Object.values(S.surgeries).filter(s => s.mrn === mrn && !s.cancelled && (!adm || s.date >= addDays(adm, -1)))
    .sort((a,b) => a.date.localeCompare(b.date))[0] || null;
}
// On admission: the booked surgery fills in the dx and surgery date.
function linkSurgery(p){
  const s = findSurgeryFor(p.mrn, p.adm || p.plannedAdm); if(!s) return null;
  if(!p.opDate || p.surgId === s.id) p.opDate = s.date;
  if(!p.short && !p.dx){ p.short = s.proc; p.dx = s.proc; }
  if(s.anti && !(p.anti || []).length) p.anti = [{drug:s.anti, holdDays:null}];
  if(!p.name && s.name) p.name = s.name;
  p.surgId = s.id;
  return s;
}
function linkedSurgery(p){ return (p.surgId && S.surgeries[p.surgId]) || findSurgeryFor(p.mrn, p.adm || p.plannedAdm); }
function setSurgeryDate(s, date){
  s.date = date;
  for(const p of Object.values(S.patients)) if(p.surgId === s.id) p.opDate = date;
}
// Month-start paste: "11/4 OR8 6012345 陳ＯＯ RARP 門診 aspirin", with attending code lines.
function parseORPaste(text, ref){
  const out = []; let att = '', date = '';
  const procs = S.settings.procedures || DEFAULT_PROCS;
  for(const raw of String(text).split(/\r?\n/)){
    let l = raw.trim(); if(!l) continue;
    const a = l.match(ATT_LINE); if(a){ att = a[1].toUpperCase(); continue; }
    let m;
    if((m = l.match(/(\d{1,2})\/(\d{1,2})/))){ date = mdToYmd(m[1], m[2], ref); l = l.replace(m[0], ' '); }
    let room = '';
    if((m = l.match(/(?:\bOR\s*#?|房\s*)(\d{1,3})\b|\b(\d{1,3})\s*房/i))){ room = m[1] || m[2]; l = l.replace(m[0], ' '); }
    let mrn = '';
    if((m = l.match(/\b(\d{6,9})\b/))){ mrn = m[1]; l = l.replace(m[0], ' '); }
    const outpatient = /門診|OPD|日間/i.test(l); l = l.replace(/門診手術|門診|OPD|日間/gi, ' ');
    const anti = findAnti(l)[0]; if(anti) l = l.replace((ANTI.find(x => x[0] === anti.drug) || [])[1], ' ');
    let name = '';
    if((m = l.match(/[一-鿿Ｏ○]{2,4}/))){ name = m[0]; l = l.replace(m[0], ' '); }
    l = l.replace(/\s+/g, ' ').trim();
    const known = procs.find(p => new RegExp('(^|\\s)' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i').test(l));
    const proc = known || l;
    if(!date || (!mrn && !name)) continue;
    out.push({id:uid(), mrn, name, date, attending:att, proc, room, outpatient, anti:anti ? anti.drug : null, checks:{}, note:''});
  }
  return out;
}
