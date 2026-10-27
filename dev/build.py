# index.html を組み立てる(開発用。アプリ本体には含めない)
import json, pathlib
d = pathlib.Path(__file__).parent      # dev/
root = d.parent                        # リポジトリのトップ(index.html を書く)
core = (d / 'core.js').read_text()
ui = (d / 'ui.js').read_text()
help_html = (d / 'help.html').read_text()
sample = (root / 'test' / 'sample.plan').read_text()
head = '''<!DOCTYPE html>
<!--
  プロジェクト計画 — FBS・PBS・WBS・役割分担・アローダイアグラム(クリティカルパス)・ガントチャート・担当者別ガントチャート・テスト項目(MOP)・サマリーを 1 つのテキストから作る単一 HTML ツール
  https://plan.sapp.jp

  MIT License
  Copyright (c) 2026 Kouta Sekine

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

  このファイルは外部ライブラリを使わず、データをどこにも送信しません。ネットワークなしで動きます。
-->
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>プロジェクト計画</title>
<style>
/* 配色・字体・ボタンの形・ダイアログ・ドラッグ・アンド・ドロップの表示・フッターは、SysML v2(sysmlv2.sapp.jp)・フローチャート(flow.sapp.jp)と同じ */
:root{
  --bg:#f4f4f2; --panel:#fff; --line:#d8d8d4; --text:#222; --accent:#8b1a2b; --err:#b00020; --sel:#fff3c4; --warn:#8a5a00;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{font-family:"Segoe UI","Hiragino Sans","Noto Sans JP","Yu Gothic UI",sans-serif;font-size:14px;color:var(--text);background:var(--bg);display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}
header h1{font-size:16px;margin:0 10px 0 0;font-weight:600}
header .sp{flex:1}
button,select,label.btn{font:inherit;padding:4px 10px;border:1px solid #bbb;border-radius:4px;background:#fafafa;cursor:pointer;color:var(--text)}
button:hover,label.btn:hover{background:#f0f0ee}
select{max-width:28em}
main{flex:1;display:flex;min-height:0}
#left{width:38%;min-width:260px;display:flex;flex-direction:column;border-right:1px solid var(--line);background:var(--panel)}
#splitter{width:6px;cursor:col-resize;background:var(--line)}
#right{flex:1;display:flex;flex-direction:column;min-width:0}
#editor{flex:1;position:relative;min-height:0}
textarea#src,#hl{position:absolute;inset:0;margin:0;border:0;padding:10px;font:13px/1.5 Consolas,"Courier New",monospace;tab-size:4;white-space:pre;overflow:auto;box-sizing:border-box;word-break:normal;overflow-wrap:normal}
textarea#src{resize:none;outline:none;background:transparent;color:transparent;caret-color:#222;z-index:1}
textarea#src::selection{background:rgba(139,26,43,.25);color:transparent}
#hl{pointer-events:none;color:#222;background:#fff;z-index:0}
#hl .kw{color:#8b1a2b;font-weight:600}#hl .nu{color:#1d4ed8}#hl .cm{color:#888}
#msg{padding:6px 10px;border-top:1px solid var(--line);font-size:13px;min-height:2.6em;max-height:16em;overflow:auto;background:#fcfcfa}
#msg .err{color:var(--err)}
#msg .ok{color:#2a6b2a}
#msg .warn{color:var(--warn)}
#msg .sec{font-weight:600;margin-top:4px}
#msg ul{margin:2px 0 4px;padding-left:1.4em}
#msg .bar{display:flex;gap:8px;align-items:center;justify-content:space-between}
#msg button{font-size:12px;padding:2px 8px}
#view{flex:1;overflow:auto;background:#fff;position:relative}
#view svg{display:block}
#view.stale svg{opacity:.45}
#view [data-id]{cursor:pointer}
#view .selected rect,#view .selected path:not([stroke="transparent"]),#view .selected circle{stroke:var(--accent);stroke-width:2.5}
#view .empty{padding:16px;color:#666}
#edit{border-top:1px solid var(--line);background:var(--panel);padding:8px 10px;display:none;max-height:45%;overflow:auto}
#edit.on{display:block}
#edit .row{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center;margin-bottom:6px}
#edit .form{display:flex;gap:6px 12px;flex-wrap:wrap;align-items:flex-end}
#edit label{display:flex;flex-direction:column;font-size:12px;color:#555;gap:2px}
#edit input,#edit textarea{font:13px Consolas,"Courier New","Hiragino Sans","Noto Sans JP",monospace;padding:3px 6px;border:1px solid #bbb;border-radius:3px;width:15em}
#edit textarea{width:24em;resize:vertical}
#edit .btns{display:flex;gap:6px;align-items:center}
#edit .editerr{color:var(--err);margin-bottom:6px}
#view [data-handle]{cursor:ew-resize}
#view [data-rel]{cursor:pointer}
#view [data-mop]{cursor:pointer}
#view [data-sort]{cursor:pointer}
#edit .kind{font-weight:600}
#edit .q{font:13px Consolas,"Courier New",monospace;color:#555}
#edit .note{background:var(--sel);padding:1px 6px;border-radius:3px}
dialog{border:1px solid #999;border-radius:6px;padding:16px 20px;max-width:760px;font-size:14px}
dialog h2{font-size:16px;margin:12px 0 8px}
dialog h2:first-child{margin-top:0}
dialog pre{background:#f6f6f2;padding:8px;overflow:auto;font-size:12px;margin:0}
dialog table{border-collapse:collapse;font-size:13px}
dialog td,dialog th{border:1px solid #ccc;padding:3px 8px;text-align:left;vertical-align:top}
dialog th,dialog td:nth-child(-n+2){white-space:nowrap}
dialog code{background:#f6f6f2;padding:0 3px}
#drop{position:absolute;inset:0;background:rgba(139,26,43,.08);border:3px dashed var(--accent);display:none;align-items:center;justify-content:center;font-size:20px;color:var(--accent);pointer-events:none}
#drop.on{display:flex}
.small{font-size:12px;color:#666}
#warn{color:var(--err);font-size:12px}
.fname{font-size:13px;color:#444;max-width:18em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stat{font-size:12px;color:#2a6b2a}
button:disabled{opacity:.5;cursor:default}
footer{font-size:11px;color:#777;padding:3px 10px;border-top:1px solid var(--line);background:var(--panel)}
footer a{color:#777}
/* 印刷 / PDF: 描けるビューを 1 ページに 1 つずつ。紙の大きさは印刷の画面で選ぶ(横向き。A4 が既定で、A3 なども選べる)。
   ページの余白は 0 にする(ブラウザが日時・題名・アドレス・ページ番号を書く場所をなくすため。シンプルスライドと同じ)。図の周りの空きは、ページの内側に取る */
#printArea{display:none}
@media print{
  @page{size:landscape;margin:0}
  /* サマリーと、分けたときのアローダイアグラムのタスクの表は縦向き(名前付きページ)。横向きのページの高さは、縦向きのページの幅(100vw)とそろえる。
     ページの大きさの基準(vw・vh)は最初のページ(縦向きのサマリー)で決まるため、そろえないと横向きの図がはみ出して白紙のページが挟まる */
  @page portrait{size:portrait;margin:0}
  #printArea .page[data-portrait]{page:portrait}
  #printArea .page:not([data-portrait]){height:calc(100vw - 1px)}
  html,body{height:auto;overflow:visible;display:block;background:#fff}
  body>*:not(#printArea){display:none!important}
  #printArea{display:block}
  #printArea .page{break-after:page;page-break-after:always;display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;height:calc(100vh - 1px);padding:10mm;overflow:hidden}
  #printArea .page:last-child{break-after:auto;page-break-after:auto}
  #printArea svg{max-width:100%;max-height:100%;width:auto;height:auto}
}
</style>
</head>
<body>
<header>
  <h1>プロジェクト計画</h1>
  <button id="btnNew">新規</button>
  <button id="btnOpen" title="テキスト(.plan・.txt)か、プロジェクト計画で保存した SVG を開く">開く</button><input type="file" id="fileOpen" accept=".plan,.txt,.svg" style="display:none">
  <button id="btnSave" title="開いているファイルに上書き保存(Ctrl+S。まだファイルがないときは保存先を選ぶ)">上書き保存</button>
  <button id="btnSaveAs" title="保存先とファイル名を選んでテキスト(.plan)を保存">別名で保存</button>
  <select id="exportImg" title="表示中のビューを画像で保存(SVG はテキストを埋め込むので、このアプリで開き直せる)">
    <option value="">画像…</option>
    <option value="svg" title="テキストを埋め込むので、このアプリで開き直せる">SVG</option>
    <option value="png">PNG</option>
  </select>
  <button id="btnPrint" title="描けるビューをすべて、1 ページに 1 つずつ印刷する(印刷の画面で「PDF に保存」を選ぶと PDF になる)">印刷 / PDF</button>
  <span id="fileName" class="fname"></span>
  <span id="stat" class="stat" role="status"></span>
  <label>ビュー <select id="viewKind"></select></label>
  <span id="warn" role="status"></span>
  <span class="sp"></span>
  <button id="btnSample">例を読み込む</button>
  <button id="btnHelp">書き方</button>
</header>
<main>
  <div id="left">
    <div id="editor"><pre id="hl" aria-hidden="true"></pre><textarea id="src" spellcheck="false" placeholder="ここにテキストを書くと、右に図が出ます。「例を読み込む」で例を、「書き方」で書き方を見られます。"></textarea></div>
    <div id="msg"></div>
  </div>
  <div id="splitter"></div>
  <div id="right">
    <div id="view"><div id="canvas"></div><div id="drop">ファイルを置くと開きます(.plan / .svg)</div></div>
    <div id="edit"></div>
  </div>
</main>
<footer>プロジェクト計画 — データはどこにも送信されません。MIT License, Copyright (c) 2026 Kouta Sekine. <a href="https://sapp.jp" target="_blank" rel="noopener">S Apps</a></footer>

<dialog id="dlgHelp"></dialog>
<div id="printArea"></div>
<script>
'''
js_consts = 'const SAMPLE_TEXT = ' + json.dumps(sample, ensure_ascii=False) + ';\nconst HELP_HTML = ' + json.dumps(help_html, ensure_ascii=False) + ';\n'
out = head + core + '\n' + js_consts + ui + '</script>\n</body>\n</html>\n'
assert '</script' not in (core + js_consts + ui).replace('<\\/script', '')
(root / 'index.html').write_text(out)
print('index.html', len(out.encode()), 'bytes')
