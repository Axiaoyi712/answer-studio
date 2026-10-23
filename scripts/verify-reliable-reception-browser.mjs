import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

// Separate Edge profile and synthetic local chat. No real messages or model calls.
const work=resolve('work/reliability-0.13.4/browser');mkdirSync(work,{recursive:true});
const sources=Object.fromEntries(['page-adapters','adapters/xiaohongshu','adapters/dom','auto-policy','inbox-policy','handoff-reasons','page-snapshot','reception','inbox'].map(n=>[n,readFileSync(`edge-extension/${n}.js`,'utf8')]));
const fixture=readFileSync('scripts/inbox-browser.fixture.js','utf8').split('(async()=>{')[0]+readFileSync('scripts/reception-browser.scenarios.js','utf8').split('(async()=>{')[0];
const scenario=`(async()=>{try{
 const originalRender=render;render=()=>{originalRender();for(const m of messages[current]||[])if(m.testStatus){const node=document.querySelector('[data-message-id="'+m.messageId+'"]'),status=document.createElement('span');status.className=m.testStatus==='failed'?'chat-item__status-btn--failed':'chat-item__status-loading';node?.append(status);}};
 for(const n of ['page-adapters','adapters/xiaohongshu','adapters/dom','auto-policy','inbox-policy','handoff-reasons','reception'])new Function(sources[n])();
 for(const state of ['failed','pending']){
  for(const key of Object.keys(storage))delete storage[key];for(const id of ['a','b','c'])messages[id]=[];
  const u='user-'+state,own='own-'+state;
  messages.a=[{uuid:u,messageId:u,senderId:'visitor',contentType:1,text:'旧的价格问题',timestamp:Date.now()},{uuid:own,messageId:own,senderId:'me',contentType:1,text:'尚未确认的旧回复',timestamp:Date.now(),testStatus:state}];selected('a');
  const before=snapshot(fakeLocation);check(before.messages.at(-1)[state]===true,'读取已有'+state+'气泡');
  messages.a.at(-1).testStatus=state==='failed'?'pending':'failed';render();check(before.signature!==snapshot(fakeLocation).signature,'发送状态变化使旧页面快照失效：'+state);messages.a.at(-1).testStatus=state;render();
  new Function('location',sources.inbox)(fakeLocation);await sleep(300);const n=count(),r=requests;panel.getElementById('daily').click();
  await until(()=>storage[ckey('a')]?.state==='uncertain','已有发送待核对');
  check(count()===n&&requests===r&&storage[ckey('a')].manualPending.includes(u)&&storage[ZhidaReception.taskKey('me','a')].state==='uncertain','已有'+state+'回复进入核对待办，不漏记完成、不调用模型或重发');
  incoming('c','其他客户正常问题');await until(()=>count()===n+1,'其他客户继续');check(isRunning()&&storage[ckey('a')].state==='uncertain','已有'+state+'问题不阻塞其他客户');
  await pause();globalThis.__zhidaAutoClose();selected('a');new Function('location',sources.inbox)(fakeLocation);await sleep(300);panel.getElementById('daily').click();await sleep(5000);
  check(count()===n+1&&storage[ckey('a')].state==='uncertain','重开后保留'+state+'核对待办，不自动重试');
  await resume('a');check(storage[ckey('a')].handled.includes(u),'人工核对后跳过'+state+'原待办');
  incoming('a','核对后的新问题');await until(()=>count()===n+2,'恢复后接新问题');check(!questionCalls.at(-1).includes('旧的价格问题'),'恢复'+state+'后只回答新问题');await pause();globalThis.__zhidaAutoClose();
 }
 for(const key of Object.keys(storage))delete storage[key];for(const id of ['a','b','c'])messages[id]=[];selected('a');new Function('location',sources.inbox)(fakeLocation);await sleep(300);
 let n=count();customReply={action:'clarify',clarification:false,answer:'我在，想了解什么？',sources:[],engine:'rules'};incoming('a','你好');panel.getElementById('daily').click();await until(()=>count()===n+1,'问候');
 for(const text of ['谢谢','你好','你怎么啦']){n=count();incoming('a',text);await until(()=>count()===n+1,'普通接话');}
 check(storage[ckey('a')].state==='active'&&storage[ckey('a')].clarifications===0,'多轮问候致谢和普通模型接话不触发追问上限');
 customReply={action:'clarify',clarification:true,answer:'你想要哪一款？',sources:[],engine:'deepseek'};
 for(let i=1;i<=2;i++){n=count();incoming('a','信息仍不全'+i);await until(()=>count()===n+1,'真实追问');check(storage[ckey('a')].clarifications===i,'真实追问成功回显后累计 '+i);}
 incoming('a','仍未说明型号');await until(()=>storage[ckey('a')]?.reasonCode==='clarification-limit','真实追问上限');check(storage[ckey('a')].state==='handoff','真实连续追问仍有上限，进入人工待办');
 await resume('a');await pause();globalThis.__zhidaAutoClose();storage[ckey('a')].clarifications=2;storage[ckey('a')].clarifiedAt=Date.now()-1800001;selected('a');new Function('location',sources.inbox)(fakeLocation);await sleep(300);
 n=count();incoming('a','隔天新咨询');panel.getElementById('daily').click();await until(()=>count()===n+1,'空闲后重新计数');check(storage[ckey('a')].state==='active'&&storage[ckey('a')].clarifications===1,'半小时以上的新咨询不沿用旧追问上限');
 await pause();globalThis.__zhidaAutoClose();document.getElementById('results').textContent=JSON.stringify({ok:true,checks,sendCount,requests});
}catch(e){document.getElementById('results').textContent=JSON.stringify({ok:false,error:e.message,checks,log:panel?.getElementById('log').textContent,storage});}})();`;
const file=resolve(work,'fixture.html');writeFileSync(file,'<!doctype html><meta charset="utf-8"><div id="app"></div><pre id="results">RUNNING</pre><script>const sources='+JSON.stringify(sources).replaceAll('<','\\u003c')+';'+fixture+scenario+'</script>');
const edge=process.env.EDGE_BINARY||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const run=spawnSync(edge,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+resolve(work,'profile'),'--window-size=1280,900','--virtual-time-budget=360000','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:60000,maxBuffer:5e6,windowsHide:true});
if(run.error)throw run.error;
writeFileSync(resolve(work,'result.html'),run.stdout||'');
const match=run.stdout?.match(/<pre id="results">([^<]+)<\/pre>/);assert.ok(match,'Edge没有返回验收结果：'+run.status+' '+(run.stderr||'').slice(-1000));
const result=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&gt;','>').replaceAll('&lt;','<'));writeFileSync(resolve(work,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));assert.equal(result.ok,true);
