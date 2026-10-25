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
  ok(r.tasks.filter((x) => x.crit).map((x) => x.num).join(' ') === '1.2.1 2.2.1 3.2.1 3.2.4', `例のクリティカルパスの作業: ${r.tasks.filter((x) => x.crit).map((x) => x.num)}`);
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
  ok(r.tasks.filter((x) => x.crit).map((x) => x.num).join(' ') === '1.2.1 2.2.1 3.2.1 3.2.2', 'クリティカルパスの作業がスライドと違う');
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
  // 同じ人の 2 作業: 余裕の少ない方(最遅開始の早い方)が先
  const r = run('WBS: X\n- a by: A days: 2\n- b by: A days: 3\n');
  ok(r.cp.T === 3000 && task(r, 'b').s === 0 && task(r, 'a').s === 3000 && r.sched.spanDays === 5, `資源の重なり: b ${task(r, 'b').s} a ${task(r, 'a').s}`);
  // 同じ余裕なら書いた順
  const r2 = run('WBS: X\n- a by: A days: 2\n- b by: A days: 2\n');
  ok(task(r2, 'a').s === 0 && task(r2, 'b').s === 2000, '同じ余裕で書いた順にならない');
  // 小数と個人の休み: 2026-04-23 は木曜。A は金曜休み → 1.5 日の作業は 木 1 日 + 土 0.5 日
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
  // 0 日の作業
  const r8 = run('WBS: X\n- a by: A days: 2\n- m by: A days: 0 after: a\n');
  ok(r8.ok && task(r8, 'm').s === 2000 && task(r8, 'm').f === 2000, '0 日の作業');
  ok(warns(r8).some((d) => /days: が 0 です/.test(d.message)), 'days: 0 の警告が出ない');
  // 日数 0 の作業は、休みに当たっても送らず、前の作業の終わった日に属させる。日程の長さと end: の判定を延ばさない
  const r9 = run('end: 2026-04-24\nWBS: X\n- a by: A days: 2\n- m by: A days: 0 after: a\n- n by: A after: a\n', 'start: 2026-04-23\noff: 2026-04-25..2026-04-27\nmembers:\n- A\n');
  ok(r9.ok && task(r9, 'm').s === 2000 && task(r9, 'n').s === 2000 && task(r9, 'm').d1 === 1 && task(r9, 'n').d1 === 1, `日数 0 の作業の日: m ${task(r9, 'm').s} n ${task(r9, 'n').s} d1 ${task(r9, 'm').d1}`);
  ok(r9.sched.spanDays === 2 && !warns(r9).some((d) => /超えています/.test(d.message)), `日数 0 の作業が日程を延ばした: span ${r9.sched.spanDays}`);
  const r10 = run('WBS: X\n- m by: A days: 0\n');
  ok(r10.ok && task(r10, 'm').d0 === 0 && task(r10, 'm').d1 === 0 && r10.sched.spanDays === 1, '先行のない日数 0 の作業は 1 日目');
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
  ok(r.ok && r.sched.spanDays === 36500, '36500 日の作業が計算できない');
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
  // アローダイアグラム: 作業 q の終わりの事象から作業 t の始まりの事象へ道がある ⇔ q が t の先行(推移的)
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
