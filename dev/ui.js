// ---- 画面(DOM を使うのはここだけ)
(() => {
'use strict';
/* global Plan, SAMPLE_TEXT, HELP_HTML */
const $ = (s) => document.querySelector(s);
const srcEl = $('#src'), hlEl = $('#hl'), msgEl = $('#msg'), viewEl = $('#view'), canvasEl = $('#canvas'), editEl = $('#edit'), viewKindEl = $('#viewKind');
const LINE_PX = 19.5;
let last = null;          // 最後の解析の結果
let lastOk = null;        // 最後にエラーなく解析できた結果(エラーの間にビューを切り替えたとき、薄く描くのに使う)
let shownSvg = null;      // いま表示している図
let selectedId = null;
let fileBase = 'plan';    // 画像を保存するときの名前のもと(拡張子なし)
let fileName = '';        // 開いている・保存したテキストのファイル名(なければ空)
let fileHandle = null;    // 上書き保存の先(Chrome・Edge のファイル操作機能。開き直すと忘れる)
let savedText = null;     // 比べる相手: 最後に開いた・保存したファイルの中身(なければ null)。version: を上げるかを決めるのに使う。自動保持にも残す
let dirty = false;        // 保存していない変更があるか
let editGen = 0;          // 編集の世代(保存の書き込み中に編集されたかを見分ける)
let docGen = 0;           // 内容の世代(開く・新規・例で別の内容に替わったかを見分ける。普通の編集では変わらない)
let opening = true;
let debounce = null;

for (const v of Plan.VIEWS) viewKindEl.append(new Option(v.label, v.id));
// 今日の日付(この端末の時刻。ガントチャートの今日の線と遅れの印に使う。仕様書 7.5 節)
const todayStr = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
let drawnToday = todayStr();
// 担当者別ガントチャートの並び(表示だけ。テキストにも自動保持にも残さない)。null は書いた順
let peopleSort = null;
function toggleSort(k) { peopleSort = peopleSort?.key !== k ? { key: k, dir: 'asc' } : peopleSort.dir === 'asc' ? { key: k, dir: 'desc' } : null; draw(); }

// ---- 色付け(予約語・日付・数・注)
const escH = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function hlLine(line) {
  // 注を分ける
  let cut = line.length;
  for (let k = 0; k < line.length - 1; k++) if (line[k] === '/' && line[k + 1] === '/' && (k === 0 || line[k - 1] === ' ' || line[k - 1] === '\t')) { cut = k; break; }
  const body = line.slice(0, cut), cm = line.slice(cut);
  let h = escH(body)
    .replace(/^(version|start|end|off|members|FBS|PBS|WBS):/, '<span class="kw">$1:</span>')
    .replace(/(^|[ \t])(realizes|for|days|by|review|after|status|note|mop\*?|off):/g, '$1<span class="kw">$2:</span>')
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, '<span class="nu">$1</span>')
    .replace(/\b(mon|tue|wed|thu|fri|sat|sun)\b/g, '<span class="nu">$1</span>');
  if (cm) h += `<span class="cm">${escH(cm)}</span>`;
  return h;
}
function updateHighlight() {
  hlEl.innerHTML = srcEl.value.split('\n').map(hlLine).join('\n') + '\n';
  syncScroll();
}
function syncScroll() { hlEl.scrollTop = srcEl.scrollTop; hlEl.scrollLeft = srcEl.scrollLeft; }
srcEl.addEventListener('scroll', syncScroll);

// ---- 解析と描画
function analyze() {
  let r;
  try { r = Plan.analyze(srcEl.value); }
  catch (e) { showInternal(`内部エラー: ${e.message}`); return; }
  last = r;
  if (r.ok) {
    lastOk = r;
    if (opening) {
      // 開いたときは、書いてある最初の節のビューにする。エラーのあるファイルを開いたときは、直ってエラーがなくなったときに決める
      viewKindEl.value = r.sec.FBS ? 'fbs' : r.sec.PBS ? 'pbs' : 'wbs';
      opening = false;
    }
    draw();
  } else if (canvasEl.querySelector('svg')) {
    viewEl.classList.add('stale');
    canvasEl.querySelectorAll('.tbtns').forEach((x) => x.remove()); // 薄く出している図は保存しない(テキストと食い違うため)
    select(null); // エラーの間は、最後に描けた図を薄く出す
  } else {
    canvasEl.textContent = '';
    canvasEl.append(el('div', 'empty', srcEl.value.trim() ? 'エラーを直すと図が出ます(左下の診断を見てください)。' : '左にテキストを書くと、ここに図が出ます。「例を読み込む」で例を、「書き方」で書き方を見られます。'));
  }
  renderDiagnostics(r.diags);
}
function draw() {
  // エラーの間は、最後にエラーなく解析できた結果で描き、薄く表示する
  const r = last?.ok ? last : lastOk;
  if (!r) return;
  let o;
  drawnToday = todayStr();
  const col = { anchors: [], tables: [] }; // 表と題の位置(題の右にボタンを置くため)
  try { o = Plan.render(r, viewKindEl.value, { today: drawnToday, sort: peopleSort, collect: col }); }
  catch (e) { canvasEl.querySelectorAll('.tbtns').forEach((x) => x.remove()); showInternal(`内部エラー(描画): ${e.message}`); return; }
  // 試験で、表示中の図をテキストから描き直して比べるために、並びを残しておく(data-sort とは別の名前にする)
  if (peopleSort) canvasEl.dataset.peopleSort = `${peopleSort.key}:${peopleSort.dir}`; else delete canvasEl.dataset.peopleSort;
  viewEl.classList.toggle('stale', r !== last);
  if (o.svg) { canvasEl.innerHTML = o.svg; shownSvg = o.svg; if (r === last) addPieceButtons(Plan.anchorsOf(r, viewKindEl.value, o.svg, col)); }
  else { canvasEl.textContent = ''; canvasEl.append(el('div', 'empty', o.message)); shownSvg = null; }
  reselect();
}

// ---- 図・表を 1 つずつ保存する・コピーする(仕様書 9 章)
// 各図・各表の題の文字のすぐ右に、表は「コピー」「SVG」「PNG」「PDF」、図は「SVG」「PNG」「PDF」を置く。
// ボタンは図の上に重ねる画面の部品で、保存する画像や印刷には出ない。押しても図の上の操作(選ぶ・ドラッグ)は始めない
const PIECE_TIP = {
  copy: (n) => `「${n}」の表をタブ区切りの文字でコピーする(表計算ソフトや Word の表にそのまま貼れる)`,
  svg: (n, t) => (t ? `「${n}」の表を SVG(ベクター形式)で保存する(題は入れない)` : 'この図を SVG(ベクター形式)で保存する'),
  png: (n, t) => (t ? `「${n}」の表を PNG(2 倍の解像度)で保存する(題は入れない)` : 'この図を PNG(2 倍の解像度)で保存する'),
  pdf: (n, t) => `${t ? `「${n}」の表` : 'この図'}だけを、同じ大きさの紙で印刷する(印刷の画面で「PDF に保存」を選ぶと、余白のない PDF になる。Chrome・Edge で使う)`,
};
// 表は題(ファイル名に使う題)で指す(描き直しで表の数が変わっても、押した表を取り違えないため)
function addPieceButtons(anchors) {
  for (const a of anchors) {
    const isT = a.kind === 'table';
    const name = isT ? a.name : a.id;
    const box = el('span', 'tbtns');
    for (const k of isT ? ['copy', 'svg', 'png', 'pdf'] : ['svg', 'png', 'pdf']) {
      const b = el('button', null, k === 'copy' ? 'コピー' : k.toUpperCase());
      b.dataset.piece = `${isT ? 'table' : 'fig'}:${name}|${k}`;
      b.title = PIECE_TIP[k](name, isT);
      b.addEventListener('click', () => pieceAction(isT ? 'table' : 'fig', name, k, b));
      box.append(b);
    }
    // 下の図に押したことを伝えない(選択を外したり、ドラッグを始めたりしないため)
    for (const ev of ['pointerdown', 'mousedown', 'click', 'dblclick']) box.addEventListener(ev, (e) => e.stopPropagation());
    canvasEl.append(box);
    placeBox(box, a);
  }
}
function pieceAction(kind, ref, k, btn) {
  // 描き直しが残っていれば先に描き直し、日付が変わっていれば今日の線と遅れの印を描き直してから保存する
  if (debounce !== null) { clearTimeout(debounce); debounce = null; analyze(); }
  if (todayStr() !== drawnToday && last?.ok) draw();
  if (!last?.ok || viewEl.classList.contains('stale')) { alert('保存できる図がありません(エラーを直してください)'); return; }
  const view = viewKindEl.value;
  let p;
  try { p = Plan.pieces(last, view, { today: drawnToday, sort: peopleSort }); }
  catch (e) { showInternal(`内部エラー(描画): ${e.message}`); return; }
  // 描き直しでボタンが作り直されていれば、新しいボタンに「コピーしました」を出す
  const cur = [...canvasEl.querySelectorAll('.tbtns button')].find((b) => b.dataset.piece === btn.dataset.piece) ?? btn;
  if (kind === 'table') {
    const t = p.tables.find((x) => x.name === ref);
    if (!t) { alert(`「${ref}」の表は、今はありません(描き直したら表がなくなりました)`); return; }
    if (k === 'copy') { copyText(Plan.tsv(t), cur); return; }
    saveImage(t.svg, `${imgBase()}_${view}_${safeName(t.name)}`, k);
    return;
  }
  const f = p.figs.find((x) => x.id === ref);
  if (f) saveImage(f.svg, `${imgBase()}_${view}_${f.id}`, k);
}
// ボタンを題の文字に合わせる。文字の枠の中心はフォントによって上下にずれるので使わず、
// 題とボタンの文字の基準線から見た目の中心を求めて(和文の字面の中心は、基準線から文字の大きさの約 0.38 倍上)、中心どうしをそろえる
const GLYPH_MID = 0.38;
function placeBox(box, a) {
  const svg = canvasEl.querySelector('svg');
  const texts = svg ? [...svg.querySelectorAll('text')].filter((t) => t.textContent === a.label) : [];
  if (!texts.length) { box.remove(); return; }
  const near = texts.reduce((q, t) => (Math.abs(+t.getAttribute('y') - a.y) < Math.abs(+q.getAttribute('y') - a.y) ? t : q));
  const c = canvasEl.getBoundingClientRect(), sv = svg.getBoundingClientRect(), tr = near.getBoundingClientRect();
  const titleMid = sv.top - c.top + +near.getAttribute('y') - GLYPH_MID * +near.getAttribute('font-size');
  // ボタンの文字の基準線: ボタンの中に置いた大きさ 0 の印の下端
  const btn = box.querySelector('button');
  const mark = document.createElement('span');
  mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
  btn.append(mark);
  const bb = mark.getBoundingClientRect().bottom - box.getBoundingClientRect().top;
  mark.remove();
  box.style.left = `${tr.right - c.left + 6}px`;
  box.style.top = `${titleMid + GLYPH_MID * parseFloat(getComputedStyle(btn).fontSize) - bb}px`;
}
// ファイル名に使えない文字と空白を「_」にする
const safeName = (s) => s.replace(/[\\/:*?"<>|\s]+/g, '_');
const imgBase = () => safeName(fileBase);
// SVG に紙の大きさの指定を入れる(保存した SVG をブラウザで開いて印刷したときにも、同じ大きさの紙になるように)
const withPage = (svg) => { const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg); const i = svg.indexOf('>', svg.indexOf('<svg')); return `${svg.slice(0, i + 1)}<style>@page{size:${w}px ${h}px;margin:0}</style>${svg.slice(i + 1)}`; };
// 図または表を 1 つだけ、同じ大きさの紙で印刷する(ブラウザの「PDF に保存」で、余白のない PDF になる)。アプリの中で PDF は作らない
const uniqIds = (svg, pre) => svg.replace(/ id="([^"]+)"/g, ` id="${pre}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${pre}$1)`);
function printOne(svg, base) {
  const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg).map(Number);
  const area = $('#printArea');
  area.textContent = ''; area.classList.add('one');
  const pg = el('div', 'page'); pg.style.width = `${w}px`; pg.style.height = `${h}px`; pg.innerHTML = uniqIds(svg, 'p1-'); area.append(pg);
  let st = $('#pageOne');
  if (!st) { st = document.createElement('style'); st.id = 'pageOne'; document.head.append(st); }
  st.textContent = `@media print{@page{size:${w}px ${h}px;margin:0}}`;
  const title = document.title; document.title = base; // 「PDF に保存」のファイル名の候補になる
  try { window.print(); } finally { document.title = title; }
}
function saveImage(svg, base, kind) {
  if (kind === 'pdf') { printOne(svg, base); return; }
  if (kind === 'svg') { download(`${base}.svg`, new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${withPage(svg)}`], { type: 'image/svg+xml' })); return; }
  const scale = 2;
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  const w = +m[1], h = +m[2];
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const big = () => alert('画像が大きすぎて PNG にできませんでした。SVG で保存してください');
  img.onload = () => {
    URL.revokeObjectURL(url);
    const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale;
    const g = c.getContext('2d');
    if (!g) { big(); return; }
    g.scale(scale, scale); g.drawImage(img, 0, 0);
    c.toBlob((b) => { if (b) download(`${base}.png`, b); else big(); }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG の作成に失敗しました'); };
  img.src = url;
}

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function renderDiagnostics(diags) {
  msgEl.textContent = '';
  const er = diags.filter((d) => d.level === 'error'), wr = diags.filter((d) => d.level === 'warn');
  const bar = el('div', 'bar');
  const sum = el('span', er.length ? 'err' : wr.length ? 'warn' : 'ok');
  sum.textContent = er.length || wr.length ? [er.length ? `エラー ${er.length} 件` : '', wr.length ? `警告 ${wr.length} 件` : ''].filter(Boolean).join('、') : 'エラーと警告はありません。';
  const copy = el('button', null, '修正依頼をコピー');
  copy.title = '診断とテキストを、生成 AI に渡す修正依頼の文としてコピーする';
  copy.addEventListener('click', () => copyText(Plan.toPrompt(diags, srcEl.value), copy));
  bar.append(sum, copy);
  msgEl.append(bar);
  // 項目ごとにまとめる
  const groups = new Map();
  for (const d of [...er, ...wr]) {
    const k = `${d.level}|${d.cat}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  const catName = (c) => ({ '検査 C1': '検査 C1: FBS に対応する PBS', '検査 C2': '検査 C2: PBS に対応する FBS', '検査 C3': '検査 C3: FBS の MOP', '検査 C4': '検査 C4: PBS のためのタスク', '検査 C5': '検査 C5: タスクの担当者' }[c] ?? c);
  for (const [k, list] of groups) {
    const [lv, cat] = k.split('|');
    const cls = lv === 'error' ? 'err' : 'warn';
    msgEl.append(el('div', `sec ${cls}`, `${lv === 'error' ? 'エラー' : '警告'}: ${catName(cat)}(${list.length} 件)`));
    const ul = el('ul');
    for (const d of list) {
      const li = el('li', cls, `${d.line} 行: ${d.message}`);
      li.style.cursor = 'pointer';
      li.title = `${d.line} 行の該当箇所を選ぶ`;
      li.addEventListener('click', () => selectText(d.start, Math.max(d.end, d.start)));
      ul.append(li);
    }
    msgEl.append(ul);
  }
}
function showInternal(m) { msgEl.prepend(el('div', 'err', m)); }

async function copyText(text, btn) {
  let ok = true;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
  clearTimeout(copyTimers.get(btn));
  btn.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
  copyTimers.set(btn, setTimeout(() => { btn.textContent = btn.dataset.label; }, 2000));
}
const copyTimers = new WeakMap();

// ---- 図の要素を選ぶ・図から編集する
// テキストが正本。図での編集は、Plan.Edit がテキストの書き換えに直し、applyEdit がテキスト欄に書き込む。
// 書き込んだら待たずに解析し直して描くので、図はいつもテキストと一致する。図の側に状態は持たない
let selectedKey = null;   // 選んでいる要素を、書き換えの後も見つけるための鍵({ sec, qname } か { member })
let selectedRel = null;   // 選んでいる対応の線(「PBS の id|FBS の id」)
let selectedRelKey = null; // 選んでいる対応の線を、書き換えの後も見つけるための鍵([PBS の鍵, FBS の鍵])
let pressed = null;       // ドラッグを始めかけて動かさなかったときに押した要素
let dragged = false;      // ドラッグの直後のクリックを無視するため
const editable = () => !!(last?.ok && !viewEl.classList.contains('stale') && debounce === null);

canvasEl.addEventListener('click', (e) => {
  if (dragged) { dragged = false; return; }
  // ドラッグを始めかけて動かさなかったときは、ポインターの捕捉でクリックの対象が図全体になるので、押した要素を使う
  const target = pressed && canvasEl.contains(pressed) ? pressed : e.target;
  pressed = null;
  // 担当者別ガントチャートの見出し: 並べ替え(書いた順 → 少ない順 → 多い順 → 書いた順)
  const so = target.closest('[data-sort]');
  if (so && canvasEl.contains(so)) { toggleSort(so.getAttribute('data-sort')); return; }
  // テスト項目(MOP)の表の「済」の欄: mop: と mop*: を切り替える
  const mk = target.closest('[data-mop]');
  if (mk && canvasEl.contains(mk)) {
    if (!editable()) { showEditError('いまは図から編集できません(テキストにエラーがあるか、描き直しの途中です)。'); return; }
    const [nid, i] = mk.getAttribute('data-mop').split('|'); applyEdit(Plan.Edit.setMopChecked(last, nid, +i, mk.getAttribute('data-checked') !== '1')); return; }
  const rel = target.closest('[data-rel]');
  if (rel && canvasEl.contains(rel)) { selectRel(rel.getAttribute('data-rel')); return; }
  // ガントチャートの棒の右端(日数のつまみ)は、そのタスクを選ぶ
  const h = target.closest('[data-handle]');
  if (h && canvasEl.contains(h)) { const n = last?.ok ? Plan.Edit.find(last, h.getAttribute('data-handle')) : null; select(n ? n.id : null, true); if (n && !viewEl.classList.contains('stale')) selectText(n.start, n.end); return; }
  const g = target.closest('[data-id]');
  if (!g || !canvasEl.contains(g)) { select(null, true); return; }
  select(g.getAttribute('data-id'), true);
  // エラーの間の薄い図は古いテキストの位置を持っているので、テキストの範囲は選ばない
  if (viewEl.classList.contains('stale')) return;
  const s = +g.getAttribute('data-start'), t = +g.getAttribute('data-end');
  if (Number.isFinite(s) && Number.isFinite(t)) selectText(s, t);
});
function clearSel() {
  // 選択の印を外す。空になった class 属性も消し、図をテキストから描いたときと同じ形に戻す
  canvasEl.querySelectorAll('.selected').forEach((g) => { g.classList.remove('selected'); if (!g.getAttribute('class')) g.removeAttribute('class'); });
  editEl.textContent = '';
  editEl.classList.remove('on');
}
function select(id, byUser) {
  selectedId = id;
  selectedRel = null;
  if (byUser) { const n = id && last?.ok ? Plan.Edit.find(last, id) : null; selectedKey = n ? Plan.Edit.keyOf(n) : null; }
  clearSel();
  if (!id || !last?.ok || viewEl.classList.contains('stale')) return;
  canvasEl.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach((g) => g.classList.add('selected'));
  const info = Plan.describe(last, id, { today: drawnToday });
  if (!info) return;
  const head = el('div', 'row');
  head.append(el('span', 'kind', info.kind));
  if (info.qname) head.append(el('span', 'q', `修飾名: ${info.qname}`));
  for (const [k, v] of info.items) if (!['note', 'MOP', '対象(for)', '作成', '確認', '先行', '実現する機能', '休み'].includes(k)) head.append(el('span', 'small', `${k}: ${v}`));
  editEl.append(head);
  buildForm(id);
  editEl.classList.add('on');
}
function selectRel(rel) {
  selectedId = null; selectedKey = null; selectedRel = rel;
  clearSel();
  if (!last?.ok) return;
  selectedRelKey = rel.split('|').map((x) => { const n = Plan.Edit.find(last, x); return n ? Plan.Edit.keyOf(n) : null; });
  canvasEl.querySelectorAll(`[data-rel="${CSS.escape(rel)}"]`).forEach((g) => g.classList.add('selected'));
  const [pid, fid] = rel.split('|');
  const p = Plan.Edit.find(last, pid), f = Plan.Edit.find(last, fid);
  const row = el('div', 'row');
  row.append(el('span', 'kind', '対応'), el('span', null, `FBS「${f.name}」― PBS「${p.name}」`));
  const del = el('button', null, 'この対応を消す');
  del.disabled = !editable();
  del.addEventListener('click', () => applyEdit(Plan.Edit.removeRealizes(last, pid, fid)));
  row.append(del);
  editEl.append(row);
  editEl.classList.add('on');
}
function reselect() {
  if (selectedKey && last?.ok) selectedId = Plan.Edit.locate(last, selectedKey);
  if (selectedRel) {
    // 対応の線は、名前(鍵)で探し直す。見つからなければ選択を外す
    const ids = last?.ok && selectedRelKey?.every(Boolean) ? selectedRelKey.map((k) => Plan.Edit.locate(last, k)) : null;
    const rel = ids?.every(Boolean) ? ids.join('|') : null;
    if (rel && canvasEl.querySelector(`[data-rel="${CSS.escape(rel)}"]`)) { selectRel(rel); return; }
    selectedRel = null; selectedRelKey = null; select(null); return;
  }
  if (selectedId && canvasEl.querySelector(`[data-id="${CSS.escape(selectedId)}"]`)) select(selectedId); else if (selectedId && last?.ok && Plan.Edit.find(last, selectedId)) select(selectedId); else select(null);
}

// 編集パネル: 選んだ要素の名前と属性を、テキストのとおりに表示し、書き換えたらテキストに書き込む
function buildForm(id) {
  const n = Plan.Edit.find(last, id);
  if (!n) return;
  const can = editable();
  const form = el('div', 'form');
  const raw = (key) => n.attrList.filter((a) => a.key === key || (key === 'mop' && a.key === 'mop*')).map((a) => a.text);
  const field = (label, value, onSet, opt = {}) => {
    const lab = el('label', null, label);
    const inp = opt.multi ? document.createElement('textarea') : document.createElement('input');
    inp.value = value;
    if (opt.multi) inp.rows = Math.max(1, value.split('\n').length);
    if (opt.ph) inp.placeholder = opt.ph;
    inp.disabled = !can;
    let done = false; // 書き込んだ後、欄から離れるときの change で二重に書き込まないため(書き込めなかったときは立てない)
    const builtFor = last; // この欄を作ったときの解析結果。テキストが替わった後の古い欄からは書き込まない
    // 戻り値: 'wrote'(書き込んだ)、'noop'(書き換えにならない)、'error'(拒否した。書きかけは残す)
    const commit = (focus) => {
      const clear = () => { if (pendingField?.inp === inp) pendingField = null; };
      if (done || inp.value === value || last !== builtFor) { clear(); return 'noop'; }
      const res = onSet(inp.value);
      if (res && !res.error && res.text === srcEl.value) { clear(); return 'noop'; }
      if (applyEdit(res, { focusLabel: label, ...focus })) { done = true; clear(); return 'wrote'; }
      return 'error';
    };
    inp.addEventListener('input', () => { pendingField = inp.value === value ? null : { inp, commit }; });
    inp.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // 日本語入力の変換中の Enter などは書き込みに使わない
      if (e.key === 'Enter' && !(opt.multi && e.shiftKey)) { e.preventDefault(); commit({}); }
      else if (e.key === 'Tab' && inp.value !== value) { e.preventDefault(); commit({ move: e.shiftKey ? -1 : 1 }); }
      else if (e.key === 'Escape') { inp.value = value; pendingField = null; inp.blur(); }
    });
    inp.addEventListener('change', () => commit({ keep: true }));
    lab.append(inp);
    form.append(lab);
  };
  const E = Plan.Edit;
  field('名前', n.name, (v) => E.rename(last, id, v));
  const at = (key, label, ph) => field(label, raw(key)[0] ?? '', (v) => E.setAttr(last, id, key, v), { ph });
  if (n.isMember) { at('off', '休み(off)', 'wed, 2026-05-20'); at('note', 'メモ(note)'); }
  else if (n.sec === 'FBS') { field('MOP(1 行に 1 つ。改行は Shift+Enter)', raw('mop').join('\n'), (v) => E.setAttr(last, id, 'mop', v.split('\n')), { multi: true }); at('note', 'メモ(note)'); }
  else if (n.sec === 'PBS') { at('realizes', '実現する機能(realizes)', 'FBS の要素の名前, …'); at('note', 'メモ(note)'); }
  else {
    at('for', '対象(for)', 'PBS の要素の名前, …');
    if (n.parent && !n.children.length) {
      at('days', '日数(days)', '1');
      // 状態は 4 択。選ぶとすぐ書き込む(書いていないタスクで「実行前」を選んだときは何も書き足さない)
      const lab = el('label', null, '状態(status)');
      const sl = document.createElement('select');
      for (const [k, ja] of Object.entries(Plan.STATUS)) sl.append(new Option(`${ja}(${k})`, k));
      sl.value = n.status;
      sl.disabled = !can;
      sl.addEventListener('change', () => { if (!applyEdit(E.setStatus(last, id, sl.value), { focusLabel: '状態(status)' })) sl.value = n.status; });
      lab.append(sl);
      form.append(lab);
    }
    at('by', '作成(by)', '担当者の名前, …');
    at('review', '確認(review)', '担当者の名前, …');
    if (n.parent) at('after', '先行(after)', 'WBS の要素の名前, …');
    at('note', 'メモ(note)');
  }
  const btns = el('div', 'btns');
  const btn = (label, fn, title) => { const b = el('button', null, label); b.disabled = !can; if (title) b.title = title; b.addEventListener('click', fn); btns.append(b); };
  if (n.isMember) btn('担当者を追加', () => applyEdit(E.addSibling(last, id)));
  else {
    btn('子を追加', () => applyEdit(E.addChild(last, id)), 'この要素の下に要素を足す');
    if (n.parent) btn('兄弟を追加', () => applyEdit(E.addSibling(last, id)), 'この要素の後ろに、同じ親の要素を足す');
  }
  if (n.isMember || n.parent) btn('削除', () => {
    const x = E.remove(last, id);
    if (x.error) { showEditError(x.error); return; }
    const msg = `「${n.name}」${x.count > 1 ? `とその下の ${x.count - 1} 個の要素` : ''}を消しますか?${x.refs ? `\nほかの行から ${x.refs} か所で参照されています。消すと、その参照はエラーになります。` : ''}\n(Ctrl+Z で元に戻せます)`;
    if (confirm(msg)) { selectedKey = null; selectedId = null; applyEdit(x); }
  });
  form.append(btns);
  if (!can) form.append(el('div', 'small', debounce !== null ? '描き直しの途中です。' : 'テキストのエラーを直すと、図から編集できます。'));
  editEl.append(form);
}
function showEditError(msg) {
  let m = editEl.querySelector('.editerr');
  if (!m) { m = el('div', 'editerr'); editEl.prepend(m); editEl.classList.add('on'); }
  m.textContent = msg;
}
// 書き換えをテキスト欄に書き込む。変わった範囲だけを 1 回で置き換えるので、Ctrl+Z 1 回で戻せる
let pendingField = null;  // 書きかけの欄({ inp, commit })
let pendingReplay = null; // 書きかけを書き込んだ後に行う、クリックした操作
document.addEventListener('pointerdown', (e) => {
  if (!pendingField || pendingField.inp.contains(e.target)) return;
  const btn = e.target.closest('#edit button');
  const g = canvasEl.contains(e.target) ? e.target.closest('[data-id],[data-rel],[data-handle]') : null;
  const mk = canvasEl.contains(e.target) ? e.target.closest('[data-mop]') : null;
  const so = canvasEl.contains(e.target) ? e.target.closest('[data-sort]') : null;
  let action = null;
  const fld = e.target.closest('#edit select, #edit input, #edit textarea');
  const pb = e.target.closest('#canvas .tbtns button');
  if (pb) action = { kind: 'piece', key: pb.dataset.piece };
  else if (so) action = { kind: 'sort', key: so.getAttribute('data-sort') };
  else if (btn) action = { kind: 'button', label: btn.textContent };
  else if (fld) action = { kind: 'focus', label: fld.parentElement.firstChild.textContent };
  else if (g?.hasAttribute('data-handle')) { const n = Plan.Edit.find(last, g.getAttribute('data-handle')); if (n) action = { kind: 'node', key: Plan.Edit.keyOf(n) }; }
  else if (g?.hasAttribute('data-rel')) { const [a, b] = g.getAttribute('data-rel').split('|'); action = { kind: 'rel', keys: [a, b].map((x) => Plan.Edit.keyOf(Plan.Edit.find(last, x))) }; }
  else if (g) { const n = Plan.Edit.find(last, g.getAttribute('data-id')); if (n) action = { kind: 'node', key: Plan.Edit.keyOf(n) }; }
  const st = pendingField.commit({ keep: true });
  if (st === 'error') {
    // 書きかけが拒否されたら、押した操作はせず、理由と書きかけの値を残す(仕様書 11.2 節)
    e.preventDefault();
    pendingReplay = { kind: 'none' };
    const m = editEl.querySelector('.editerr');
    if (m) m.textContent += '(書きかけの値を直すか、欄で Escape を押して取り消してください)';
    pendingField?.inp.focus();
    return;
  }
  // 済の欄: 書きかけを書き込むと MOP の並びや名前が変わり得るので、切り替えはしない(描き直した表で、もう一度押してもらう)
  if (mk) { pendingReplay = { kind: 'none' }; return; }
  if (st === 'wrote' && action) pendingReplay = action;
}, true);
function replay() {
  const a = pendingReplay;
  pendingReplay = null;
  if (!a || a.kind === 'none' || !last?.ok) return;
  if (a.kind === 'sort') { toggleSort(a.key); return; }
  if (a.kind === 'piece') { [...canvasEl.querySelectorAll('.tbtns button')].find((b) => b.dataset.piece === a.key)?.click(); return; }
  if (a.kind === 'focus') { const l = [...editEl.querySelectorAll('label')].find((x) => x.firstChild?.textContent === a.label); l?.querySelector('select,input,textarea')?.focus(); return; }
  if (a.kind === 'button') { const b = [...editEl.querySelectorAll('button')].find((x) => x.textContent === a.label && !x.disabled); b?.click(); return; }
  if (a.kind === 'rel') { const ids = a.keys.map((k) => Plan.Edit.locate(last, k)); if (ids.every(Boolean)) selectRel(ids.join('|')); return; }
  const id = Plan.Edit.locate(last, a.key);
  if (id) { select(id, true); const n = Plan.Edit.find(last, id); if (n) selectText(n.start, n.end); }
}
document.addEventListener('click', (e) => { if (pendingReplay) { e.stopPropagation(); e.preventDefault(); replay(); } }, true);
document.addEventListener('pointerup', () => { if (pendingReplay) setTimeout(() => { if (pendingReplay) replay(); }, 0); }, true);
// テキスト欄を nt に替える。変わった部分だけを、元に戻す(Ctrl+Z)の履歴に載る書き方で入れる。
// 戻り値: 替えた範囲(元のテキストの [p, e) を長さ len の文字列にした)
function spliceSrc(nt) {
  const old = srcEl.value;
  let p = 0;
  while (p < old.length && p < nt.length && old[p] === nt[p]) p++;
  let q = 0;
  while (q < old.length - p && q < nt.length - p && old[old.length - 1 - q] === nt[nt.length - 1 - q]) q++;
  // サロゲートペア(絵文字・𠮷 など)の途中で切らない
  const hi = (c) => c >= 0xd800 && c <= 0xdbff, lo = (c) => c >= 0xdc00 && c <= 0xdfff;
  if (p > 0 && hi(old.charCodeAt(p - 1))) p--;
  if (q > 0 && lo(old.charCodeAt(old.length - q))) q--;
  const mid = nt.slice(p, nt.length - q);
  const keepTop = srcEl.scrollTop;
  applying = true;
  try {
  srcEl.focus();
  srcEl.setSelectionRange(p, old.length - q);
  const done = mid ? document.execCommand('insertText', false, mid) : document.execCommand('delete');
  if (!done || srcEl.value !== nt) { srcEl.value = nt; } // execCommand が使えないブラウザでは直接書く(このときは Ctrl+Z で戻せない)
  srcEl.scrollTop = keepTop;
  } finally { applying = false; }
  return { p, e: old.length - q, len: mid.length };
}
let applying = false; // 書き込みの途中で、別の書き込みが入れ子に始まらないようにする
// focus: パネルの欄から書き込んだとき、書き込んだ後に入力をどこへ戻すか({ focusLabel, move: -1|0|1, keep })。
// 戻り値は、テキストを書き換えたかどうか
function applyEdit(res, focus = null) {
  if (!res || applying) return false;
  if (res.error) { showEditError(res.error); return false; }
  if (!editable()) { showEditError('いまは図から編集できません(テキストにエラーがあるか、描き直しの途中です)。'); return false; }
  const nt = res.text;
  if (srcEl.value === nt) return false;
  spliceSrc(nt);
  if (res.select !== undefined) { selectedKey = res.select; selectedRel = null; if (res.select === null) selectedId = null; }
  updateHighlight();
  edited();
  persist();
  clearTimeout(debounce); debounce = null;
  analyze(); // 待たずに解析し直して描く(図とテキストを一致させる)
  const id = selectedKey && last?.ok ? Plan.Edit.locate(last, selectedKey) : null;
  const n = id && Plan.Edit.find(last, id);
  if (n) { srcEl.setSelectionRange(n.nameStart, n.nameEnd); scrollToOffset(n.nameStart); }
  // パネルから書き込んだときは、入力をパネルに戻す(テキスト欄に残すと、続けて打った文字が名前を上書きするため)
  if (focus && !focus.keep) {
    const labels = [...editEl.querySelectorAll('label')];
    const i = labels.findIndex((l) => l.firstChild?.textContent === focus.focusLabel);
    const j = i < 0 ? -1 : i + (focus.move ?? 0);
    const target = j >= 0 && j < labels.length ? labels[j].querySelector('input,textarea,select') : editEl.querySelector('.btns button');
    target?.focus();
    if (target?.select) target.select();
  } else if (focus?.keep) {
    srcEl.blur();
  } else if (n) selectText(n.nameStart, n.nameEnd);
  return true;
}
function scrollToOffset(pos) {
  const line = srcEl.value.slice(0, pos).split('\n').length;
  srcEl.scrollTop = Math.max(0, (line - 4) * LINE_PX);
  syncScroll();
}

// ---- ドラッグ: 対応の線を引く(FBS と PBS の対応)、依存の矢印を引く(アローダイアグラム)、日数を変える(ガントチャート)
let drag = null;
const svgPt = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
const NS = 'http://www.w3.org/2000/svg';
canvasEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !editable() || !canvasEl.contains(e.target)) return;
  const svg = canvasEl.querySelector('svg');
  if (!svg) return;
  const view = viewKindEl.value;
  const h = e.target.closest('[data-handle]');
  if (h && view === 'gantt') {
    drag = { kind: 'days', svg, id: h.getAttribute('data-handle'), days: +h.getAttribute('data-days'), dw: +h.getAttribute('data-dw'), x0: svgPt(svg, e).x, moved: false };
  } else {
    const g = e.target.closest('[data-id]');
    if (!g || e.target.closest('[data-rel]')) return;
    const id = g.getAttribute('data-id');
    const n = Plan.Edit.find(last, id);
    if (view === 'match' && n && !n.isMember) drag = { kind: 'rel', svg, id };
    else if (view === 'aoa' && n && n.sec === 'WBS' && n.parent && !n.children.length) drag = { kind: 'dep', svg, id };
    else return;
    const p = svgPt(svg, e);
    Object.assign(drag, { x0: p.x, y0: p.y, moved: false });
  }
  drag.el = e.target;
  canvasEl.setPointerCapture?.(e.pointerId);
});
canvasEl.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = svgPt(drag.svg, e);
  if (!drag.moved && Math.hypot(p.x - drag.x0, (p.y ?? 0) - (drag.y0 ?? p.y)) < 5) return;
  drag.moved = true;
  if (!drag.tmp) { drag.tmp = document.createElementNS(NS, 'g'); drag.tmp.setAttribute('pointer-events', 'none'); drag.svg.append(drag.tmp); }
  if (drag.kind === 'days') {
    // 離した位置までに作業できる長さ(休みの日を除く)を、0.5 日の倍数にそろえる(0.5 日以上。仕様書 11.3 節)
    const t = Plan.Edit.find(last, drag.id);
    const T = t.f + (p.x - drag.x0) / drag.dw * 1000;
    const nd = Math.max(500, Math.round(Plan.workUntil(last, t, T) / 500) * 500);
    drag.newDays = nd;
    drag.tmp.innerHTML = `<rect x="${p.x + 8}" y="${p.y - 26}" width="96" height="22" rx="3" fill="#fff" stroke="#333"/><text x="${p.x + 14}" y="${p.y - 10}" font-size="13">日数: ${Plan.fmtDays(nd)} 日</text>`;
  } else {
    drag.tmp.innerHTML = `<path d="M${drag.x0} ${drag.y0}L${p.x} ${p.y}" stroke="#8b1a2b" stroke-width="2" stroke-dasharray="6 3" fill="none"/>`;
  }
});
canvasEl.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.tmp?.remove(); // ドラッグ中の仮の表示を消す。結果はテキストに書き込み、図はテキストから描き直す
  if (!d.moved) { pressed = d.el; setTimeout(() => { pressed = null; }, 0); return; }
  dragged = true; // 直後のクリックを無視する。クリックが起きなかったときも残らないよう、すぐ外す
  setTimeout(() => { dragged = false; }, 0);
  const under = document.elementFromPoint(e.clientX, e.clientY);
  if (!under || !canvasEl.contains(under)) return; // 図の外で離したら取り消す
  if (d.kind === 'days') { if (d.newDays && d.newDays !== d.days) applyEdit(Plan.Edit.setDays(last, d.id, d.newDays)); return; }
  const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-id]');
  const to = hit && canvasEl.contains(hit) ? hit.getAttribute('data-id') : null;
  if (!to || to === d.id) return;
  if (d.kind === 'rel') applyEdit(Plan.Edit.addRealizes(last, d.id, to));
  else applyEdit(Plan.Edit.addAfter(last, d.id, to));
});
canvasEl.addEventListener('pointercancel', () => { drag?.tmp?.remove(); drag = null; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag) { drag.tmp?.remove(); drag = null; } }); // Escape でドラッグを取り消す
function selectText(start, end) {
  srcEl.focus();
  srcEl.setSelectionRange(start, end);
  const line = srcEl.value.slice(0, start).split('\n').length;
  srcEl.scrollTop = Math.max(0, (line - 4) * LINE_PX);
  syncScroll();
}

// ---- ブラウザへの自動保持(このブラウザの localStorage だけに書く。どこにも送信しない。仕様書 9 章)
const KEY_DOC = 'plan.sapp.jp:doc';
const warnEl = $('#warn');
const WARN = { save: '', tab: '' };
const setWarn = (kind, t) => { WARN[kind] = t; warnEl.textContent = [WARN.save, WARN.tab].filter(Boolean).join(' / '); };
function persist() {
  let ok = true;
  try { localStorage.setItem(KEY_DOC, JSON.stringify({ text: srcEl.value, base: fileBase, name: fileName, dirty, saved: savedText })); } catch { ok = false; }
  setWarn('save', ok ? '' : 'ブラウザへの自動保持に失敗しました。「上書き保存」か「別名で保存」でファイルに残してください');
}
function restored() {
  try { const d = JSON.parse(localStorage.getItem(KEY_DOC) ?? 'null'); return d && typeof d.text === 'string' ? d : null; } catch { return null; }
}
// 別のタブで同じ計画が編集されたら知らせる(後から書いた方が残るため)
window.addEventListener('storage', (e) => { if (e.key === KEY_DOC && e.newValue !== null) setWarn('tab', '別のタブでこの計画が編集されました。このタブで続けると、そちらの内容は上書きされます'); });

// ---- テキスト欄
srcEl.addEventListener('input', () => {
  updateHighlight();
  edited();
  persist();
  clearTimeout(debounce);
  debounce = setTimeout(() => { debounce = null; analyze(); }, 250);
});
srcEl.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    // 元に戻す履歴に載る書き方で入れる(setRangeText は履歴に載らず、それまでの履歴も使えなくなる)
    if (!document.execCommand('insertText', false, '  ')) { srcEl.setRangeText('  ', srcEl.selectionStart, srcEl.selectionEnd, 'end'); srcEl.dispatchEvent(new Event('input')); }
  }
});
// テキストを入れ替える(新規・開く・例・開き直したときの続き)。o: { name, handle, dirty, save, saved }(saved: 比べる相手)
function setText(text, base, o = {}) {
  // 書きかけの欄は捨てる(古いテキストの要素の書き換えを、新しいテキストに当てないため)
  pendingField = null; pendingReplay = null;
  peopleSort = null; // 担当者別ガントチャートの並びは書いた順に戻す
  srcEl.value = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (base) fileBase = base;
  editGen++;
  docGen++;
  fileName = o.name ?? '';
  fileHandle = o.handle ?? null;
  savedText = typeof o.saved === 'string' ? o.saved.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') : null;
  dirty = !!o.dirty;
  showName();
  selectedId = null;
  opening = true;
  lastOk = null;
  canvasEl.textContent = '';
  updateHighlight();
  if (o.save !== false) persist();
  analyze();
}
viewKindEl.addEventListener('change', () => { selectedId = null; draw(); });

// ---- 保存
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
// ---- テキストのファイル: 新規・開く・上書き保存・別名で保存(仕様書 9 章。シンプルスライドと同じ作り)
// Chrome・Edge はファイル操作機能で、開いたファイルにそのまま上書きする。ない場合はダウンロードで保存する
const FS_OK = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
const PICK_OPEN = { types: [{ description: 'プロジェクト計画のテキスト・テキストを埋め込んだ SVG', accept: { 'text/plain': ['.plan', '.txt'], 'image/svg+xml': ['.svg'] } }] };
const PICK_SAVE = { types: [{ description: 'プロジェクト計画のテキスト', accept: { 'text/plain': ['.plan'] } }] };
let statT = null, saving = false;
function setStat(t) { const e = $('#stat'); e.textContent = t; clearTimeout(statT); if (t) statT = setTimeout(() => { e.textContent = ''; }, 4000); }
function showName() { const e = $('#fileName'); e.textContent = `${fileName || '(名前なし)'}${dirty ? ' *' : ''}`; e.title = dirty ? '保存していない変更があります' : ''; }
function edited() { editGen++; if (!dirty) { dirty = true; showName(); } }
function setDirty(v) { dirty = v; showName(); persist(); }
const okToDiscard = () => !dirty || srcEl.value.trim() === '' || confirm('保存していない変更があります。破棄して続けますか?');
const stamp = () => { const d = new Date(); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
const baseOf = (name) => name.replace(/\.[^.]*$/, '') || 'plan';

function openFile(file, handle, handleP) {
  const isSvg = /\.svg$/i.test(file.name);
  if (!isSvg && !/\.(plan|txt)$/i.test(file.name)) { alert(`${file.name} は開けません。開けるのは .plan(.txt)と、版 0.30 までに「画像…」で保存した .svg です。`); return; }
  const r = new FileReader();
  r.onload = () => {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(r.result)); }
    catch { alert(`${file.name}: UTF-8 として読めません`); return; }
    if (isSvg) { const x = Plan.extractSource(text); if (!x.ok) { alert(`${file.name}: ${x.error}`); return; } text = x.text; }
    // SVG は表示中のビュー 1 つ分の画像なので、テキストの保存先にしない(上書き保存では .plan の保存先を尋ねる)
    setText(text, baseOf(file.name).replace(/_(fbs|pbs|match|mop|wbs|aoa|roles|gantt|people|summary)$/, ''), isSvg ? { saved: text } : { name: file.name, handle, saved: text });
    // ドロップで開いたときは、上書きの先を後から受け取る(受け取る前に編集や別のファイルに替わっていれば使わない)
    const g = editGen;
    if (handleP && !isSvg) handleP.then((h) => { if (h?.kind === 'file' && editGen === g) fileHandle = h; }).catch(() => {});
  };
  r.onerror = () => alert(`${file.name} を読めませんでした`);
  r.readAsArrayBuffer(file);
}
$('#btnOpen').addEventListener('click', async () => {
  if (!okToDiscard()) return;
  if (!FS_OK) { $('#fileOpen').click(); return; }
  try { const [h] = await window.showOpenFilePicker(PICK_OPEN); openFile(await h.getFile(), h); }
  catch (e) { if (e?.name !== 'AbortError') $('#fileOpen').click(); }
});
$('#fileOpen').addEventListener('change', (e) => { if (e.target.files[0]) openFile(e.target.files[0], null); e.target.value = ''; });
['dragenter', 'dragover'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); $('#drop').classList.add('on'); }));
['dragleave', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop' || e.relatedTarget === null) $('#drop').classList.remove('on'); }));
window.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  // 上書きの先にするため、ファイルの扱いを受け取る(Chrome・Edge。ドロップの処理の中で呼ぶ必要がある)
  const it = e.dataTransfer.items?.[0];
  const hp = it && typeof it.getAsFileSystemHandle === 'function' ? it.getAsFileSystemHandle() : null;
  if (!/\.(plan|txt|svg)$/i.test(f.name)) { alert(`${f.name} は開けません。開けるのは .plan(.txt)と、版 0.30 までに「画像…」で保存した .svg です。`); return; }
  if (!okToDiscard()) return;
  openFile(f, null, hp);
});
function downloadText(name, text) { download(name, new Blob([text], { type: 'text/plain;charset=utf-8' })); }
async function writeTo(h, text) { const w = await h.createWritable(); await w.write(text); await w.close(); }
function setSaving(v) { saving = v; $('#btnSave').disabled = v; $('#btnSaveAs').disabled = v; }

// ---- version:(仕様書 3.3 節・4.1 節・9 章)
// 正しくない場所に version: があれば保存せず、その行を選んで知らせる
function blockedByVersion() {
  const ln = Plan.misplacedVersion(srcEl.value);
  if (ln === null) return false;
  setStat(`version: が正しくない場所にあります(${ln} 行目)。version: は 1 行目にだけ書けます。直してから保存してください`);
  const lines = srcEl.value.split('\n');
  const a = lines.slice(0, ln - 1).reduce((x, l) => x + l.length + 1, 0);
  srcEl.focus(); srcEl.setSelectionRange(a, a + lines[ln - 1].length); scrollToOffset(a);
  return true;
}
// 上書き保存で、比べる相手と(version: の日付の部分を除いて)同じなら、書き込まない
function unchanged() {
  if (savedText === null) return false;
  const cur = srcEl.value;
  if (cur === savedText) { setStat('変更がないので、保存しませんでした'); if (dirty) setDirty(false); return true; }
  if (Plan.stripVersion(cur) === Plan.stripVersion(savedText)) { setStat('version: の日付のほかに変更がないので、保存しませんでした'); return true; }
  return false;
}
// 書き込むテキスト: 比べる相手と(version: の日付の部分を除いて)違えば(比べる相手がなければ)、version: を今日の日付にする(なければ 1 行目に足す)。
// テキスト欄はまだ変えない(書き込みに成功してから入れる)
function stamped(cur) {
  if (savedText !== null && Plan.stripVersion(cur) === Plan.stripVersion(savedText)) return { text: cur, date: null };
  const date = todayStr();
  return { text: Plan.setVersion(cur, date), date };
}
// 書き込みに成功した後、テキスト欄の version: を書き込んだ日付にする。元に戻す(Ctrl+Z)の履歴に載せ、カーソルと入力の場所は元に戻す
function putVersion(nt) {
  const cur = srcEl.value;
  if (nt === cur) return;
  const act = document.activeElement, s0 = srcEl.selectionStart, s1 = srcEl.selectionEnd, top = srcEl.scrollTop;
  // 編集パネルの欄・ボタンにいたときは、描き直しでパネルが作り直されるので、見出し・文字で探し直して戻す(日付が変わったときの描き直しと同じ)
  const inPanel = act && editEl.contains(act);
  const label = inPanel ? act.closest('label')?.firstChild?.textContent ?? null : null;
  const btnText = inPanel && act.tagName === 'BUTTON' ? act.textContent : null;
  const fsel = label && act.selectionStart != null ? [act.selectionStart, act.selectionEnd] : null;
  // 書きかけの欄があれば、その値も作り直した欄に入れ直す(書きかけを消さない)
  const pend = pendingField ? { label: pendingField.inp.closest('label')?.firstChild?.textContent, value: pendingField.inp.value } : null;
  const lines0 = cur.split('\n').length;
  const c = spliceSrc(nt);
  // カーソルの位置: 同じ長さの置き換え(日付を替えた)なら、そのまま。足したときは、足した分だけ後ろへ
  const map = (x) => (c.e - c.p === c.len || x < c.p ? x : x >= c.e ? x + c.len - (c.e - c.p) : c.p + c.len);
  srcEl.setSelectionRange(map(s0), map(s1));
  // 1 行目に足したときは、見えていた場所が動かないよう 1 行分ずらす
  srcEl.scrollTop = top + (top > 0 ? (nt.split('\n').length - lines0) * LINE_PX : 0);
  updateHighlight();
  clearTimeout(debounce); debounce = null;
  analyze();
  const fieldOf = (lb) => [...editEl.querySelectorAll('label')].find((x) => x.firstChild?.textContent === lb)?.querySelector('input,textarea,select') ?? null;
  if (pend) {
    pendingField = null;
    const f = fieldOf(pend.label);
    if (f && !f.disabled) { f.value = pend.value; f.dispatchEvent(new Event('input')); }
  }
  // 入力の場所を戻す(テキスト欄・パネルの欄・パネルのボタン・そのほかの要素。どこにもなければ、どこにも置かない)
  if (act === srcEl) return;
  if (label) { const f = fieldOf(label); if (f) { f.focus(); if (fsel && f.setSelectionRange) f.setSelectionRange(...fsel); return; } }
  if (btnText !== null) { const b = [...editEl.querySelectorAll('button')].find((x) => x.textContent === btnText && !x.disabled); if (b) { b.focus(); return; } }
  if (act && act !== document.body && act.isConnected && typeof act.focus === 'function') act.focus(); else srcEl.blur();
}
// モーダルの画面(書き方など)が開いている間は、テキスト欄に書き込めない(元に戻す履歴に載らない)ので、閉じてから行う
function whenFree(fn) {
  const d = document.querySelector('dialog[open]');
  if (d) d.addEventListener('close', () => whenFree(fn), { once: true }); else fn();
}
// 書き込みに成功した後の始末。gen・dg: 書き込みを始めたときの編集・内容の世代。st: 書き込んだもの(stamped の戻り値)
// 書き込み中に編集されていれば「未保存」のまま(日付だけはテキスト欄にも入れる)。別の内容を開いていたら、いまの内容には何もしない
function afterWrite(gen, dg, st, msg) {
  if (docGen !== dg) { setStat(`${msg}(保存中に別の内容を開いたので、いま開いている内容は保存していません)`); return; }
  savedText = st.text;
  if (editGen === gen) { setDirty(false); setStat(msg); whenFree(() => { if (docGen === dg) { putVersion(st.text); setDirty(false); } }); return; }
  // テキスト欄の 1 行目に version: があるときだけ替える(書き込み中に人が消した行は足し戻さない)
  if (st.date) whenFree(() => { if (docGen === dg && Plan.parse(srcEl.value).sec.version) { putVersion(Plan.setVersion(srcEl.value, st.date)); persist(); } });
  persist();
  setStat(`${msg}。保存中に変わった内容はまだ保存されていません`);
}
let picking = false; // 保存先を選んでいる間(同じ操作を二重に始めないため)
async function saveAs() {
  if (saving || picking) return;
  picking = true;
  try { await saveAs1(); } finally { picking = false; }
}
async function saveAs1() {
  if (debounce !== null) { clearTimeout(debounce); debounce = null; analyze(); }
  if (blockedByVersion()) return;
  let why = ''; // ダウンロードに切り替えた理由(保存できてから出す)
  if (FS_OK) {
    let h;
    try { h = await window.showSaveFilePicker({ suggestedName: fileName || `${fileBase}.plan`, ...PICK_SAVE }); }
    catch (e) { if (e?.name === 'AbortError') return; h = null; }
    if (h) {
      if (blockedByVersion()) return; // 保存先を選んでいる間に書き換えられたとき
      const gen = editGen, dg = docGen, st = stamped(srcEl.value);
      setSaving(true);
      try {
        await writeTo(h, st.text);
        // 書き込み中に「開く」「新規」などで別の内容に替わったときは、今の内容の保存先は変えない(普通の編集なら変える)
        if (docGen === dg) { fileHandle = h; fileName = h.name; fileBase = baseOf(h.name); showName(); persist(); }
        afterWrite(gen, dg, st, `${h.name} に保存しました(${stamp()})`);
        return;
      } catch { why = '保存先に書き込めなかったので、ダウンロードで保存しました'; }
      finally { setSaving(false); }
    } else why = '保存先を選べなかったので、ダウンロードで保存しました';
  }
  let name = prompt('ファイル名', fileName || `${fileBase}.plan`);
  if (name === null) { if (why) setStat('保存を取りやめました'); return; }
  name = name.trim() || `${fileBase}.plan`;
  if (!/\.(plan|txt)$/i.test(name)) name += '.plan';
  if (blockedByVersion()) return;
  const st = stamped(srcEl.value);
  downloadText(name, st.text);
  // ダウンロードで保存した名前に替えるので、元のファイルへの上書きの先は忘れる(ファイルは消さない。次の上書き保存では保存先を尋ねる)
  fileName = name; fileBase = baseOf(name); fileHandle = null;
  afterWrite(editGen, docGen, st, '');
  setStat(why);
}
async function save() {
  if (saving || picking) return;
  if (blockedByVersion()) return;
  if (FS_OK && fileHandle) {
    if (unchanged()) return;
    const gen = editGen, dg = docGen, st = stamped(srcEl.value), h = fileHandle;
    setSaving(true);
    try { await writeTo(h, st.text); afterWrite(gen, dg, st, `${h.name} に上書き保存しました(${stamp()})`); }
    catch (e) { setStat(e?.name === 'AbortError' ? '上書き保存を取りやめました' : '上書きできませんでした。「別名で保存」を使ってください'); }
    finally { setSaving(false); }
    return;
  }
  if (FS_OK || !fileName) { saveAs(); return; }
  // ファイル操作機能がないブラウザ: 同じ名前でダウンロードする
  if (unchanged()) return;
  const st = stamped(srcEl.value);
  downloadText(fileName, st.text);
  afterWrite(editGen, docGen, st, '');
  setStat('');
}
$('#btnSave').addEventListener('click', save);
$('#btnSaveAs').addEventListener('click', saveAs);
// Ctrl+S(Mac では ⌘S)で上書き保存
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (e.repeat) return; // 押し続けたときの繰り返しでは保存しない
    // 書きかけの欄があれば、先に書き込む(上書き保存ボタンを押したときと同じ)。拒否されたら保存しない
    if (pendingField && pendingField.commit({ keep: true }) === 'error') return;
    save();
  }
});

// ---- 印刷 / PDF(仕様書 9 章): サマリー → 残りのビューを選択欄の順に、描けるものを 1 ページに 1 つずつ。図のほかには何も足さない
function buildPrint() {
  const area = $('#printArea');
  area.textContent = ''; area.classList.remove('one');
  { const st = $('#pageOne'); if (st) st.textContent = ''; } // 1 つだけの印刷の紙の指定を残さない
  if (debounce !== null) { clearTimeout(debounce); debounce = null; analyze(); }
  if (!last?.ok) return 0;
  const ids = ['summary', ...Plan.VIEWS.map((v) => v.id).filter((id) => id !== 'summary')];
  let n = 0;
  for (const id of ids) {
    let pages;
    try { pages = Plan.printPages(last, id, { today: todayStr() }); } catch { continue; }
    // 1 ページに収めると半分より小さくなるビューは、分けたページを続けて入れる
    pages.forEach((svg, i) => {
      const page = el('div', 'page');
      page.dataset.view = id;
      if (Plan.printPortrait(id, i)) page.dataset.portrait = '1';
      page.innerHTML = uniqIds(svg, `p${n + 1}-`); // 画面の図や、ほかのページと id が重ならないように
      area.append(page);
      n++;
    });
  }
  return n;
}
$('#btnPrint').addEventListener('click', () => {
  if (!last?.ok && debounce === null) { alert('テキストにエラーがあるので印刷できません。エラーを直してから印刷してください'); return; }
  if (!buildPrint()) { alert('印刷できる図がありません(エラーを直してください)'); return; }
  window.print();
});
window.addEventListener('afterprint', () => { const a = $('#printArea'); a.textContent = ''; a.classList.remove('one'); const st = $('#pageOne'); if (st) st.textContent = ''; });

// ---- 上の帯のボタン
$('#btnNew').addEventListener('click', () => { if (okToDiscard()) setText('', 'plan'); });
$('#btnSample').addEventListener('click', () => { if (okToDiscard()) setText(SAMPLE_TEXT, 'sample'); });
$('#btnHelp').addEventListener('click', () => { const d = $('#dlgHelp'); d.innerHTML = HELP_HTML; d.showModal(); });
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }));

// ---- 分割バー
(() => {
  const sp = $('#splitter'), left = $('#left');
  let drag = false;
  sp.addEventListener('mousedown', () => { drag = true; document.body.style.userSelect = 'none'; });
  window.addEventListener('mouseup', () => { drag = false; document.body.style.userSelect = ''; });
  window.addEventListener('mousemove', (e) => { if (drag) left.style.width = `${Math.max(200, Math.min(window.innerWidth - 200, e.clientX))}px`; });
})();

// 日付が変わったら描き直す(今日の線と遅れの印のため)。書きかけの欄やドラッグがあるときは待つ
// 図はガントチャートのときだけ描き直す。編集パネルは作り直すが、入力していた欄とカーソルの位置は戻す
setInterval(() => {
  if (todayStr() === drawnToday || pendingField || drag || applying || debounce !== null || !last?.ok) return;
  const a = document.activeElement;
  const label = editEl.contains(a) ? a.closest('label')?.firstChild?.textContent : null;
  const sel = label && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  // 今日の日付で変わるビュー(ガントチャート・担当者別ガントチャート・サマリー)は描き直す
  if (['gantt', 'people', 'summary'].includes(viewKindEl.value)) draw(); else { drawnToday = todayStr(); reselect(); }
  if (label) {
    const l = [...editEl.querySelectorAll('label')].find((x) => x.firstChild?.textContent === label);
    const f = l?.querySelector('input,textarea,select');
    if (f) { f.focus(); if (sel && f.setSelectionRange) f.setSelectionRange(...sel); }
  }
}, 60000);

// 開いたときは、前に編集していた内容を続ける(なければ空)
// 上書きの先は覚えていないので、次の上書き保存では保存先を尋ねる(シンプルスライドと同じ)
{ const d = restored(); setText(d ? d.text : '', d && typeof d.base === 'string' && d.base ? d.base : 'plan', { name: d && typeof d.name === 'string' ? d.name : '', dirty: !!d?.dirty, saved: d && typeof d.saved === 'string' ? d.saved : null, save: false }); }
})();
