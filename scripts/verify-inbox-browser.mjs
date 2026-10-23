import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

// Optional isolated Edge verification, separate from node --test.
const work=resolve('work/inbox-browser');mkdirSync(work,{recursive:true});
const sources=Object.fromEntries(['page-adapters','adapters/xiaohongshu','adapters/dom','auto-policy','inbox-policy','handoff-reasons','page-snapshot','reception','inbox'].map(name=>[name,readFileSync(`edge-extension/${name}.js`,'utf8')]));
const fixture=readFileSync('scripts/inbox-browser.fixture.js','utf8').split('(async()=>{')[0]+readFileSync('scripts/reception-browser.scenarios.js','utf8');
const html=`<!doctype html><meta charset="utf-8"><title>自动客服本地验收</title><style>body{font:16px sans-serif;background:#202126;color:white}.xhs-im-view{display:flex}.xhs-im-view__sidebar{width:250px}.xhs-im-chat-window{width:450px}.chat-item{margin:20px;white-space:pre-wrap}.xhs-im-input-bar-editor{height:40px;background:#444}.xhs-im-conv-item{padding:15px}</style><div id="app"></div><pre id="results">RUNNING</pre><script>const sources=${JSON.stringify(sources).replaceAll('<','\\u003c')};${fixture}</script>`;
const file=resolve(work,'fixture.html');writeFileSync(file,html);
const edge=process.env.EDGE_BINARY||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const run=spawnSync(edge,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${resolve(work,'profile')}`,'--window-size=1280,900',`--screenshot=${resolve(work,'panel.png')}`,'--virtual-time-budget=600000','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:60000,maxBuffer:5e6,windowsHide:true});
if(run.error)throw run.error;
writeFileSync(resolve(work,'result.html'),run.stdout||'');
const match=run.stdout?.match(/<pre id="results">([^<]+)<\/pre>/);
assert.ok(match,'Edge 未返回验收结果：'+run.status+' '+(run.stderr||'').slice(-2000));
const result=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&gt;','>').replaceAll('&lt;','<'));
writeFileSync(resolve(work,'result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));assert.equal(result.ok,true);
