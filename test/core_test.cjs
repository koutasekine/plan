// 計算部の検査。node test/core_test.cjs で実行する
'use strict';
const fs = require('fs');
// index.html の計算部(/*CORE-BEGIN*/ から /*CORE-END*/ まで)を取り出して読む
const html = fs.readFileSync(`${__dirname}/../index.html`, 'utf8');
const core = html.slice(html.indexOf('/*CORE-BEGIN*/'), html.indexOf('/*CORE-END*/'));
const P = new Function('module', `${core}; return Plan;`)(undefined);
let fail = 0, pass = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('NG:', msg); } };
const head = 'start: 2026-04-23\nmembers:\n- A\n- B\n- C\n';
const run = (body, h = head) => P.analyze(h + body);
const errs = (r) => r.diags.filter((d) => d.level === 'error');
const warns = (r) => r.diags.filter((d) => d.level === 'warn');
const hasErr = (body, re, h) => { const r = run(body, h); const e = errs(r); ok(e.some((d) => re.test(d.message)), `エラー ${re} が出ない: ${JSON.stringify(body)} → ${e.map((d) => d.message).join(' | ') || 'なし'}`); return r; };
const task = (r, name) => r.tasks.find((t) => t.name === name);

// ---- 例(付録 A。「例を読み込む」の例): 警告が出ない
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  ok(r.ok && r.diags.length === 0, `例に診断が出た: ${r.diags.map((d) => d.message).join(' | ')}`);
  ok(r.cp.T === 14000, '例のクリティカルパスが 14 日でない');
  ok(r.tasks.filter((x) => x.crit).map((x) => x.num).join(' ') === '1.2.1 2.2.1 3.2.1 3.2.4', `例のクリティカルパスのタスク: ${r.tasks.filter((x) => x.crit).map((x) => x.num)}`);
  ok(r.sched.finishDate <= r.sec.end.date, '例の日程が end: を超えた');
}
// ---- スライドの抜粋(対応が書かれていない要素があり、警告が出る)
{
  const t = fs.readFileSync(`${__dirname}/slide_excerpt.plan`, 'utf8');
  const r = P.analyze(t);
  ok(r.ok && !errs(r).length, '例にエラーがある');
  const codes = warns(r).map((d) => d.cat).join(',');
  ok(/C1/.test(codes) && /C2/.test(codes) && /C4/.test(codes) && !/C3/.test(codes) && !/C5/.test(codes), `例の警告の種類: ${codes}`);
  ok(r.cp.T === 14000, 'クリティカルパスが 14 日でない(スライド 15 枚目: 1+7+3+3)');
  ok(r.tasks.filter((x) => x.crit).map((x) => x.num).join(' ') === '1.2.1 2.2.1 3.2.1 3.2.2', 'クリティカルパスのタスクがスライドと違う');
  // 決定性: 2 回の計算と描画が同じ
  const a = P.VIEWS.map((v) => P.render(P.analyze(t), v.id).svg).join('\n');
  const b = P.VIEWS.map((v) => P.render(P.analyze(t), v.id).svg).join('\n');
  ok(a === b, '同じテキストから違う図が出た');
}

// ---- 構文エラー(仕様書 3.9 節)
hasErr('# 計画\nWBS: X\n- a by: A days: 1\n', /見出し/);
hasErr('WBS: X\n1. a by: A days: 1\n', /番号付き/);
hasErr('WBS: X\n* a by: A days: 1\n', /リストの印/);
hasErr('WBS: X\n- **a** by: A days: 1\n', /太字/);
hasErr('```\nWBS: X\n- a by: A days: 1\n```\n', /コードブロック/);
hasErr('WBS: X\nこれは説明の文です\n- a by: A days: 1\n', /説明の文/);
hasErr('WBS: X\n- a by: A days: 1\n　- b by: A days: 1\n', /全角空白/);
hasErr('WBS: X\n- a by: A days: 1\nWBS: Y\n', /2 回/);
hasErr('WBS: X\n- a by: A days: 1.2345\n', /3 桁/);
hasErr('WBS: X\n- a by: A days: x\n', /日数/);
hasErr('WBS: X\n- a, b by: A days: 1\n', /カンマ/);
hasErr('WBS: X\n- a::b by: A days: 1\n', /::/);
hasErr('WBS: X\n- a realizes: q days: 1\n', /書けません/);
hasErr('WBS: X\n- a by: A by: B days: 1\n', /2 回/);
hasErr('WBS: X\n- a by: A days: 1\n- a by: A days: 1\n', /同じ名前|2 つあります/);
hasErr('WBS: X\n  WBS: Y\n', /字下げせず/);
hasErr('- a\nstart: 2026-04-23\nmembers:\n- A\nWBS: X\n- b by: A days: 1\n', /節の行が必要/, '');
hasErr('WBS: X\n- b by: A days: 1\n', /下には要素を書けません/, 'start: 2026-04-23\n- a\nmembers:\n- A\n');
hasErr('WBS:\n- a by: A days: 1\n', /根の名前/);
hasErr('WBS: X\n- a by: A days: 1\n', /start:.*必須/, 'members:\n- A\n');
hasErr('WBS: X\n- a by: A days: 1\n', /members:.*必須/, 'start: 2026-04-23\n');
hasErr('', /WBS:.*必須/);
hasErr('end: 2026-04-01\nWBS: X\n- a by: A days: 1\n', /end:.*より前/);
hasErr('off: 2026-02-30\nWBS: X\n- a by: A days: 1\n', /読めません/);
hasErr('off: 2026-05-06..2026-05-03\nWBS: X\n- a by: A days: 1\n', /始めが終わりより後/);
hasErr('WBS: X\n- a by: A days: 1\n', /2 回/, 'start: 2026-04-23\nmembers:\n- A\n- A\n');
hasErr('WBS: X\n- a by: A days: 1\n', /字下げした行/, 'start: 2026-04-23\nmembers:\n- A\n  - B\n');
// 注と URL
{
  const r = run('WBS: X // 注\n- a by: A days: 1 note: https://example.jp/x // ここも注\n// 行全体の注\n');
  ok(r.ok && task(r, 'a').note === 'https://example.jp/x', `注と URL: ${errs(r).map((d) => d.message)} ${r.ok && task(r, 'a').note}`);
}

// ---- 参照(仕様書 3.7 節)
hasErr('WBS: X\n- a by: Z days: 1\n', /担当者「Z」/);
hasErr('WBS: X\n- a by: A days: 1 after: b\n', /「b」が WBS にありません/);
hasErr('WBS: X\n- p\n  - a by: A days: 1\n- q\n  - a by: A days: 1\n- r by: A days: 1 after: a\n', /2 つあり/);
{
  const r = run('WBS: X\n- p\n  - a by: A days: 1\n- q\n  - a by: A days: 2\n- r by: A days: 1 after: q::a\n');
  ok(r.ok && task(r, 'r').pred.length === 1 && task(r, 'r').pred[0].days === 2000, '修飾名 q::a で解決できない');
  const r2 = run('WBS: X\n- p\n  - a by: A days: 1\n- q\n  - a by: A days: 2\n- r by: A days: 1 after: X::q::a\n');
  ok(r2.ok && task(r2, 'r').pred[0].days === 2000, '根の名前を含む修飾名で解決できない');
}
hasErr('PBS: P\n- s\nWBS: X\n- a by: A days: 1 for: t\n', /「t」が PBS にありません/);
hasErr('WBS: X\n- a by: A days: 1 for: t\n', /PBS: がない/);
hasErr('FBS: F\n- f\nPBS: P\n- s realizes: g\nWBS: X\n- a by: A days: 1\n', /「g」が FBS にありません/);

// ---- 循環(仕様書 4.4・5.3 節)
hasErr('WBS: X\n- a by: A days: 1 after: b\n- b by: A days: 1 after: a\n', /循環/);
hasErr('WBS: X\n- a by: A days: 1 after: a\n', /自分自身/);
hasErr('WBS: X\n- p after: a\n  - a by: A days: 1\n', /下位/);
hasErr('WBS: X\n- p\n  - a by: A days: 1 after: p\n', /上位/);
hasErr('WBS: X\n- a by: A days: 1 after: c\n- b by: A days: 1 after: a\n- c by: A days: 1 after: b\n', /循環しています: /);

// ---- 受け継ぎ(仕様書 4.4 節)
{
  const r = run('WBS: X by: C\n- p by: A review: B\n  - a days: 1\n  - b days: 1 by: B\n- q\n  - c days: 1\n');
  ok(r.ok, `受け継ぎの例がエラー: ${errs(r).map((d) => d.message)}`);
  ok(task(r, 'a').by.map((m) => m.name).join() === 'A' && task(r, 'a').review.map((m) => m.name).join() === 'B', '親の by・review を受け継がない');
  ok(task(r, 'b').by.map((m) => m.name).join() === 'B', '子の by が置き換えにならない');
  ok(task(r, 'c').by.map((m) => m.name).join() === 'C', '根の by を受け継がない');
}
// ---- after: に途中の要素(仕様書 4.4 節)
{
  const r = run('WBS: X\n- p\n  - a by: A days: 1\n  - b by: B days: 2\n- q after: p\n  - c by: C days: 1\n  - d by: C days: 1 after: c\n');
  ok(r.ok, `after の例がエラー: ${errs(r).map((d) => d.message)}`);
  ok(task(r, 'c').pred.map((t) => t.name).join() === 'a,b', `途中の要素を指す after: が展開されない: ${task(r, 'c').pred.map((t) => t.name)}`);
  ok(task(r, 'd').pred.map((t) => t.name).join() === 'a,b,c', `親の after: と子の after: が合わさらない: ${task(r, 'd').pred.map((t) => t.name)}`);
}

// ---- 検査(仕様書 5 章)
{
  const fp = 'FBS: F\n- g\n  - f1 mop: 応答 1 秒以内, 95%\n  - f2\nPBS: P\n- s realizes: g\n  - s1 realizes: f1\n  - s2\nWBS: X\n- a by: A days: 1 for: s1\n- b days: 1 for: s\n';
  const r = run(fp);
  const w = warns(r).map((d) => `${d.cat}:${d.message}`);
  ok(r.ok, `検査の例がエラー: ${errs(r).map((d) => d.message)}`);
  ok(w.some((x) => /C1:.*「f2」/.test(x)) && !w.some((x) => /C1:.*「(g|f1)」/.test(x)), `C1: ${w}`);
  ok(w.some((x) => /C2:.*「s2」/.test(x)) && !w.some((x) => /C2:.*「(s|s1)」/.test(x)), `C2: ${w}`);
  ok(w.some((x) => /C3:.*「f2」/.test(x)) && !w.some((x) => /C3:.*「f1」/.test(x)), `C3(mop が 1 つでもあれば検査): ${w}`);
  ok(w.some((x) => /C4:.*「s2」/.test(x)) && !w.some((x) => /C4:.*「s1」/.test(x)), `C4: ${w}`);
  ok(w.some((x) => /C5:.*「b」/.test(x)) && !w.some((x) => /C5:.*「a」/.test(x)), `C5: ${w}`);
  ok(r.bySec.FBS.find((n) => n.name === 'f1').mops[0] === '応答 1 秒以内, 95%', 'mop: の値がカンマで切られた');
  const r2 = run(fp.replace(' mop: 応答 1 秒以内, 95%', ''));
  ok(!warns(r2).some((d) => d.cat === '検査 C3'), 'mop: が 1 つもないのに C3 を検査した');
  const r3 = run('WBS: X\n- a by: A days: 1 for: s1\n'.replace(' for: s1', ''));
  ok(r3.ok && !warns(r3).some((d) => /C1|C2|C4/.test(d.cat)), 'FBS・PBS がないのに対応を検査した');
}
// 複数の mop:
{
  const r = run('FBS: F\n- f mop: 1 秒以内 mop: 誤差 1% 以内\nWBS: X\n- a by: A days: 1\n');
  ok(r.ok && r.bySec.FBS[1].mops.length === 2, 'mop: を 2 回書けない');
}
// days: の警告
{
  const r = run('WBS: X\n- p days: 3\n  - a by: A\n');
  ok(r.ok && warns(r).some((d) => /days: は末端/.test(d.message)) && warns(r).some((d) => /days: がありません/.test(d.message)) && task(r, 'a').days === 0, 'days: の警告');
}

// ---- 日程(仕様書 6 章)
{
  // 同じ人の 2 タスク: 余裕の少ない方(最遅開始の早い方)が先
  const r = run('WBS: X\n- a by: A days: 2\n- b by: A days: 3\n');
  ok(r.cp.T === 3000 && task(r, 'b').s === 0 && task(r, 'a').s === 3000 && r.sched.spanDays === 5, `資源の重なり: b ${task(r, 'b').s} a ${task(r, 'a').s}`);
  // 同じ余裕なら書いた順
  const r2 = run('WBS: X\n- a by: A days: 2\n- b by: A days: 2\n');
  ok(task(r2, 'a').s === 0 && task(r2, 'b').s === 2000, '同じ余裕で書いた順にならない');
  // 小数と個人の休み: 2026-04-23 は木曜。A は金曜休み → 1.5 日のタスクは 木 1 日 + 土 0.5 日
  const r3 = run('WBS: X\n- a by: A days: 1.5\n- b by: A days: 1 after: a\n', 'start: 2026-04-23\nmembers:\n- A off: fri\n');
  ok(task(r3, 'a').f === 2500 && task(r3, 'b').s === 2500 && task(r3, 'b').f === 3500, `小数と休み: a.f ${task(r3, 'a').f} b ${task(r3, 'b').s}-${task(r3, 'b').f}`);
  // 全体の休み(範囲)と開始日が休み
  const r4 = run('WBS: X\n- a by: A days: 1\n', 'start: 2026-04-23\noff: 2026-04-23..2026-04-24\nmembers:\n- A\n');
  ok(task(r4, 'a').s === 2000 && r4.sched.spanDays === 3, '全体の休みを避けない');
  // 複数人: 全員が空いて作業できる日だけ進む
  const r5 = run('WBS: X\n- a by: A, B days: 2\n', 'start: 2026-04-23\nmembers:\n- A off: 2026-04-24\n- B off: 2026-04-25\n');
  ok(task(r5, 'a').s === 0 && task(r5, 'a').f === 4000, `複数人の休み: f ${task(r5, 'a').f}`);
  // end: を超えたら警告
  const r6 = run('end: 2026-04-24\nWBS: X\n- a by: A days: 3\n');
  ok(r6.ok && warns(r6).some((d) => /超えています/.test(d.message)), 'end: 超えの警告が出ない');
  // 作業できる日がない
  hasErr('WBS: X\n- a by: A days: 1\n', /作業できる日が見つかりません/, 'start: 2026-04-23\noff: mon,tue,wed,thu,fri,sat,sun\nmembers:\n- A\n');
  // review: は日程に影響しない
  const r7 = run('WBS: X\n- a by: A days: 2\n- b by: B review: A days: 2\n');
  ok(task(r7, 'a').s === 0 && task(r7, 'b').s === 0, 'review: が日程に影響した');
  // 0 日のタスク
  const r8 = run('WBS: X\n- a by: A days: 2\n- m by: A days: 0 after: a\n');
  ok(r8.ok && task(r8, 'm').s === 2000 && task(r8, 'm').f === 2000, '0 日のタスク');
  ok(warns(r8).some((d) => /days: が 0 です/.test(d.message)), 'days: 0 の警告が出ない');
  // 日数 0 のタスクは、休みに当たっても送らず、前のタスクの終わった日に属させる。日程の長さと end: の判定を延ばさない
  const r9 = run('end: 2026-04-24\nWBS: X\n- a by: A days: 2\n- m by: A days: 0 after: a\n- n by: A after: a\n', 'start: 2026-04-23\noff: 2026-04-25..2026-04-27\nmembers:\n- A\n');
  ok(r9.ok && task(r9, 'm').s === 2000 && task(r9, 'n').s === 2000 && task(r9, 'm').d1 === 1 && task(r9, 'n').d1 === 1, `日数 0 のタスクの日: m ${task(r9, 'm').s} n ${task(r9, 'n').s} d1 ${task(r9, 'm').d1}`);
  ok(r9.sched.spanDays === 2 && !warns(r9).some((d) => /超えています/.test(d.message)), `日数 0 のタスクが日程を延ばした: span ${r9.sched.spanDays}`);
  const r10 = run('WBS: X\n- m by: A days: 0\n');
  ok(r10.ok && task(r10, 'm').d0 === 0 && task(r10, 'm').d1 === 0 && r10.sched.spanDays === 1, '先行のない日数 0 のタスクは 1 日目');
}

// ---- レビューの指摘への修正
// 中-1: 字下げを戻した深さが前の行と一致しないとき(仕様書 3.4 節)
{
  const r = run('WBS: X\n- a\n   - b days: 1 by: A\n        - c days: 1 by: A\n    - d days: 1 by: A\n   - e days: 1 by: A\n');
  const e = r.nodes.find((n) => n.name === 'e'), d = r.nodes.find((n) => n.name === 'd');
  ok(e.parent.name === 'a' && d.parent.name === 'a', `字下げ: e の親 ${e.parent.name}、d の親 ${d.parent.name}`);
}
// 字下げを、仕様書 3.4 節の文言どおりに書いた参照実装と照合する
{
  let s2 = 777;
  const rr = (n) => { s2 = (s2 + 0x6D2B79F5) | 0; let t = s2; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) % n; };
  let same = 0, total = 0;
  for (let it = 0; it < 3000; it++) {
    const depths = [];
    const k = 1 + rr(9);
    for (let i = 0; i < k; i++) depths.push(rr(10));
    const body = depths.map((d, i) => `${' '.repeat(d)}- e${i}`).join('\n');
    const r = P.parse(`WBS: X\n${body}\n`);
    // 参照: 最初の行は根の子。前の行より深ければその子。そうでなければ、前の行で深さ ≤ 自分の最も近い行の兄弟。なければ根の子
    const par = [];
    for (let i = 0; i < k; i++) {
      if (i === 0) par.push(-1);
      else if (depths[i] > depths[i - 1]) par.push(i - 1);
      else { let j = i - 1; while (j >= 0 && depths[j] > depths[i]) j--; par.push(j >= 0 ? par[j] : -1); }
    }
    const got = depths.map((_, i) => { const n = r.nodes.find((x) => x.name === `e${i}`); return n.parent.parent ? +n.parent.name.slice(1) : -1; });
    total++;
    if (got.join() === par.join()) same++;
  }
  ok(same === total, `字下げが参照実装と ${total - same} / ${total} 例で一致しない`);
}
// 中-2: エラーがあるときは警告を出さない(仕様書 10 章)
for (const [body, h] of [['WBS: X\n- a days: 1 by: A, A after: zz\n'], ['WBS: X\n- p days: 2\n  - a by: A days: 1 after: b\n  - b by: A days: 1 after: a\n'], ['WBS: X\n- a days: 1\n', 'start: 2026-04-23\noff: mon,tue,wed,thu,fri,sat,sun\nmembers:\n- A\n']]) {
  const r = run(body, h);
  ok(errs(r).length > 0 && warns(r).length === 0, `エラーと一緒に警告が出た: ${r.diags.map((d) => d.message).join(' | ')}`);
}
// 中-4: 途中の要素も、自分にも子孫にも対応がなければ警告(仕様書 5.2 節)
{
  const r = run('FBS: F\n- g\n  - f1\n- h realizes: F\nPBS: P\n- s realizes: F\nWBS: X\n- a by: A days: 1 for: s\n'.replace('- h realizes: F\n', ''));
  const w = warns(r).map((d) => `${d.cat}:${d.message}`);
  ok(w.some((x) => /C1:.*「g」/.test(x)) && w.some((x) => /C1:.*「f1」/.test(x)), `途中の要素の C1: ${w}`);
  const r2 = run('FBS: F\n- g\n  - f1\n  - f2\nPBS: P\n- s realizes: f1\nWBS: X\n- a by: A days: 1 for: s\n');
  const w2 = warns(r2).map((d) => `${d.cat}:${d.message}`);
  ok(!w2.some((x) => /C1:.*「g」/.test(x)) && w2.some((x) => /C1:.*「f2」/.test(x)), `子孫に対応がある途中の要素を警告した: ${w2}`);
}
// 根の行の after: はエラー
hasErr('WBS: X after: a\n- a by: A days: 1\n', /根の行には after:/);
// after: に根の名前
hasErr('WBS: X\n- a by: A days: 1 after: X\n', /根なので after: に書けません/);
// 大きすぎる日数
hasErr('WBS: X\n- a by: A days: 36501\n', /大きすぎます/);
hasErr('WBS: X\n- a by: A days: 12345678901234567\n', /大きすぎます/);
{
  const r = run('WBS: X\n- a by: A days: 36500\n');
  ok(r.ok && r.sched.spanDays === 36500, '36500 日のタスクが計算できない');
}
// 「-」の後の全角空白・NBSP
hasErr('WBS: X\n-　a by: A days: 1\n', /半角の空白/);
hasErr('WBS: X\n- a by: A days: 1\n', /半角の空白/);
// BOM
{
  const r = P.analyze('﻿' + head + 'WBS: X\n- a by: A days: 1\n');
  ok(r.ok && !r.diags.length, `BOM 付きのテキストが読めない: ${r.diags.map((d) => d.message)}`);
}

// 新-1・新-2: 日数の上限は値の大きさで判定する
hasErr('WBS: X\n- a by: A days: 36500.001\n', /大きすぎます/);
{
  const r = run('WBS: X\n- a by: A days: 000001\n- b by: A days: 0036500.000\n');
  ok(r.ok && task(r, 'a').days === 1000 && task(r, 'b').days === 36500000, `先頭に 0 の付いた日数: ${r.diags.map((d) => d.message)}`);
}
// 1: ダミーを減らす。N 字形(c は a の後、d は a と b の後)はダミー 1 本
{
  const r = run('WBS: X\n- a by: A days: 1\n- b by: B days: 1\n- c by: A days: 1 after: a\n- d by: B days: 1 after: a, b\n');
  const g = P.buildAOA(r.tasks);
  ok(g.arcs.filter((a) => !a.task).length === 1, `N 字形のダミーが ${g.arcs.filter((a) => !a.task).length} 本`);
}

// 担当者がメンバー全員(2 人以上)のときは「全員」と表示する
{
  const r = run('WBS: X\n- a by: A, B, C days: 1\n- b by: A, B days: 1\n');
  const g = P.render(r, 'gantt').svg, ro = P.render(r, 'roles').svg;
  ok(g.includes('>全員<') && ro.includes('>全員<') && g.includes('>A・B<'), '全員の表示(ガント・役割分担)');
  const r1 = run('WBS: X\n- a by: A days: 1\n', 'start: 2026-04-23\nmembers:\n- A\n');
  ok(!P.render(r1, 'gantt').svg.includes('>全員<'), '1 人のチームで「全員」と表示した');
}

// ---- 図からの編集(テキストの書き換え)
{
  const E = P.Edit;
  const ana = (t) => P.analyze(t);
  const byName = (r, name) => r.nodes.find((n) => n.name === name);
  const base = head + 'FBS: F\n- g\n  - f1\n  - f2\nPBS: P\n- s realizes: f1\n- t\nWBS: X\n- 設計 by: A\n  - a days: 1 note: メモ // 注\n  - b days: 2 after: 設計::a\n- 実装\n  - a days: 3 by: B\n  - c days: 1 by: C after: 設計::a, b\n';
  const r0 = ana(base);
  ok(r0.ok, `編集の土台がエラー: ${errs(r0).map((d) => d.message)}`);
  const sel = (r, key) => P.Edit.locate(r, key);
  // 属性の書き換え・追加・削除(注は残る)
  let x = E.setAttr(r0, byName(r0, 'b').id, 'days', '4.5');
  let r = ana(x.text);
  ok(r.ok && task(r, 'b').days === 4500 && sel(r, x.select) === task(r, 'b').id, '日数の書き換え');
  x = E.setAttr(r0, r0.nodes.find((n) => n.name === 'a' && n.parent.name === '設計').id, 'note', '');
  ok(!x.text.includes('メモ') && x.text.includes('days: 1 // 注'), `note の削除(注は残す): ${x.text.split('\n')[13]}`);
  x = E.setAttr(r0, byName(r0, 't').id, 'note', '新しいメモ');
  r = ana(x.text);
  ok(byName(r, 't').note === '新しいメモ', 'note の追加');
  x = E.setAttr(r0, byName(r0, 'f2').id, 'mop', ['1 秒以内, 95%', '誤り 0 件']);
  r = ana(x.text);
  ok(byName(r, 'f2').mops.join('|') === '1 秒以内, 95%|誤り 0 件', 'mop の書き換え');
  // 名前の変更と参照の追従
  x = E.rename(r0, r0.nodes.find((n) => n.name === 'a' && n.parent.name === '設計').id, 'a2');
  r = ana(x.text);
  ok(r.ok && task(r, 'c').pred.map((t) => t.name).sort().join() === 'a2,b' && task(r, 'b').pred[0].name === 'a2', `名前の変更で after: が追従しない: ${errs(r).map((d) => d.message)}`);
  x = E.rename(r0, byName(r0, '設計').id, '基本設計');
  r = ana(x.text);
  ok(r.ok && x.text.includes('after: 基本設計::a, b'), `途中の要素の名前の変更で修飾名が追従しない: ${x.text.match(/after: .*/g)}`);
  x = E.rename(r0, r0.members.find((m) => m.name === 'A') ? 'm0' : '', '安藤');
  r = ana(x.text);
  ok(r.ok && byName(r, '設計').by[0].name === '安藤' && sel(r, x.select) === 'm0', '担当者の名前の変更で by: が追従しない');
  ok(E.rename(r0, byName(r0, 'f1').id, 'f2').error, '兄弟と同じ名前に変えられた');
  ok(E.rename(r0, byName(r0, 'f1').id, 'x, y').error, 'カンマを含む名前に変えられた');
  // すべての要素の名前を 1 つずつ変え、参照がすべて同じ要素(書いた順の番号)を指し続けることを確かめる
  for (const f of ['sample.plan', 'slide_excerpt.plan']) {
    const t0 = fs.readFileSync(`${__dirname}/${f}`, 'utf8');
    const ra = ana(t0);
    const sig = (rr) => rr.nodes.map((n) => Object.values(n.R).map((list) => list.map((q) => (q.isMember ? `m:${rr.members.indexOf(q)}` : q.order)).join(',')).join(';')).join('|');
    const before = sig(ra);
    let good = true;
    for (const n of [...ra.nodes, ...ra.members]) {
      const id = n.isMember ? `m${ra.members.indexOf(n)}` : n.id;
      const y = E.rename(ra, id, `${n.name}_改`);
      const rb = ana(y.text);
      if (!rb.ok || sig(rb) !== before || rb.diags.length !== ra.diags.length) { good = false; console.log('  名前の変更で参照が変わった:', f, n.name); }
    }
    ok(good, `${f}: 全要素の名前の変更で参照が保たれない`);
  }
  // 子と兄弟の追加、削除
  x = E.addChild(r0, byName(r0, 'f2').id);
  r = ana(x.text);
  ok(r.nodes.some((n) => n.name === '新しい要素' && n.parent.name === 'f2') && sel(r, x.select), '末端への子の追加');
  x = E.addChild(r0, byName(r0, '実装').id);
  r = ana(x.text);
  ok(byName(r, '新しい要素').parent.name === '実装' && x.text.includes('\n  - 新しい要素\n'), `子の追加の字下げ: ${JSON.stringify(x.text.slice(x.text.indexOf('新しい要素') - 8, x.text.indexOf('新しい要素')))}`);
  x = E.addChild(r0, r0.sec.WBS.root.id);
  r = ana(x.text);
  ok(byName(r, '新しい要素').parent === r.sec.WBS.root, '根への子の追加');
  x = E.addSibling(r0, byName(r0, '設計').id);
  r = ana(x.text);
  ok(byName(r, '新しい要素').parent === r.sec.WBS.root && byName(r, '新しい要素').order === byName(r, '実装').order - 1, '兄弟の追加の位置');
  x = E.addSibling(r0, 'm2');
  r = ana(x.text);
  ok(r.members.map((m) => m.name).join() === 'A,B,C,新しい担当者', '担当者の追加');
  x = E.remove(r0, byName(r0, '設計').id);
  r = ana(x.text);
  ok(x.refs === 2 && x.count === 3 && !r.parse.nodes.some((n) => n.name === '設計' || n.name === 'b') && errs(r).length === 2, `削除: refs ${x.refs} count ${x.count}`);
  x = E.remove(r0, r0.nodes.filter((n) => n.name === 'c')[0].id);
  ok(x.text.endsWith('by: B') || x.text.endsWith('by: B\n'), '最後の行の削除');
  // 対応と依存
  x = E.addRealizes(r0, byName(r0, 'f2').id, byName(r0, 't').id);
  r = ana(x.text);
  ok(byName(r, 't').R.realizes[0].name === 'f2', '対応の追加');
  ok(E.addRealizes(r0, byName(r0, 'f1').id, byName(r0, 's').id).error, 'すでにある対応を足せた');
  x = E.removeRealizes(r0, byName(r0, 's').id, byName(r0, 'f1').id);
  ok(!x.text.includes('realizes'), '対応の削除');
  x = E.addAfter(r0, byName(r0, 'b').id, r0.nodes.filter((n) => n.name === 'a')[1].id);
  r = ana(x.text);
  ok(r.ok && r.tasks.find((t) => t.name === 'a' && t.parent.name === '実装').pred[0].name === 'b', `依存の追加(同じ名前は修飾する): ${x.text.match(/a days: 3.*/)}`);
  ok(E.addAfter(r0, task(r0, 'c').id, byName(r0, 'b').id).error, '循環する依存を足せた');
  ok(E.addAfter(r0, byName(r0, 'b').id, task(r0, 'c').id).error, 'すでにある依存を足せた');
  x = E.removeAfter(r0, task(r0, 'c').id, byName(r0, 'b').id);
  r = ana(x.text);
  ok(task(r, 'c').pred.length === 1, '依存の削除');
  x = E.setDays(r0, byName(r0, 'b').id, 2500);
  ok(task(ana(x.text), 'b').days === 2500, '日数の変更');
  ok(E.setDays(r0, byName(r0, '設計').id, 1000).error, '途中の要素に日数を書けた');
}

// ---- 図からの編集: 書き込む前の確認(版 0.11 のレビューの指摘)
{
  const E = P.Edit;
  const ana = (t) => P.analyze(t);
  const nm = (r, name) => r.nodes.find((n) => n.name === name);
  const H1 = 'start: 2026-04-23\nmembers:\n- A\n- B\n';
  // 重大 2: 字下げの幅がそろっていない木で、別の要素の親子関係が変わる書き換えは拒む
  let r = ana(H1 + 'WBS: X\n- a days: 1 by: A\n    - b days: 1 by: A\n  - c days: 1 by: A\n');
  ok(r.ok, `重大2 の土台: ${errs(r).map((d) => d.message)}`);
  ok(/字下げ/.test(E.remove(r, nm(r, 'b').id).error ?? ''), `字下げのそろわない木での削除を拒まない: ${JSON.stringify(E.remove(r, nm(r, 'b').id))}`);
  ok(/字下げ/.test(E.addSibling(r, nm(r, 'a').id).error ?? ''), '字下げのそろわない木での兄弟の追加を拒まない');
  r = ana(H1 + 'WBS: X\n - a days: 1 by: A\n- b days: 1 by: A\n');
  ok(!!E.addChild(r, r.sec.WBS.root.id).error === (() => { const x = E.addChild(r, r.sec.WBS.root.id); return !x.text || P.parse(x.text).nodes.find((n) => n.name === '新しい要素')?.parent?.parent !== null; })(), '根への子の追加の確認');
  // 重大 3・中 7: 値に「空白 + //」「空白 + 予約語 + :」、形の誤り、いない担当者などは書き込まない
  r = ana(H1 + 'WBS: X\n- a note: z days: 1 by: A\n- b days: 1 by: A\n');
  const a = nm(r, 'a').id, b = nm(r, 'b').id;
  for (const [k, v] of [['note', 'see // here'], ['note', 'あとで after: a'], ['note', 'x by: B'], ['days', 'abc'], ['days', '1.2345'], ['by', 'Z'], ['after', 'b, zz'], ['note', '**太字**']]) {
    const x = E.setAttr(r, a, k, v);
    ok(!!x.error, `「${k}: ${v}」を書き込んだ: ${x.text?.split('\n').slice(-3, -1).join(' / ')}`);
  }
  for (const v of ['x // y', 'x after: y']) ok(!!E.rename(r, a, v).error, `名前「${v}」に変えられた`);
  ok(!!E.rename(r, 'm0', 'A // x').error, '担当者の名前に // を入れられた');
  ok(E.rename(r, 'm0', 'B').error === '担当者に「B」がすでにいます', '担当者の名前の重複の文');
  ok(!E.setAttr(r, a, 'note', 'URL は https://example.jp/ です').error, '空白の付かない // を含む URL のメモを拒んだ');
  // 中 2: 名前の変更で曖昧になる参照は、修飾名を付け直す
  r = ana(H1 + 'WBS: X\n- p\n  - a days: 1 by: A\n- q\n  - b days: 1 by: A\n- c days: 1 by: A after: a, b\n');
  let x = E.rename(r, nm(r, 'b').id, 'a');
  let r2 = x.text ? ana(x.text) : null;
  ok(r2?.ok && x.text.includes('after: p::a, q::a'), `名前の変更で曖昧になる参照の修飾: ${x.error ?? x.text.match(/after: .*/)}`);
  r = ana(H1 + 'WBS: X\n- p\n  - a days: 1 by: A\n- q\n  - z days: 1 by: A\n- c days: 1 by: A after: a\n');
  x = E.rename(r, nm(r, 'z').id, 'a');
  ok(x.text?.includes('after: p::a') && ana(x.text).ok, `既存の参照が曖昧になるときの修飾: ${x.error ?? x.text.match(/after: .*/)}`);
  // MOP は元の位置のまま書き換える
  r = ana(H1 + 'FBS: F\n- f mop: 1 mop: 2 note: n mop: 3\nWBS: X\n- t days: 1 by: A\n');
  x = E.setAttr(r, nm(r, 'f').id, 'mop', ['x', 'y', 'z']);
  ok(x.text?.includes('- f mop: x mop: y note: n mop: z'), `MOP の位置: ${x.error ?? x.text.split('\n')[5]}`);
  x = E.setAttr(r, nm(r, 'f').id, 'mop', ['x']);
  ok(x.text?.includes('- f mop: x note: n\n'), `MOP を減らす: ${x.error ?? x.text.split('\n')[5]}`);
  // 削除は、消した要素への参照のエラーだけを認める
  r = ana(H1 + 'WBS: X\n- a days: 1 by: A\n- b days: 1 by: A after: a\n');
  x = E.remove(r, nm(r, 'a').id);
  ok(!x.error && x.refs === 1, '参照される要素の削除(参照のエラーは認める)');
}
// 字下げの幅をばらばらにした木に乱数で操作を加え、書き込まれたときは、対象外の要素の親子関係が保たれていることを独立に確かめる
{
  let s2 = 4242;
  const rr = (n) => { s2 = (s2 + 0x6D2B79F5) | 0; let t = s2; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) % n; };
  let tried = 0, written = 0, broken = 0;
  for (let it = 0; it < 1500; it++) {
    const k = 2 + rr(8);
    const lines = [];
    for (let i = 0; i < k; i++) lines.push(`${' '.repeat(rr(7))}- e${i}${rr(3) ? ' // 注' : ''}`);
    const t0 = `start: 2026-04-23\nmembers:\n- A\nWBS: X by: A\n${lines.join('\n')}${rr(2) ? '\n' : ''}`;
    const r = P.analyze(t0);
    if (!r.ok) continue;
    const nodes = r.nodes.filter((n) => n.sec === 'WBS');
    const n = nodes[rr(nodes.length)];
    let op = rr(4);
    if ((op === 1 || op === 2) && !n.parent) op = 3; // 根には兄弟の追加と削除ができないので、名前の変更にする
    const x = op === 0 ? P.Edit.addChild(r, n.id) : op === 1 ? P.Edit.addSibling(r, n.id) : op === 2 ? P.Edit.remove(r, n.id) : P.Edit.rename(r, n.id, `${n.name}x`);
    tried++;
    if (x.error) continue;
    written++;
    // 名前で対応を取って比べる(名前は e0, e1, … で一意。変えた名前と足した要素は除く)
    const before = new Map(P.parse(t0).nodes.map((m) => [m.name, m.parent ? m.parent.name : null]));
    const after = new Map(P.parse(x.text).nodes.map((m) => [m.name, m.parent ? m.parent.name : null]));
    const gone = op === 2 ? new Set(P.parse(t0).nodes.filter((m) => { for (let y = m; y; y = y.parent) if (y.name === n.name) return true; return false; }).map((m) => m.name)) : new Set();
    for (const [name, par] of before) {
      if (gone.has(name)) continue;
      const nn = op === 3 && name === n.name ? `${n.name}x` : name;
      const pp = op === 3 && par === n.name ? `${n.name}x` : par;
      if (after.get(nn) !== pp) { broken++; break; }
    }
  }
  ok(broken === 0 && written > 300, `字下げのばらばらな木の操作: 試行 ${tried}、書き込み ${written}、親子関係が崩れた ${broken}`);
  console.log(`字下げのばらばらな木の操作: 試行 ${tried}、書き込み ${written}、親子関係が崩れた ${broken}`);
}

// ---- 乱数による機械検査: 日程は仕様 6 章の文言どおりに書いた参照実装と照合し、アローダイアグラムは依存関係を照合する
// 乱数生成器は mulberry32(32 ビットの整数演算だけで、桁落ちしない)
let seed = 12345;
const rnd = (n) => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) % n;
};
const WDN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const START = 20566; // 2026-04-23(1970-01-01 からの日数)
const dstr = (dn) => new Date(dn * 86400000).toISOString().slice(0, 10);
// 休みの規則を作る(曜日・日付・範囲)
const randOff = () => {
  const out = [];
  const k = rnd(3);
  for (let i = 0; i < k; i++) {
    const c = rnd(3);
    if (c === 0) out.push({ type: 'wd', v: rnd(7) });
    else if (c === 1) out.push({ type: 'd', v: START + rnd(20) });
    else { const x = START + rnd(20); out.push({ type: 'r', a: x, b: x + rnd(4) }); }
  }
  return out;
};
const offStr = (list) => list.map((o) => (o.type === 'wd' ? WDN[o.v] : o.type === 'd' ? dstr(o.v) : `${dstr(o.a)}..${dstr(o.b)}`)).join(', ');
const offHit = (list, dn) => list.some((o) => (o.type === 'wd' ? new Date(dn * 86400000).getUTCDay() === o.v : o.type === 'd' ? o.v === dn : o.a <= dn && dn <= o.b));
// 参照実装(仕様書 6.2・6.3 節の文言どおり。開始時刻を 0.1 日刻みで総当たりする)
function reference(inst) {
  const { tasks, gOff, mOff } = inst;
  const n = tasks.length;
  const ES = [], EF = [], LS = [], LF = [];
  for (let i = 0; i < n; i++) { ES[i] = Math.max(0, ...tasks[i].pre.map((j) => EF[j])); EF[i] = ES[i] + tasks[i].days; }
  const T = n ? Math.max(...EF) : 0;
  for (let i = n - 1; i >= 0; i--) {
    const succ = tasks.map((t, k) => (t.pre.includes(i) ? k : -1)).filter((k) => k >= 0);
    LF[i] = succ.length ? Math.min(...succ.map((k) => LS[k])) : T;
    LS[i] = LF[i] - tasks[i].days;
  }
  const work = (i, day) => !offHit(gOff, START + day) && tasks[i].by.every((m) => !offHit(mOff[m], START + day));
  const s = [], f = [], done = new Array(n).fill(false);
  const busy = {};
  for (let cnt = 0; cnt < n; cnt++) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && tasks[i].pre.every((j) => done[j]) && (best < 0 || LS[i] < LS[best])) best = i;
    const i = best, t = tasks[i];
    const c0 = Math.max(0, ...t.pre.map((j) => f[j]));
    if (t.days === 0) { s[i] = c0; f[i] = c0; done[i] = true; continue; }
    for (let st = c0; ; st += 100) {
      if (st > c0 + 400000) throw new Error('参照実装: 置けない');
      if (!work(i, Math.floor(st / 1000))) continue;
      let x = st, rem = t.days;
      while (rem > 0) { const d = Math.floor(x / 1000); if (!work(i, d)) { x = (d + 1) * 1000; continue; } const take = Math.min(rem, (d + 1) * 1000 - x); x += take; rem -= take; }
      if (t.by.every((m) => (busy[m] ?? []).every(([a, b]) => !(a < x && st < b)))) { s[i] = st; f[i] = x; break; }
    }
    for (const m of t.by) (busy[m] ??= []).push([s[i], f[i]]);
    done[i] = true;
  }
  const lastDay = (i) => (f[i] > s[i] ? Math.ceil(f[i] / 1000) - 1 : Math.max(0, Math.ceil(s[i] / 1000) - 1));
  const span = n ? Math.max(...tasks.map((_, i) => lastDay(i))) + 1 : 0;
  return { T, LS, ES, s, f, span, crit: tasks.map((_, i) => LS[i] === ES[i]) };
}
let aoaChecked = 0, schedChecked = 0, parallelPairs = 0, contended = 0, dummies = 0;
for (let iter = 0; iter < 2000; iter++) {
  const members = ['A', 'B', 'C', 'D'].slice(0, 1 + rnd(4));
  const n = 1 + rnd(14);
  const tasks = [];
  for (let i = 0; i < n; i++) {
    const pre = [];
    for (let j = 0; j < i; j++) if (rnd(10) < 3) pre.push(j);
    let by = members.filter(() => rnd(2) === 0);
    if (!by.length && rnd(5)) by = [members[rnd(members.length)]];
    const days = rnd(10) === 0 ? 0 : rnd(3) === 0 ? 100 * (1 + rnd(30)) : 1000 * (1 + rnd(4));
    tasks.push({ pre, by, days });
  }
  const gOff = randOff();
  const mOff = Object.fromEntries(members.map((m) => [m, randOff()]));
  // 全員がずっと休みにならないよう、曜日の休みは 7 つそろわない(randOff は 2 つまで)
  const lines = [`start: ${dstr(START)}`];
  if (gOff.length) lines.push(`off: ${offStr(gOff)}`);
  lines.push('members:');
  for (const m of members) lines.push(`- ${m}${mOff[m].length ? ` off: ${offStr(mOff[m])}` : ''}`);
  lines.push('WBS: X');
  tasks.forEach((t, i) => lines.push(`- t${i} days: ${P.fmtDays(t.days)}${t.by.length ? ` by: ${t.by.join(', ')}` : ''}${t.pre.length ? ` after: ${t.pre.map((j) => `t${j}`).join(', ')}` : ''}`));
  const r = P.analyze(lines.join('\n') + '\n');
  if (!r.ok) { ok(false, `乱数の例がエラー(例 ${iter}): ${errs(r).map((d) => d.message)}`); continue; }
  const ref = reference({ tasks, gOff, mOff });
  let same = r.cp.T === ref.T && r.sched.spanDays === ref.span;
  r.tasks.forEach((t, i) => { if (t.s !== ref.s[i] || t.f !== ref.f[i] || t.LS !== ref.LS[i] || t.ES !== ref.ES[i] || t.crit !== ref.crit[i]) same = false; });
  ok(same, `日程が参照実装と一致しない(例 ${iter})`);
  schedChecked++;
  // 例の中身の多様さを数える(検査が並行・資源の競合を踏んでいることの確認)
  const anc = (i) => { const s2 = new Set(); const st = [...tasks[i].pre]; while (st.length) { const j = st.pop(); if (!s2.has(j)) { s2.add(j); st.push(...tasks[j].pre); } } return s2; };
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) {
    if (anc(i).has(j)) continue;
    parallelPairs++;
    if (tasks[i].days && tasks[j].days && tasks[i].by.some((m) => tasks[j].by.includes(m))) contended++;
  }
  // アローダイアグラム: タスク q の終わりの事象からタスク t の始まりの事象へ道がある ⇔ q が t の先行(推移的)
  const g = P.buildAOA(r.tasks);
  const startEv = new Map(), endEv = new Map();
  for (const a of g.arcs) if (a.task) { startEv.set(a.task, a.from); endEv.set(a.task, a.to); } else dummies++;
  const reach = (from) => { const seen = new Set([from]); const st = [from]; while (st.length) { const e = st.pop(); for (const ai of e.outA) { const to = g.arcs[ai].to; if (!seen.has(to)) { seen.add(to); st.push(to); } } } return seen; };
  let good = true;
  r.tasks.forEach((q, qi) => {
    const R2 = reach(endEv.get(q));
    r.tasks.forEach((t, ti) => { if (t !== q && R2.has(startEv.get(t)) !== anc(ti).has(qi)) good = false; });
  });
  const pairs = new Set();
  for (const a of g.arcs) { const k = `${a.from.id}-${a.to.id}`; if (pairs.has(k)) good = false; pairs.add(k); }
  // 始まりの事象(入る矢印なし)と終わりの事象(出る矢印なし)は 1 つずつ
  if (g.events.filter((e) => !e.inA.length).length !== 1 || g.events.filter((e) => !e.outA.length).length !== 1) good = false;
  ok(good, `アローダイアグラムの依存関係が正しくない(例 ${iter})`);
  aoaChecked++;
}
ok(parallelPairs > 10000 && contended > 3000 && dummies > 500, `乱数の例が多様でない: 並行の組 ${parallelPairs}、資源を取り合う組 ${contended}、ダミー ${dummies}`);
console.log(`乱数の例: 並行の組 ${parallelPairs}、資源を取り合う組 ${contended}、ダミー作業 ${dummies}`);
console.log(`アローダイアグラムの機械検査 ${aoaChecked} 例、日程の機械検査 ${schedChecked} 例`);

// ---- タスクの状態(status:。仕様書 4.4 節・7.5 節・11.2 節)
{
  const r = run('WBS: X\n- g\n  - a by: A days: 1 status: done\n  - b by: A days: 1 status: doing\n  - c by: A days: 1 status: blocked\n  - d by: A days: 1 status: todo\n  - e by: A days: 1\n');
  ok(r.ok && !r.diags.length, `状態を書いた例に診断: ${r.diags.map((d) => d.message)}`);
  ok(['a', 'b', 'c', 'd', 'e'].map((x) => task(r, x).status).join(' ') === 'done doing blocked todo todo', '状態の読み取り(省略は todo)');
  hasErr('WBS: X\n- a by: A days: 1 status: 完了\n', /状態「完了」が読めません/);
  hasErr('WBS: X\n- a by: A days: 1 status: Done\n', /状態「Done」が読めません/);
  hasErr('WBS: X\n- a by: A days: 1 status: done status: todo\n', /「status:」が同じ行に 2 回/);
  hasErr('FBS: F\n- a status: done\nWBS: X\n- a by: A days: 1\n', /「status:」は FBS: の要素には書けません/);
  const w = run('WBS: X status: done\n- g status: doing\n  - a by: A days: 1\n');
  ok(w.ok && warns(w).filter((d) => /status: は末端のタスクにだけ書けます/.test(d.message)).length === 2, '途中の要素と根の status: に警告が出ない');
  ok(task(w, 'a').status === 'todo', '途中の要素の status: を子が受け継いだ');
}
// 状態は日程に影響しない
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r1 = P.analyze(t), r0 = P.analyze(t.replace(/ status: \w+/g, ''));
  ok(r1.tasks.length === r0.tasks.length && r1.tasks.every((x, i) => x.s === r0.tasks[i].s && x.f === r0.tasks[i].f && x.TF === r0.tasks[i].TF), '状態で日程が変わった');
  ok(r1.tasks.filter((x) => x.status !== 'todo').length === 10, '例の状態の数');
}
// ガントチャート: 塗り、状態の列、今日の線、遅れ
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  const g0 = P.render(r, 'gantt').svg;
  ok(!/>今日</.test(g0) && !/>遅れ</.test(g0), '今日を渡さないのに今日の線か遅れが出た');
  ok(g0 === P.render(P.analyze(t), 'gantt').svg, '今日なしの描画が決定的でない');
  const gOf = (svg, x) => { const re = new RegExp(`<g data-id="${x.id}"[^>]*>(.*?)</g>`, 'g'); return [...svg.matchAll(re)].map((m) => m[1]); };
  const fills = { todo: 'fill="#fff" stroke="#333"', doing: 'fill="#2b8fd8"', done: 'fill="#bdbdb8"', blocked: 'fill="#8b1a2b"' };
  for (const x of r.tasks) {
    const [bar, row] = gOf(g0, x);
    ok(bar && bar.includes(fills[x.status]) && Object.entries(fills).every(([k, f]) => k === x.status || !bar.includes(f)), `棒の塗りが状態と違う: ${x.name} ${x.status}`);
    ok(row && row.includes(`>${P.STATUS[x.status]}</text>`), `状態の列: ${x.name}`);
    ok(row && !row.includes(`fill="#8b1a2b">${x.num} `), `ガントチャートでタスク名を赤字にした: ${x.name}`);
  }
  ok(r.tasks.some((x) => x.crit), '例にクリティカルパスのタスクがない');
  // 役割分担では、クリティカルパスのタスク名の赤字を残す
  const ro = P.render(r, 'roles').svg;
  ok(r.tasks.filter((x) => x.crit).every((x) => ro.includes(`fill="#8b1a2b">${x.num} `)), '役割分担のクリティカルパスの赤字が消えた');
  // 今日を 2026-05-01 とする: 遅れは、完了でなく、2026-05-01 より前の日に終わる予定のタスク
  const today = '2026-05-01', dn = Math.round(Date.UTC(2026, 4, 1) / 86400000);
  const g1 = P.render(r, 'gantt', { today }).svg;
  ok(g1 === P.render(P.analyze(t), 'gantt', { today }).svg, '同じ日付での描画が決定的でない');
  const late = r.tasks.filter((x) => x.status !== 'done' && r.sched.start + x.d1 < dn);
  ok(late.length >= 1 && late.length < r.tasks.length, `遅れのタスクの数が試験にならない: ${late.length}`);
  for (const x of r.tasks) ok(gOf(g1, x)[0].includes('>遅れ</text>') === late.includes(x), `遅れの印: ${x.name}`);
  ok((g1.match(/>遅れ<\/text>/g) ?? []).length === late.length + 1, '遅れの印の数(凡例を含む)');
  ok(/>今日<\/text>/.test(g1) && g1.includes('今日(2026-05-01)'), '今日の線か凡例がない');
  const x1 = /<path d="M([\d.]+) [\d.]+V[\d.]+" stroke="#333" stroke-width="2"\/>/.exec(g1);
  // 棒の右端のつまみ(x = 目盛りの左端 + 終わり × 1 日の幅 − 4)から目盛りの左端を求め、今日の線が今日の列の始まりにあるか確かめる
  const t0 = r.tasks.find((x) => x.days > 0);
  const hx = new RegExp(`data-handle="${t0.id}" data-days="\\d+" data-dw="24" data-gx="[\\d.]+" x="([\\d.]+)"`).exec(g1);
  const gx = +hx[1] + 4 - t0.f / 1000 * 24;
  ok(x1 && Math.abs(+x1[1] - (gx + (dn - r.sched.start) * 24)) < 1e-6, `今日の線の位置: ${x1 && x1[1]} / ${gx + (dn - r.sched.start) * 24}`);
  // 範囲の外の今日: 線は引かないが、遅れは出す
  const g2 = P.render(r, 'gantt', { today: '2027-01-01' }).svg;
  ok(!/>今日<\/text>/.test(g2), '範囲の外に今日の線を引いた');
  ok((g2.match(/>遅れ<\/text>/g) ?? []).length === r.tasks.filter((x) => x.status !== 'done').length + 1, '範囲の外の今日で、完了でないタスクすべてが遅れにならない');
  const g3 = P.render(r, 'gantt', { today: '2026-04-01' }).svg;
  ok(!/>今日<\/text>/.test(g3) && (g3.match(/>遅れ<\/text>/g) ?? []).length === 1, '開始より前の今日で遅れが出た');
  // 開始日の今日は線を引く。日数 0 のタスク(前の日に属する)の遅れ
  const z = run('WBS: X\n- a by: A days: 1\n- b by: A days: 0 after: a\n- c by: B days: 2\n');
  const gz = P.render(z, 'gantt', { today: '2026-04-24' }).svg;
  ok(gOf(gz, task(z, 'a'))[0].includes('>遅れ<') && gOf(gz, task(z, 'b'))[0].includes('>遅れ<') && !gOf(gz, task(z, 'c'))[0].includes('>遅れ<'), `日数 0 のタスクの遅れ: d1=${task(z, 'b').d1}`);
  ok(/>今日<\/text>/.test(P.render(z, 'gantt', { today: '2026-04-23' }).svg), '開始日に今日の線がない');
  // 最後の列の翌日には線を引かない(列がないため)。最後の列の日には引く
  const z3 = P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: X\n- a by: A days: 3\n');
  ok(/>今日</.test(P.render(z3, 'gantt', { today: '2026-04-25' }).svg) && !/>今日</.test(P.render(z3, 'gantt', { today: '2026-04-26' }).svg), '今日の線の終わりの境目');
  const d = P.describe(r, late[0].id, { today });
  ok(d.items.some(([k, v]) => k === '状態' && v.endsWith('、遅れ')), '選んだ要素の欄に遅れが出ない');
  ok(P.describe(r, r.tasks[0].id).items.some(([k, v]) => k === '状態' && v === '完了(done)'), '選んだ要素の欄の状態');
}
// 棒は、続いている日を 1 本にまとめ、休みの日で切る(幅の合計は日数と同じ)
{
  const z = P.analyze('start: 2026-04-23\noff: sun\nmembers:\n- A off: 2026-04-28\nWBS: X\n- a by: A days: 7.5\n');
  const g = P.render(z, 'gantt').svg;
  const bar = new RegExp(`<g data-id="${task(z, 'a').id}"[^>]*>(.*?)</g>`).exec(g)[1];
  const ws = [...bar.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)"/g)].map((m) => +m[1]);
  ok(ws.length === 3 && Math.abs(ws.reduce((x, y) => x + y, 0) - 7.5 * 24) < 1e-9, `棒の切れ方: ${ws}`);
}
// 図からの編集: 状態
{
  const E = P.Edit;
  const base = 'start: 2026-04-23\nmembers:\n- A\nWBS: X\n- g\n  - a by: A days: 1 // 注\n  - b by: A status: doing days: 2\n';
  const r = P.analyze(base);
  const id = (n) => task(r, n).id;
  const x0 = E.setStatus(r, id('a'), 'todo');
  ok(!x0.error && x0.text === base, '書いていないタスクで todo を選んだのに書き足した');
  const x1 = E.setStatus(r, id('a'), 'blocked');
  ok(!x1.error && x1.text === base.replace('days: 1 // 注', 'days: 1 status: blocked // 注'), `status: の書き足し: ${JSON.stringify(x1)}`);
  const x2 = E.setStatus(r, id('b'), 'done');
  ok(!x2.error && x2.text === base.replace('status: doing', 'status: done'), 'status: の値の置き換え');
  const x3 = E.setStatus(r, id('b'), 'todo');
  ok(!x3.error && x3.text === base.replace('status: doing', 'status: todo'), '書いてある status: を todo にしたとき');
  ok(/タスク/.test(E.setStatus(r, r.bySec.WBS.find((n) => n.name === 'g').id, 'done').error ?? ''), '途中の要素に状態を書けた');
  ok(!!E.setStatus(r, id('a'), 'finished').error, '4 つ以外の状態を書けた');
  ok(!!E.rename(r, id('a'), 'x status: y').error && !!E.setAttr(r, id('a'), 'note', 'x status: y').error, '「空白 + status:」を名前・値に書けた');
  for (const x of [x1, x2, x3]) { const r2 = P.analyze(x.text); ok(r2.ok && !r2.diags.length, '状態の書き換えの後に診断が出た'); }
  ok(task(P.analyze(x1.text), 'a').status === 'blocked', '書き足した状態が読めない');
}
// ---- チェック済みの MOP(mop*:)とテスト項目の表(仕様書 3.6 節・7.6 節・11.2 節)
const W_ = 'WBS: W\n- t by: A days: 1\n';
{
  const r = run('FBS: F\n- a mop: x mop*: y note: n mop: z\n- b mop*: w\n' + W_);
  const a = r.bySec.FBS.find((n) => n.name === 'a');
  ok(r.ok && !r.diags.length, `mop*: の例に診断: ${r.diags.map((d) => d.message)}`);
  ok(a.mops.join('|') === 'x|y|z' && a.mopChecked.join('|') === 'false|true|false', 'mop*: の読み取り');
  hasErr('FBS: F\n- a mop: x\nPBS: P\n- p mop*: y\n' + W_, /「mop\*:」は PBS: の要素には書けません/);
  hasErr('FBS: F\n- a mop*:\n' + W_, /「mop\*:」の後ろに値がありません/);
  // C3: mop*: も MOP として数える
  const c = run('FBS: F\n- a mop*: x\n- b\n' + W_);
  ok(warns(c).filter((d) => d.cat === '検査 C3').map((d) => d.message).join() === 'FBS の「b」に MOP(mop: か mop*:)がありません', 'mop*: だけのときの C3');
  ok(P.render(r, 'fbs').svg.includes('>✓ MOP: y<') && P.render(r, 'fbs').svg.includes('>MOP: x<'), 'FBS の木でチェック済みの印');
  ok(P.describe(r, a.id).items.some(([k, v]) => k === 'MOP' && v === 'x / ✓ y / z'), '選んだ要素の欄の MOP');
}
// 表のビュー
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  ok(P.VIEWS.map((v) => v.id).join(' ') === 'fbs pbs match wbs aoa roles gantt people mop summary', 'ビューの並び');
  const g = P.render(r, 'mop').svg;
  const boxes = [...g.matchAll(/data-mop="(n\d+)\|(\d+)" data-checked="([01])"/g)];
  const all = r.bySec.FBS.flatMap((n) => n.mops.map((m, i) => `${n.id}|${i}|${n.mopChecked[i] ? 1 : 0}`));
  ok(boxes.map((m) => `${m[1]}|${m[2]}|${m[3]}`).join(' ') === all.join(' '), '済の欄が MOP と 1 対 1 でない');
  ok(g.includes(`チェック済み ${all.filter((x) => x.endsWith('|1')).length} / ${all.length} 件`), '件数の表示');
  ok(g.includes('>実現する PBS の要素<') && g.includes('>通知API<'), 'PBS の列');
  const odd = 'start: 2026-04-23\nmembers:\n- A\nFBS: 根 mop: R\n- 機能1 mop*: M\n  - 葉a mop: a1 mop*: a2\n  - 葉b\n  - 中間2\n    - 葉c mop: c\n- 葉d\nWBS: W\n- t by: A days: 1\n';
  const o = P.analyze(odd), go = P.render(o, 'mop').svg;
  ok(!go.includes('実現する PBS の要素'), 'PBS がないのに PBS の列を出した');
  ok((go.match(/>\(MOP なし\)</g) ?? []).length === 2, '(MOP なし)の行の数');
  ok(go.includes('>「根」全体<') && go.includes('>「機能1」全体<'), '途中の要素と根の MOP の行');
  ok((go.match(/data-mop=/g) ?? []).length === 5 && go.includes('チェック済み 2 / 5 件'), '途中の要素と根の MOP の済の欄');
  ok((go.match(/stroke-dasharray="5 3"/g) ?? []).length === 4, 'C3 の警告の枠(葉b と葉d の、機能と MOP の欄)');
  const n0 = run('FBS: F\n' + W_);
  ok(/FBS に要素がありません/.test(P.render(n0, 'mop').svg), '要素がない FBS');
  ok(P.render(run('WBS: X\n- a by: A days: 1\n'), 'mop').svg === null, 'FBS がないのに描いた');
}
// 図からの編集: チェックの切り替え
{
  const E = P.Edit;
  const base = 'start: 2026-04-23\nmembers:\n- A\nFBS: F\n- a mop: x note: n mop*: y // 注\n- b mop: w\n' + W_;
  const r = P.analyze(base);
  const a = r.bySec.FBS.find((n) => n.name === 'a').id;
  const x1 = E.setMopChecked(r, a, 0, true);
  ok(!x1.error && x1.text === base.replace('mop: x', 'mop*: x'), `チェックを付ける: ${JSON.stringify(x1)}`);
  const x2 = E.setMopChecked(r, a, 1, false);
  ok(!x2.error && x2.text === base.replace('mop*: y', 'mop: y'), 'チェックを外す');
  ok(E.setMopChecked(r, a, 1, true).text === base, '同じ状態にしても書き換えない');
  ok(!!E.setMopChecked(r, a, 2, true).error, 'ない MOP の番号');
  for (const x of [x1, x2]) { const r2 = P.analyze(x.text); ok(r2.ok && !r2.diags.length, 'チェックの切り替えの後に診断'); }
  // MOP の欄の書き換え: 同じ文はチェックを保つ
  const set = (list) => E.setAttr(r, a, 'mop', list);
  ok(set(['x', 'y']).text === base, '変えないときは書き換えない');
  ok(set(['y']).text === base.replace('mop: x ', ''), '前の MOP を消すと、残る MOP のチェックはそのまま');
  ok(set(['x']).text === base.replace(' mop*: y', ''), '後ろの MOP を消す');
  ok(set(['x', 'k', 'y']).text === base.replace('mop: x', 'mop: x mop: k'), `間に足す: ${set(['x', 'k', 'y']).text}`);
  ok(set(['k', 'x', 'y']).text === base.replace('mop: x', 'mop: k mop: x'), '前に足す');
  ok(set(['x', 'y2']).text === base.replace('mop*: y', 'mop*: y2'), '文を直しても、チェックはそのまま');
  ok(set(['x', 'y', 'k']).text === base.replace('mop*: y', 'mop*: y mop: k'), '後ろに足す');
  { const a2 = P.analyze(set(['y', 'x']).text).bySec.FBS.find((n) => n.name === 'a'); ok(a2.mops.join() === 'y,x' && a2.mopChecked.join() === 'true,false', `並べ替えてもチェックを引き継ぐ: ${set(['y', 'x']).text}`); }
  const dup = P.analyze(base.replace('mop: x note: n mop*: y', 'mop: y note: n mop*: y'));
  const xd = E.setAttr(dup, dup.bySec.FBS.find((n) => n.name === 'a').id, 'mop', ['y']);
  ok(P.analyze(xd.text).bySec.FBS.find((n) => n.name === 'a').mopChecked.join() === 'true', `同じ文の 2 つを 1 つにすると、チェック済みが残る: ${xd.text}`);
  const r0 = P.analyze('start: 2026-04-23\nmembers:\n- A\nFBS: F\n- a note: n // 注\n' + W_);
  ok(E.setAttr(r0, r0.bySec.FBS[1].id, 'mop', ['p', 'q']).text === 'start: 2026-04-23\nmembers:\n- A\nFBS: F\n- a note: n mop: p mop: q // 注\n' + W_, 'MOP のない要素に足す');
}
// MOP の欄の書き換えの機械検査: 並びは書いたとおり。消すだけ・足すだけのときは、残る MOP のチェックが変わらず、足した MOP は未チェック
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = (n) => Math.floor(rnd() * n);
  const E = P.Edit;
  let tries = 0, wrote = 0;
  for (let it = 0; it < 600; it++) {
    const k = pick(5), olds = [];
    for (let i = 0; i < k; i++) olds.push({ t: `m${pick(4)}`, c: rnd() < 0.5 });
    const others = ['', ' note: n', ' // 注'];
    let line = '- a';
    olds.forEach((o, i) => { line += ` ${o.c ? 'mop*' : 'mop'}: ${o.t}`; if (i === 0 && rnd() < 0.3) line += ' note: z'; });
    line += others[pick(3)];
    const text = `start: 2026-04-23\nmembers:\n- A\nFBS: F\n${line}\n- b mop: w\n${W_}`;
    const r = P.analyze(text);
    if (!r.ok) continue;
    const id = r.bySec.FBS.find((n) => n.name === 'a').id;
    const kind = pick(4);
    let list = olds.map((o) => o.t), keep = null;
    if (kind === 0 && list.length) { const drop = new Set(); for (let i = 0; i < list.length; i++) if (rnd() < 0.4) drop.add(i); keep = olds.filter((o, i) => !drop.has(i)); list = keep.map((o) => o.t); }
    else if (kind === 1) { const out = []; keep = []; for (const o of [...olds, null]) { if (rnd() < 0.4) { const t = `n${pick(9)}`; out.push(t); keep.push({ t, c: false }); } if (o) { out.push(o.t); keep.push(o); } } list = out; }
    else if (kind === 2 && list.length) { keep = [...olds]; for (let i = keep.length - 1; i > 0; i--) { const j = pick(i + 1); [keep[i], keep[j]] = [keep[j], keep[i]]; } list = keep.map((o) => o.t); }
    else { list = Array.from({ length: pick(5) }, () => `m${pick(6)}`); }
    tries++;
    const x = E.setAttr(r, id, 'mop', list);
    if (x.error) { ok(false, `書き換えを拒んだ: ${x.error} ${line} → ${list}`); continue; }
    wrote++;
    const r2 = P.analyze(x.text);
    const a2 = r2.bySec.FBS.find((n) => n.name === 'a');
    ok(r2.ok && a2.mops.join('|') === list.join('|'), `並びが違う: ${line} → ${list} → ${x.text.split('\n')[4]}`);
    // 同じ文が 2 つ以上あるときは、どちらを残したかを区別できないので、チェックは比べない
    if (keep && a2 && new Set(olds.map((o) => o.t)).size === olds.length) ok(a2.mopChecked.join('|') === keep.map((o) => o.c).join('|'), `チェックが変わった: ${line} → ${x.text.split('\n')[4]}`);
    ok(x.text.split('\n')[5] === '- b mop: w', 'ほかの行が変わった');
  }
  console.log(`MOP の欄の書き換え: 試行 ${tries}、書き込み ${wrote}`);
}
// ---- ガントチャートの期間の上限、休みを除いたタスクの長さ、修正依頼の文(仕様書 7.5 節・11.3 節・10 章)
{
  const g = (end, days) => P.render(P.analyze(`start: 2026-04-23\n${end ? `end: ${end}\n` : ''}members:\n- A\nWBS: X\n- a by: A days: ${days}\n`), 'gantt');
  const big = g('2126-04-23', 1);
  ok(big.svg === null && /36525 日あり、描ける長さ\(1096 日。約 3 年\)を超える/.test(big.message), `期間が長すぎるときの表示: ${big.message}`);
  ok(g(null, 1096).svg !== null && g(null, 1097).svg === null, '期間の上限の境目(1096 日は描き、1097 日は描かない)');
  ok(g('2029-04-22', 1).svg !== null && g('2029-04-23', 1).svg === null, 'end: による期間の上限の境目');
  // 2026-05-01 は金曜。土日が休み、担当者は 5/5 が休み
  const w = P.analyze('start: 2026-05-01\noff: sat, sun\nmembers:\n- A off: 2026-05-05\nWBS: X\n- a by: A days: 1\n');
  const t = task(w, 'a');
  ok(P.workUntil(w, t, 1000) === 1000 && P.workUntil(w, t, 3000) === 1000 && P.workUntil(w, t, 4000) === 2000 && P.workUntil(w, t, 3500) === 1500, '休みを除いた長さ(土日)');
  ok(P.workUntil(w, t, 5000) === 2000 && P.workUntil(w, t, 6000) === 3000 && P.workUntil(w, t, 6500) === 3500, '休みを除いた長さ(担当者の休み)');
  ok(P.workUntil(w, t, 500) === 500 && P.workUntil(w, t, -1000) === 0, '始まりより前・途中');
  ok(/data-gx="[\d.]+"/.test(P.render(w, 'gantt').svg), 'つまみに目盛りの左端の位置がない');
  const pr = P.toPrompt([], 'x');
  ok(['off:(その人の休み)', '// から行末までは注', '「* 」「+ 」で始まるリスト', '__init__.py'].every((k) => pr.includes(k)), '修正依頼の文の書き方の要点');
  ok(pr.includes('1 行目の「version: 日付」は保存した日で、アプリが書くので、そのまま残す'), '修正依頼の文の書き方の要点に version: がある');
}
// ---- 担当者別ガントチャート(仕様書 7.7 節)
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  const ld = P.peopleLoad(r);
  // 例: 期間は 2026-04-23 〜 end: 2026-05-14 の 22 日、休みなし
  ok(ld.nDays === 22 && ld.rows.map((x) => `${x.m.name}:${x.days}/${x.cap}`).join(' ') === '青木:8000/22 井上:8000/22 上田:16000/22', `例の作成の日数と作業できる日数: ${ld.rows.map((x) => `${x.m.name}:${x.days}/${x.cap}`).join(' ')}`);
  ok(ld.rows.every((x) => x.days === r.tasks.filter((k) => k.by.includes(x.m)).reduce((a, k) => a + k.days, 0)), '作成の日数がタスクの日数の合計と違う');
  const g = P.render(r, 'people', {}).svg;
  ok(g.includes('>36%<') && g.includes('>73%<') && g.includes('>16 日<'), '稼働率と日数の表示');
  ok(r.tasks.every((k) => (g.match(new RegExp(`data-id="${k.id}"`, 'g')) ?? []).length === k.by.length), 'タスクの棒が担当者の数だけない');
  ok(g === P.render(P.analyze(t), 'people', {}).svg, '担当者別ガントチャートが決定的でない');
  // 並べ替え: 作成の日数・稼働率の少ない順・多い順。同じなら書いた順
  const order = (sort) => [...P.render(r, 'people', { sort }).svg.matchAll(/data-id="m(\d+)"/g)].map((m) => +m[1]).join('');
  ok(order(null) === '012' && order({ key: 'days', dir: 'asc' }) === '012' && order({ key: 'days', dir: 'desc' }) === '201' && order({ key: 'rate', dir: 'desc' }) === '201', `並べ替え: ${order({ key: 'days', dir: 'desc' })}`);
  ok(P.render(r, 'people', { sort: { key: 'days', dir: 'desc' } }).svg.includes('作成の日数 ▼') && P.render(r, 'people', { sort: { key: 'rate', dir: 'asc' } }).svg.includes('稼働率 ▲'), '並べ替えの印');
  ok(order({ key: 'bad', dir: 'asc' }) === '012', '知らない並べ替えは書いた順');
  // 複数人のタスク・担当なし・本人の休み・稼働率 100% 超え
  const x = P.analyze('start: 2026-05-01\noff: sat, sun\nmembers:\n- A off: 2026-05-04..2026-05-06\n- B\n- C\nWBS: W\n- p by: A, B days: 2\n- q by: B days: 3\n- n days: 1\n- c by: C days: 1 review: A, B\n');
  const lx = P.peopleLoad(x);
  ok(lx.rows.map((k) => `${k.m.name}:${k.days}/${k.cap}/${k.review}`).join(' ') === 'A:2000/3/1 B:5000/6/1 C:1000/6/0', `複数人のタスク・本人の休み: ${lx.rows.map((k) => `${k.m.name}:${k.days}/${k.cap}/${k.review}`).join(' ')}`);
  ok(lx.none && lx.none.tasks.map((k) => k.name).join() === 'n' && lx.none.days === 1000, '担当なしの行');
  const gx = P.render(x, 'people', {}).svg;
  ok(gx.includes('>(担当なし)<') && gx.includes('>67%<') && gx.includes('>83%<') && gx.includes('>17%<') && gx.includes('fill="url(#hatch)"'), '担当なしの行・稼働率・本人の休みの斜線');
  ok([...gx.matchAll(/data-id="m(\d+)"/g)].length === 3, '担当なしの行は担当者として選べない');
  ok(P.render(P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: W\n- p by: A days: 1\n'), 'people', { today: '2026-04-25' }).svg.includes('<circle'), '遅れの印');
  ok(P.render(P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: W\n- p by: A days: 1097\n'), 'people').svg === null, '期間の上限');
}
// 担当者別ガントチャート: 横棒の最長は担当者の中で決める。作業できる日が 0 日の担当者は「―」で、並べ替えではいちばん少ない側
{
  const x = P.analyze('start: 2026-05-01\nmembers:\n- A\n- B off: mon, tue, wed, thu, fri, sat, sun\nWBS: W\n- p by: A days: 2\n- n days: 6\n');
  const g = P.render(x, 'people', {}).svg;
  const widths = [...g.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="12" fill="#666"\/>/g)].map((m) => +m[1]);
  ok(widths.length === 3 && widths[0] === 86 && widths[1] === 0 && widths[2] === 86, `横棒の長さ(担当なしの行は最長で止める): ${widths}`);
  const order = (sort) => [...P.render(x, 'people', { sort }).svg.matchAll(/data-id="m(\d+)"/g)].map((m) => +m[1]).join('');
  ok(P.peopleLoad(x).rows[1].rate === null && g.includes('>―<') && order({ key: 'rate', dir: 'asc' }) === '10' && order({ key: 'rate', dir: 'desc' }) === '01', '作業できる日が 0 日の担当者');
}
// ---- サマリー(仕様書 7.8 節)
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  const today = '2026-04-30', dn = Math.round(Date.UTC(2026, 3, 30) / 86400000);
  const g = P.render(r, 'summary', { today }).svg;
  ok(['>実行前<', '>5 件<', '>11 日<', '>7 日<', '>3 日<', '>15 件<', '>32 日<'].every((k) => g.includes(k)), '状態ごとの件数と日数');
  ok(g.includes('完了 34%(日数)、53%(件数)'), '完了の割合');
  // 今日までに終わる予定: 休みのない例なので、各タスクの [開始, 終わり] と [0, 今日の始まり] の重なりの合計
  const T = (dn - r.sched.start) * 1000;
  const plan = r.tasks.reduce((a, k) => a + Math.max(0, Math.min(k.f, T) - k.s), 0);
  ok(P.plannedByToday(r, dn) === plan && g.includes(`今日までに終わる予定: ${P.fmtDays(plan)} 日分`), `今日までに終わる予定: ${P.plannedByToday(r, dn)} / ${plan}`);
  const doneD = r.tasks.filter((k) => k.status === 'done').reduce((a, k) => a + k.days, 0);
  ok(g.includes(`予定より ${P.fmtDays(plan - doneD)} 日分遅れています`), '遅れの日数');
  const lates = r.tasks.filter((k) => k.status === 'blocked' || (k.status !== 'done' && dn > r.sched.start + k.d1));
  ok(lates.every((k) => g.includes(`data-id="${k.id}"`)) && (g.match(/data-id="n\d+"/g) ?? []).length === lates.length, '遅れと問題発生の表');
  ok(g.includes('チェック済み 3 / 7 件(43%)') && g.includes('警告はありません。'), 'MOP と警告');
  ok(r.members.every((m, i) => g.includes(`data-id="m${i}"`)), '担当者ごとの表');
  ok(g === P.render(P.analyze(t), 'summary', { today }).svg, 'サマリーが決定的でない');
  ok(P.render(r, 'summary', {}).svg.includes('今日の日付がないため、比べられません。'), '今日の日付がないとき');
  const bl = r.tasks.find((k) => k.status === 'blocked');
  ok(P.render(r, 'summary', { today: '2026-04-24' }).svg.includes(`data-id="${bl.id}"`) && P.render(r, 'summary', {}).svg.includes(`data-id="${bl.id}"`), '遅れていない問題発生のタスクも表に出す');
  ok(P.render(r, 'summary', { today: '2026-04-01' }).svg.includes('今日までに終わる予定: 0 日分') && P.render(r, 'summary', { today: '2026-12-01' }).svg.includes(`今日までに終わる予定: 32 日分`), '今日が期間の前と後');
  // 予定どおり・進んでいる
  const ahead = P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: W\n- a by: A days: 2 status: done\n- b by: A days: 2 after: a\n');
  ok(P.render(ahead, 'summary', { today: '2026-04-24' }).svg.includes('予定より 1 日分進んでいます') && P.render(ahead, 'summary', { today: '2026-04-25' }).svg.includes('予定どおりです'), '予定より進んでいる・予定どおり');
  // 休みのある計画: 今日までに終わる予定は休みの日を数えない
  const w = P.analyze('start: 2026-05-01\noff: sat, sun\nmembers:\n- A off: 2026-05-05\nWBS: W\n- a by: A days: 4\n');
  ok(P.plannedByToday(w, Math.round(Date.UTC(2026, 4, 6) / 86400000)) === 2000, `休みのある計画の今日までに終わる予定: ${P.plannedByToday(w, Math.round(Date.UTC(2026, 4, 6) / 86400000))}`);
  // 警告のある計画: 項目ごとの件数
  const x = P.analyze(fs.readFileSync(`${__dirname}/slide_excerpt.plan`, 'utf8'));
  const gx = P.render(x, 'summary', { today }).svg;
  const ws = x.diags.filter((d) => d.level === 'warn');
  ok(ws.length > 0 && gx.includes(`>${ws.length} 件<`) && ['C1', 'C2', 'C4'].every((c) => gx.includes(`${c}: `)) && !gx.includes('C3: '), '警告の件数の表');
  ok(!gx.includes('テスト項目(MOP)<') || gx.includes('MOP はまだ書かれていません。'), 'MOP のない FBS');
  ok(!P.render(P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: W\n- a by: A days: 1\n'), 'summary', { today }).svg.includes('テスト項目(MOP)'), 'FBS がないときは MOP を出さない');
  const nt = P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: W\n- a days: 1\n');
  ok(P.render(nt, 'summary', { today }).svg.includes('>(担当なし)<'), '担当なしの行');
  ok(P.render(P.analyze('start: 2026-04-23\nmembers:\n- A\nWBS: W\n'), 'summary', { today }).svg.includes('タスク 0 件'), 'タスクがない計画');
}
// ---- 印刷のページ(仕様書 9 章): 半分より小さくなるビューだけ分ける
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  ok(P.VIEWS.every((v) => { const ps = P.printPages(r, v.id, { today: '2026-04-30' }); return ps.length === 1 && ps[0] === P.render(r, v.id, { today: '2026-04-30' }).svg; }), '例は、どのビューも 1 ページで、画面の図と同じ');
  // 大きな計画: 7 つのフェーズ、各フェーズに 3 つのまとまり、各まとまりに 3 つのタスク
  let txt = 'start: 2026-05-20\nend: 2026-07-14\nmembers:\n' + Array.from({ length: 7 }, (_, i) => `- m${i}\n`).join('') + 'FBS: F\n';
  for (let i = 0; i < 8; i++) { txt += `- f${i}\n`; for (let j = 0; j < 4; j++) txt += `  - f${i}_${j} mop: 項目${i}_${j} mop*: 済${i}_${j}\n`; }
  txt += 'WBS: W\n';
  let k = 0;
  for (let i = 0; i < 7; i++) { txt += `- フェーズ${i}\n`; for (let j = 0; j < 3; j++) { txt += `  - まとまり${i}_${j}\n`; for (let q = 0; q < 3; q++) { txt += `    - 作業${i}_${j}_${q} days: 1 by: m${k % 7}${k ? ` after: 作業${Math.floor((k - 1) / 9)}_${Math.floor(((k - 1) % 9) / 3)}_${(k - 1) % 3}` : ''}\n`; k++; } } }
  const b = P.analyze(txt);
  ok(b.ok, `大きな計画にエラー: ${b.diags.filter((d) => d.level === 'error').map((d) => d.message)}`);
  const sc = (svg) => { const m = /width="(\d+)" height="(\d+)"/.exec(svg); return Math.min(1, 1047 / m[1], 718 / m[2]); };
  const ids = (svg) => [...svg.matchAll(/data-id="(n\d+)"/g)].map((m) => m[1]);
  // WBS の木: 分けたページで、タスクがちょうど 1 回ずつ出て、各ページは半分以上の大きさ
  const wp = P.printPages(b, 'wbs');
  const leafIds = b.tasks.map((x) => x.id);
  const seen = wp.flatMap((p) => ids(p).filter((id) => leafIds.includes(id)));
  ok(sc(P.render(b, 'wbs').svg) < 0.5 && wp.length > 1, `WBS の木を分けていない: ${wp.length}`);
  ok(seen.length === leafIds.length && new Set(seen).size === leafIds.length, `WBS のタスクが 1 回ずつ出ない: ${seen.length}/${leafIds.length}`);
  ok(wp.every((p) => sc(p) >= 0.5), `WBS の分けたページが半分より小さい: ${wp.map(sc)}`);
  ok(wp.every((p) => ids(p).includes(b.sec.WBS.root.id)), 'WBS の分けたページに根がない');
  // 役割分担: タスクの行が 1 回ずつ。担当者ごとのまとめは 1 回
  const rp = P.printPages(b, 'roles');
  const rs = rp.flatMap((p) => ids(p).filter((id) => leafIds.includes(id)));
  ok(sc(P.render(b, 'roles').svg) < 0.5 && rp.length > 1 && rs.length === leafIds.length && new Set(rs).size === leafIds.length, `役割分担の行: ${rp.length} ページ、${rs.length} 行`);
  ok(rp.filter((p) => p.includes('担当者ごとのまとめ')).length === 1 && rp.every((p) => sc(p) >= 0.5), '役割分担のまとめと大きさ');
  // アローダイアグラム: 矢印の図とタスクの表を分け、表の行が 1 回ずつ
  const ap = P.printPages(b, 'aoa');
  ok(ap.length >= 2 && !ap[0].includes('>管理番号<') && ap.slice(1).every((p) => p.includes('>管理番号<') && !p.includes('<circle')), 'アローダイアグラムの図と表を分ける');
  ok(P.printPortrait('aoa', 0) === false && P.printPortrait('aoa', 1) && P.printPortrait('summary', 0) && !P.printPortrait('roles', 1), '縦向きのページ(サマリーとアローダイアグラムのタスクの表)');
  ok(ap.slice(1).every((p) => { const m = /width="(\d+)" height="(\d+)"/.exec(p); return Math.min(1, 718 / m[1], 1047 / m[2]) === 1; }) && ap.slice(1, -1).every((p) => +/height="(\d+)"/.exec(p)[1] > 718), 'アローダイアグラムのタスクの表は縦向きの大きさで区切る');
  const at = ap.slice(1).flatMap((p) => [...p.matchAll(/<g data-id="(n\d+)"[^>]*><rect/g)].map((m) => m[1]));
  ok(at.length === leafIds.length && new Set(at).size === leafIds.length, `アローダイアグラムの表の行: ${at.length}`);
  // ガントチャート・担当者別: 行が 1 回ずつ。各ページは幅で決まる大きさ以上
  for (const v of ['gantt', 'people']) {
    const full = P.render(b, v, {}).svg, gp = P.printPages(b, v, {});
    const wsc = Math.min(1, 1047 / /width="(\d+)"/.exec(full)[1]);
    ok(gp.every((p) => sc(p) >= wsc - 1e-9), `${v} の分けたページが幅で決まる大きさより小さい`);
    if (v === 'gantt') { const gs = gp.flatMap((p) => [...p.matchAll(/<g data-id="(n\d+)"[^>]*><title>[^<]*<\/title><rect x="\d+(?:\.\d+)?" y="\d+(?:\.\d+)?" width="\d+(?:\.\d+)?" height="22"/g)].map((m) => m[1])); ok(new Set(gs).size === leafIds.length && gs.length === leafIds.length, `ガントチャートの行が 1 回ずつ出ない: ${gs.length}`); }
  }
  // MOP の表: 行が 1 回ずつ、件数の表示は全体
  const mp = P.printPages(b, 'mop');
  const boxes = mp.flatMap((p) => [...p.matchAll(/data-mop="([^"]+)"/g)].map((m) => m[1]));
  ok(boxes.length === 64 && new Set(boxes).size === 64 && mp.every((p) => p.includes('チェック済み 32 / 64 件')), `MOP の表の行: ${mp.length} ページ、${boxes.length} 行`);
  // 1 つのフェーズだけでも半分より小さくなるときは、その子ごとに分ける
  {
    let w = 'start: 2026-05-20\nmembers:\n- A\nWBS: W\n- 大きいフェーズ\n';
    for (let i = 0; i < 9; i++) { w += `  - 部分${i}\n`; for (let j = 0; j < 2; j++) { w += `    - 部分${i}_${j}\n`; for (let q = 0; q < 2; q++) w += `      - 作業${i}_${j}_${q} by: A days: 1\n`; } }
    w += '- 小さいフェーズ\n  - 作業z by: A days: 1\n';
    const c = P.analyze(w);
    const pages = P.printPages(c, 'wbs');
    const lv = c.tasks.map((x) => x.id);
    const got = pages.flatMap((p) => ids(p).filter((id) => lv.includes(id)));
    ok(pages.length > 2 && pages.every((p) => sc(p) >= 0.5) && got.length === lv.length && new Set(got).size === lv.length, `大きいフェーズを子ごとに分ける: ${pages.length} ページ、${pages.map(sc).map((x) => x.toFixed(2))}`);
  }
  // FBS の木も分ける(横に広い木)
  {
    let f = 'start: 2026-05-20\nmembers:\n- A\nFBS: F\n';
    for (let i = 0; i < 10; i++) { f += `- 機能${i}\n`; for (let j = 0; j < 3; j++) { f += `  - 機能${i}_${j}\n`; for (let q = 0; q < 2; q++) f += `    - 機能${i}_${j}_${q}\n`; } }
    const c = P.analyze(f + 'WBS: W\n- t by: A days: 1\n');
    const pages = P.printPages(c, 'fbs');
    const lv = c.bySec.FBS.filter((x) => !x.children.length).map((x) => x.id);
    const got = pages.flatMap((p) => ids(p).filter((id) => lv.includes(id)));
    ok(sc(P.render(c, 'fbs').svg) < 0.5 && pages.length > 1 && got.length === lv.length && new Set(got).size === lv.length && pages.every((p) => sc(p) >= 0.5), `FBS の木を分ける: ${pages.length} ページ`);
  }
  const fp = P.printPages(b, 'fbs');
  const fl = b.bySec.FBS.filter((x) => !x.children.length).map((x) => x.id);
  const fs2 = fp.flatMap((p) => ids(p).filter((id) => fl.includes(id)));
  ok(sc(P.render(b, 'fbs').svg) >= 0.5 ? fp.length === 1 : fs2.length === fl.length && new Set(fs2).size === fl.length, 'FBS の木の分け方');
}
// ---- version:(仕様書 4.1 節・9 章)
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r0 = P.analyze(t);
  const views = P.VIEWS.map((v) => v.id);
  // 版の行があっても、図(位置の属性を除く)と日程は同じ
  const tv = `version: 2026-01-01\n${t}`;
  const rv = P.analyze(tv);
  const strip = (svg) => svg.replace(/ data-(start|end)="\d+"/g, '');
  ok(rv.ok && rv.diags.length === r0.diags.length && rv.sched.spanDays === r0.sched.spanDays && rv.sched.finishDate === r0.sched.finishDate, 'version: があっても日程と診断は同じ');
  ok(views.every((v) => strip(P.render(rv, v).svg ?? '') === strip(P.render(r0, v).svg ?? '')), 'version: があっても図は同じ');
  // 読めない日付・2 回・字下げは構文エラー
  const e1 = P.analyze(`version: 2026-02-30\n${t}`);
  ok(!e1.ok && e1.diags.some((d) => d.level === 'error' && d.line === 1 && d.message.includes('2026-02-30')), 'version: の読めない日付はエラー');
  const e3 = P.analyze(`${t}  version: 2026-01-01\n`);
  ok(!e3.ok && e3.diags.some((d) => d.level === 'error' && d.message.includes('字下げせず')), 'version: の字下げはエラー');
  // setVersion: なければ 1 行目に足す。あれば書いてある場所のまま値だけ替える(注は残す)
  ok(P.setVersion(t, '2026-10-26') === `version: 2026-10-26\n${t}`, 'version: がなければ 1 行目に足す');
  ok(P.setVersion('version:\nstart: 2026-04-23\n', '2026-10-26') === 'version: 2026-10-26\nstart: 2026-04-23\n', '値のない version: に日付を入れる');
  ok(P.setVersion('', '2026-10-26') === 'version: 2026-10-26\n', '空のテキストにも足す');
  // stripVersion: 1 行目の version: の日付の部分だけを除く
  ok(P.stripVersion(tv) !== P.stripVersion(tv.replace('days: 1', 'days:  1')), '空白 1 つの違いも違いとみなす');
  ok(P.stripVersion('version: 2026-01-01\r\nstart: 2026-04-23\r\n') === 'version: \nstart: 2026-04-23\n', 'CRLF のテキストも読む');
}
// ---- version: は 1 行目にだけ書ける。比べるのは日付の部分だけを除いたテキスト(仕様書 3.3 節・9 章)
{
  const t = 'start: 2026-04-23\nmembers:\n- A\nWBS: W\n- t by: A days: 1\n';
  const vmsg = (r) => r.diags.find((d) => d.level === 'error' && d.message.startsWith('version: は 1 行目にだけ'));
  const r2 = P.analyze(`${t}version: 2026-01-01\n`);
  ok(!r2.ok && vmsg(r2)?.line === 6 && P.misplacedVersion(`${t}version: 2026-01-01\n`) === 6, '2 行目以降の version: はエラー');
  ok(vmsg(P.analyze(`  version: 2026-01-01\n${t}`))?.line === 1 && P.misplacedVersion(`  version: 2026-01-01\n${t}`) === 1, '字下げした 1 行目の version: はエラー');
  ok(vmsg(P.analyze(`　version: 2026-01-01\n${t}`))?.line === 1, '全角空白で字下げした version: はエラー');
  ok(vmsg(P.analyze(`　version: 2026-01-01\n${t}`))?.message.includes('全角空白'), '全角空白で字下げした version: の診断に全角空白と示す');
  ok(P.analyze(`// version: 1\n${t}`).ok && P.misplacedVersion(`// version: 1\n${t}`) === null, '注の中の version: は節の行ではない');
  const tn = t.replace('days: 1', 'days: 1 note: version: 2 を出す');
  ok(P.analyze(tn).ok && P.misplacedVersion(tn) === null && P.setVersion(tn, '2026-10-26') === `version: 2026-10-26\n${tn}`, 'note: の中の version: は触らない');
  ok(P.misplacedVersion(`version: 2026-01-01\n${t}`) === null && P.analyze(`version: 2026-01-01\n${t}`).ok, '1 行目の version: は正しい');
  const v2 = `version: 2026-01-01\n${t}version: 2026-01-02\n`;
  ok(!P.analyze(v2).ok && P.misplacedVersion(v2) === 7, '2 回書いた 2 つ目は正しくない場所');
  // 日付の部分だけを替える
  ok(P.setVersion(`version: 2025-12-31 // 初版\n${t}`, '2026-10-26') === `version: 2026-10-26 // 初版\n${t}`, '注を残して日付だけ替える');
  ok(P.setVersion(`version:\n${t}`, '2026-10-26') === `version: 2026-10-26\n${t}`, '値のない version: に日付を入れる(空白を足す)');
  ok(P.setVersion(`version:   \n${t}`, '2026-10-26') === `version: 2026-10-26   \n${t}`, '後ろの空白はそのまま残す');
  ok(P.setVersion(`version: 2025-01-01//x\n${t}`, '2026-10-26') === `version: 2026-10-26\n${t}`, '注にならない //x は値ごと替える');
  ok(P.setVersion(`version: 2025-01-01\r\n${t}`, '2026-10-26') === `version: 2026-10-26\n${t}`, 'CRLF のテキストにも日付を入れる');
  // 比べるのは日付の部分だけを除いたテキスト
  const sv = P.stripVersion;
  ok(sv(`version: 2026-01-01\n${t}`) === sv(`version: 2026-10-26\n${t}`), '日付だけの違いは同じとみなす');
  ok(sv(`version: 2026-01-01 // 初版\n${t}`) !== sv(`version: 2026-01-01 // 第2版\n${t}`), '注の違いは違いとみなす');
  ok(sv(`version: 2026-01-01\n${t}`) !== sv(t), 'version: の行の有無は違いとみなす');
  ok(sv(`version: abc\n${t}`) === sv(`version: 2026-01-01\n${t}`), '読めない日付も日付の部分として除く');
  ok(sv(`version: 2026-01-01\n${t}`) !== sv(`version: 2026-01-01\n${t.replace('days: 1', 'days:  1')}`), '空白 1 つの違いも違いとみなす(1 行目に version: があるとき)');
}
// ---- SVG の埋め込みと取り出し
{
  const t = fs.readFileSync(`${__dirname}/sample.plan`, 'utf8');
  const r = P.analyze(t);
  const s = P.embedSource(P.render(r, 'gantt').svg, t);
  const x = P.extractSource(s);
  ok(x.ok && x.text === t, 'SVG に埋め込んだテキストが元と一致しない');
}
// ---- 必要な節がないビュー
{
  const r = run('WBS: X\n- a by: A days: 1\n');
  ok(P.render(r, 'fbs').svg === null && /FBS:/.test(P.render(r, 'fbs').message), '節がないビューの表示');
}
console.log(`合格 ${pass} 件、不合格 ${fail} 件`);
process.exit(fail ? 1 : 0);
