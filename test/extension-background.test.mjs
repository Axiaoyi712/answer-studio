import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function harness(fetchError){
 let snapshot={account:'test-account'},scriptError=false;
 let listener,windowRemoved,alarmListener,clickListener,calls=[],scripts=[],badges=[],messages=[],activated=[],notifications=[];const storage={bridgeToken:'test-only'},url='https://www.xiaohongshu.com/chat/test123';
 const snapshots=new Map(),tabs=new Map();const tab={id:7,url,active:true,windowId:1},windows=new Map([[1,{id:1,focused:true}]]),opened=[];
 const chrome={runtime:{id:'extension',getURL:p=>'chrome-extension://extension/'+p,onMessage:{addListener:f=>listener=f}},storage:{session:{get:async k=>k===null?{...storage}:{[k]:storage[k]},set:async o=>Object.assign(storage,o),remove:async k=>delete storage[k]}},tabs:{get:async id=>{const t=tabs.get(id)||tab;if(t.closed)throw new Error('closed');return t;},update:async(id,options)=>{activated.push({id,...options});tab.active=options.active;return tab;},sendMessage:async(id,message,options)=>{messages.push({id,message,options});return {ok:true};},onRemoved:{addListener:()=>{}}}};
 chrome.storage.local={get:async k=>k===null?{...storage}:{[k]:storage[k]},set:async o=>Object.assign(storage,o),remove:async k=>delete storage[k]};
 const alarms=new Map();chrome.alarms={create:async(k,o)=>alarms.set(k,o),clear:async k=>alarms.delete(k),onAlarm:{addListener:f=>alarmListener=f}};
 chrome.notifications={getPermissionLevel:async()=> 'granted',create:async(id,options)=>notifications.push({id,options}),clear:async()=>{},onClicked:{addListener:f=>clickListener=f}};
 chrome.scripting={executeScript:async options=>{scripts.push(options);if(scriptError)throw Error('模拟脚本注入失败');return [{result:snapshots.get(options.target.tabId)||snapshot}];}};
 chrome.action={setBadgeText:async options=>badges.push(options),setBadgeBackgroundColor:async()=>{}};
 chrome.windows={get:async id=>{if(!windows.has(id))throw new Error('closed');return windows.get(id);},create:async options=>{opened.push(options);for(const win of windows.values())win.focused=false;const win={id:Math.max(...windows.keys(),0)+1,focused:true};windows.set(win.id,win);return win;},update:async id=>{if(!windows.has(id))throw new Error('closed');for(const win of windows.values())win.focused=win.id===id;return windows.get(id);},onRemoved:{addListener:f=>windowRemoved=f}};
 const context=vm.createContext({chrome,URL,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});if(fetchError)throw fetchError;return {ok:true,json:async()=>({answer:'ok',configured:true})};}});context.importScripts=(...paths)=>paths.forEach(path=>vm.runInContext(readFileSync('edge-extension/'+path,'utf8'),context));vm.runInContext(readFileSync('edge-extension/background.js','utf8'),context);
 const send=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
 return {setScriptError:value=>{scriptError=value;},addTab:t=>{tabs.set(t.id,t);windows.set(t.windowId,{id:t.windowId,focused:false});},setSnapshotFor:(id,value)=>snapshots.set(id,value),get reads(){return scripts.filter(s=>s.func&&s.args?.[0]?.type);},setSnapshot:value=>{snapshot=value;},send,tab,calls,scripts,badges,windows,opened,messages,activated,storage,notifications,alarms,fireAlarm:async name=>alarmListener({name}),clickNotice:async id=>clickListener(id),closeWindow:async id=>{windows.delete(id);await windowRemoved(id);},popup:{id:'extension',url:chrome.runtime.getURL('popup.html')},content:{id:'extension',url,frameId:0,tab:{id:7,windowId:1}}};
}

test('新待办通知一次，五分钟仅再提醒一次，点击通知展开正确客服',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 const msg={action:'notify',bindingId,account:'a',conversation:'c'};
 assert.equal((await h.send(msg,h.content)).data.notified,true);await h.send(msg,h.content);assert.equal(h.notifications.length,1);
 const id=h.notifications[0].id;await h.fireAlarm(id);await h.fireAlarm(id);assert.equal(h.notifications.length,2);
 await h.clickNotice(id);assert.equal(h.messages.at(-1).message.action,'showReception');assert.equal(h.messages.at(-1).message.bindingId,bindingId);
 await h.send({action:'completeCase',bindingId,account:'a',conversation:'c'},h.content);assert.equal(h.alarms.size,0);await h.fireAlarm(id);assert.equal(h.notifications.length,2);
});
test('独立后台闹钟发现页面心跳停滞，重复故障只提醒一次，恢复后可再次提醒',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 await h.send({action:'runState',bindingId,account:'test-account',desired:true},h.content);
 await h.send({action:'heartbeat',bindingId,account:'test-account',running:true,lastRead:Date.now(),pending:0,failures:0},h.content);
 assert.ok(h.alarms.has('zhida-watchdog'));h.storage.receptionHealth.seen-=121000;
 await h.fireAlarm('zhida-watchdog');assert.equal(h.notifications.length,1);assert.match(h.notifications[0].options.message,/心跳/);
 await h.fireAlarm('zhida-watchdog');assert.equal(h.notifications.length,1);
 h.storage.receptionHealth.seen=Date.now();h.storage.receptionHealth.lastRead=Date.now();await h.fireAlarm('zhida-watchdog');assert.equal(h.storage.watchdogFault,undefined);
 h.storage.receptionHealth.failures=3;await h.fireAlarm('zhida-watchdog');assert.equal(h.notifications.length,2);assert.match(h.notifications[1].options.message,/连续失败/);
 await h.send({action:'runState',bindingId,account:'test-account',desired:false},h.content);await h.fireAlarm('zhida-watchdog');assert.equal(h.notifications.length,2);
});
test('心跳和发送前知识核实仅允许当前绑定业务，过期面板和子框架不可调用',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 for(const action of ['heartbeat','validate-reply','archive-local']){
   assert.ok((await h.send({action,bindingId:'old'},h.content)).error);
   assert.ok((await h.send({action,bindingId},{...h.content,frameId:1})).error);
   await h.send({action,bindingId,space:'forged',account:'test-account',running:true},h.content);
   assert.equal(JSON.parse(h.calls.at(-1).options.body).space,'s');
 }
});
test('开始人工处理后取消重复提醒，通知与运行设置拒绝旧绑定',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 await h.send({action:'notify',bindingId,account:'a',conversation:'c'},h.content);await h.send({action:'openHandoff',bindingId,conversation:'c'},h.content);await h.fireAlarm(h.notifications[0].id);assert.equal(h.notifications.length,1);
 assert.ok((await h.send({action:'runState',bindingId:'old',account:'test-account',desired:true},h.content)).error);
 assert.ok((await h.send({action:'runState',bindingId,account:'another-account',desired:true},h.content)).error);
 await h.send({action:'runState',bindingId,account:'test-account',desired:true},h.content);assert.equal(h.storage.receptionSession.desired,true);
 await h.send({action:'runState',bindingId,account:'test-account',desired:false},h.content);assert.equal(h.storage.receptionSession.desired,false);
});
test('重启只恢复先前正在接待的同账号业务，暂停或账号变化不启动',async()=>{
 const h=harness();const message={action:'restoreReception',pageUrl:h.tab.url};
 assert.equal((await h.send(message,h.content)).data.disabled,true);
 h.storage.receptionSession={desired:true,space:'s',account:'wrong'};assert.equal((await h.send(message,h.content)).data.disabled,true);
 h.storage.receptionSession={desired:true,space:'s',account:'test-account'};
 assert.equal((await h.send(message,h.content)).data.restored,true);assert.equal(h.storage['watch:7'].space,'s');assert.ok(h.scripts.some(s=>s.files?.includes('reception.js')));assert.equal(h.scripts.at(-2).args[1],true);
 h.storage.receptionSession.desired=false;assert.equal((await h.send(message,h.content)).data.disabled,true);
});

test('平台限制终止自动恢复，清除工作意图，不注入接待或反复检查',async()=>{
 const h=harness();h.storage.receptionSession={desired:true,space:'s',account:'test-account'};
 h.setSnapshot({code:'platform-restricted',error:'平台显示限制访问'});
 const result=await h.send({action:'restoreReception',pageUrl:h.tab.url},h.content);
 assert.equal(result.data.restricted,true);assert.equal(h.storage.receptionSession.desired,false);
 const reads=h.scripts.length;assert.equal(h.reads.length,1);assert.ok(!h.scripts.some(s=>s.files?.includes('inbox.js')));assert.equal(h.calls.length,0);
 await h.send({action:'restoreReception',pageUrl:h.tab.url},h.content);assert.equal(h.scripts.length,reads);
});

test('运行面板发现限制后清除对应业务的恢复意图',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 h.storage.receptionSession={desired:true,space:'s',account:'test-account'};
 h.setSnapshot({code:'platform-restricted',error:'平台显示限制访问'});
 const result=await h.send({action:'pageSnapshot',bindingId,pageUrl:h.tab.url},h.content);
 assert.equal(result.data.code,'platform-restricted');assert.equal(h.storage.receptionSession.desired,false);
});

test('关闭绑定人工窗口自动返回原客服并发送定向恢复信号，不调用模型或导航聊天',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 await h.send({action:'openHandoff',bindingId,conversation:'finished-customer'},h.content);
 await h.closeWindow(999);assert.equal(h.messages.length,0);
 await h.closeWindow(2);
 assert.equal(h.windows.get(1).focused,true);assert.equal(h.activated[0].id,7);
 assert.equal(h.messages.length,1);assert.equal(h.messages[0].id,7);assert.equal(h.messages[0].options.frameId,0);
 assert.equal(h.messages[0].message.action,'finishHandoff');assert.equal(h.messages[0].message.conversation,'finished-customer');assert.equal(h.messages[0].message.bindingId,bindingId);
 assert.equal(h.tab.url,h.content.url);assert.equal(h.calls.length,0);assert.equal(h.reads.length,0);
});

test('过期人工窗口或已关闭的原客服不会触发恢复或重新创建窗口',async()=>{
 const h=harness(),first=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 await h.send({action:'openHandoff',bindingId:first.bindingId,conversation:'old'},h.content);
 const second=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 await h.closeWindow(2);assert.equal(h.messages.length,0);assert.equal(h.activated.length,0);
 await h.send({action:'openHandoff',bindingId:second.bindingId,conversation:'new'},h.content);
 h.tab.closed=true;await h.closeWindow(2);assert.equal(h.messages.length,0);assert.equal(h.activated.length,0);assert.equal(h.opened.length,2);
});

test('人工会话只在独立窗口打开，不导航或注入自动客服标签页，重复点击复用窗口',async()=>{
 const h=harness(),{bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 const message={action:'openHandoff',bindingId,conversation:'customer-1'};
 assert.ok((await h.send({...message,bindingId:'stale'},h.content)).error);
 assert.ok((await h.send({...message,conversation:'https://evil.example'},h.content)).error);
 assert.ok((await h.send(message,{...h.content,frameId:1})).error);assert.equal(h.opened.length,0);
 assert.equal((await h.send(message,h.content)).data.manualWindowOpen,true);
 assert.deepEqual(JSON.parse(JSON.stringify(h.opened[0])),{url:'https://www.xiaohongshu.com/chat/customer-1',type:'normal',width:1000,height:800,focused:true});
 assert.equal(h.tab.url,h.content.url);assert.equal(h.calls.length,0);assert.equal(h.reads.length,0);
 await h.send(message,h.content);assert.equal(h.opened.length,1);
 assert.equal((await h.send({action:'pageSnapshot'},h.content)).data.account,'test-account');
 assert.equal(h.reads[0].target.tabId,7);
 h.windows.get(2).focused=false;
 assert.ok((await h.send({action:'pageSnapshot'},h.content)).data);
 h.windows.get(1).focused=true;
 assert.equal((await h.send({action:'pageSnapshot'},h.content)).data.account,'test-account');
 h.windows.delete(2);await h.send(message,h.content);assert.equal(h.opened.length,2);
 h.tab.active=false;assert.ok((await h.send({action:'pageSnapshot'},h.content)).data);
});
test('SPA切换保留旧sender.url时以当前路由校验，但不放行过期或外站请求',async()=>{
 const h=harness();await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup);
 h.tab.url='https://www.xiaohongshu.com/chat/new-person';
 const request={action:'pageSnapshot',pageUrl:h.tab.url};
 assert.ok((await h.send(request,h.content)).data);
 assert.ok((await h.send({...request,action:'draft',question:'你好'},h.content)).data);
 assert.equal(h.reads.length,1);assert.equal(h.calls.length,1);
 assert.ok((await h.send({...request,pageUrl:h.content.url},h.content)).error);
 assert.ok((await h.send(request,{...h.content,url:'https://evil.example/chat/a'})).error);
 h.tab.active=false;assert.ok((await h.send(request,h.content)).data);
 assert.ok((await h.send({...request,action:'draft',question:'后台提问'},h.content)).data);
 assert.equal(h.reads.length,2);assert.equal(h.calls.length,2);assert.equal(h.reads[1].target.tabId,7);
});
test('旧面板关闭不解除新绑定，当前面板关闭后释放标签页',async()=>{
 const h=harness();const first=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 const second=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 assert.equal((await h.send({action:'disarm',bindingId:first.bindingId},h.content)).data.ok,false);
 assert.ok((await h.send({action:'pageSnapshot'},h.content)).data);
 assert.equal((await h.send({action:'disarm',bindingId:second.bindingId},h.content)).data.ok,true);
 assert.ok((await h.send({action:'pageSnapshot'},h.content)).error);
 h.tab.id=8;assert.ok((await h.send({action:'arm',tab:8,space:'s',mode:'auto'},h.popup)).data.ok);
});
test('人工角标仅限当前绑定，显示数量并在清空后消失，不调用模型',async()=>{
 const h=harness();const {bindingId}=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 const message={action:'handoffBadge',bindingId,count:2};
 assert.ok((await h.send({...message,bindingId:'stale'},h.content)).error);
 assert.ok((await h.send({...message,count:-1},h.content)).error);
 assert.ok((await h.send(message,{...h.content,frameId:1})).error);
 assert.equal(h.badges.length,0);
 assert.ok((await h.send(message,h.content)).data.ok);
 assert.equal(h.badges[0].text,'2');assert.equal(h.badges[0].tabId,7);
 assert.ok((await h.send({...message,count:0},h.content)).data.ok);
 assert.equal(h.badges[1].text,'');assert.equal(h.calls.length,0);
});
test('自动客服必须由弹窗绑定，内容脚本不能替换业务或URL',async()=>{
 const h=harness();
 assert.ok((await h.send({action:'draft',question:'hello'},h.content)).error);
 assert.equal(h.calls.length,0);
 await h.send({action:'arm',tab:7,space:'approved-space',mode:'auto'},h.popup);
 await h.send({action:'draft',space:'different-space',question:'hello',url:'https://evil.example'},h.content);
 assert.equal(h.calls[0].url,'http://127.0.0.1:3080/api/bridge/draft');
 assert.equal(JSON.parse(h.calls[0].options.body).space,'approved-space');
 h.tab.url='https://www.xiaohongshu.com/chat/other';
 assert.ok((await h.send({action:'draft',question:'hello'},h.content)).error);
 assert.equal(h.calls.length,1);
});
test('自动客服可在后台检查，仍只操作绑定标签页的主框架',async()=>{
 const h=harness();h.tab.url='https://www.xiaohongshu.com/chat';
 const sender={...h.content,url:h.tab.url};
 assert.ok((await h.send({action:'pageSnapshot'},sender)).error);
 assert.ok((await h.send({action:'arm',tab:7,space:'s'},h.popup)).error);
 assert.ok((await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data.ok);
 assert.equal((await h.send({action:'pageSnapshot'},sender)).data.account,'test-account');
 assert.equal(h.reads[0].world,'MAIN');assert.equal(h.reads[0].args[0].type,'xiaohongshu');
 assert.ok((await h.send({action:'pageSnapshot'},{...sender,frameId:1})).error);
 h.tab.active=false;assert.ok((await h.send({action:'pageSnapshot'},sender)).data);
 h.tab.active=true;h.tab.url='https://www.xiaohongshu.com/explore';
 assert.ok((await h.send({action:'pageSnapshot'},{...sender,url:h.tab.url})).error);
 assert.equal(h.reads.length,2);assert.equal(h.calls.length,0);
});
test('旧监听绑定和弹窗手动草稿已移除，子frame及业务列表调用仍阻断',async()=>{
 const h=harness();assert.ok((await h.send({action:'arm',tab:7,space:'s'},h.popup)).error);
 assert.ok((await h.send({action:'arm',tab:7,space:'s',mode:'draft'},h.popup)).error);
 assert.ok((await h.send({action:'draft',space:'s',question:'hello'},h.popup)).error);
 await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup);
 assert.ok((await h.send({action:'spaces'},h.content)).error);
 assert.ok((await h.send({action:'draft',question:'hello'},{...h.content,frameId:1})).error);
 h.storage['watch:7'].mode='draft';assert.ok((await h.send({action:'draft',question:'hello'},h.content)).error);assert.equal(h.calls.length,0);
});
test('连接失败与超时提供明确中文提示',async()=>{
 const offline=harness(new TypeError('Failed to fetch'));
 assert.match((await offline.send({action:'spaces'},offline.popup)).error,/start.cmd/);
 const timeout=harness(Object.assign(new Error('timeout'),{name:'TimeoutError'}));
 assert.match((await timeout.send({action:'spaces'},timeout.popup)).error,/请求超时/);
});
test('只有显式自动模式允许同一小红书标签页切会话，且保留业务绑定',async()=>{
 const h=harness();await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup);
 h.tab.url='https://www.xiaohongshu.com/chat/next';
 await h.send({action:'draft',space:'wrong',question:'追问',history:[{role:'user',content:'前文'}]},{...h.content,url:h.tab.url});
 assert.equal(h.calls.length,1);const body=JSON.parse(h.calls[0].options.body);assert.equal(body.space,'s');assert.equal(body.history[0].content,'前文');
 h.tab.url='https://evil.example/chat/next';
 assert.ok((await h.send({action:'draft',question:'hello'},{...h.content,url:h.tab.url})).error);assert.equal(h.calls.length,1);
});


test('两个网页适配同时绑定，一个页面受限或停止不撤销另一个页面的接待',async()=>{
 const h=harness(),xhs=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 await h.send({action:'runState',bindingId:xhs.bindingId,account:'test-account',desired:true},h.content);
 const profile={...JSON.parse(readFileSync('edge-extension/profiles/web-chat-demo.json','utf8')),origin:'https://support.example',pathPrefix:'/chat',conversationPath:'/chat/{id}'};
 assert.equal((await h.send({action:'saveProfile',profile},h.popup)).data.id,'web-demo');
 const tab={id:8,url:'https://support.example/chat/a',windowId:3};h.addTab(tab);h.setSnapshotFor(8,{account:'web-demo:test-account'});
 const generic=(await h.send({action:'arm',tab:8,space:'s',mode:'auto',profileId:'web-demo'},h.popup)).data;
 assert.ok(generic?.bindingId);assert.equal(h.storage.autoTab,7);assert.equal(h.storage['autoTab:web-demo'],8);
 const content={id:'extension',url:tab.url,tab,frameId:0};
 await h.send({action:'runState',bindingId:generic.bindingId,account:'web-demo:test-account',desired:true},content);
 h.setSnapshot({code:'platform-restricted',error:'平台限制'});await h.send({action:'pageSnapshot',bindingId:xhs.bindingId},h.content);
 assert.equal(h.storage.receptionSession.desired,false);assert.equal(h.storage['receptionSession:web-demo'].desired,true);
 await h.send({action:'draft',channel:'xiaohongshu',question:'你好'},content);assert.equal(JSON.parse(h.calls.at(-1).options.body).channel,'web-demo');
 assert.equal(h.reads.find(s=>s.target.tabId===8).world,'ISOLATED');
 await h.send({action:'openHandoff',bindingId:generic.bindingId,conversation:'a'},content);assert.equal(h.opened.at(-1).url,'https://support.example/chat/a');
 await h.send({action:'disarm',bindingId:xhs.bindingId},h.content);assert.equal(h.storage['autoTab:web-demo'],8);assert.equal(h.storage['watch:8'].bindingId,generic.bindingId);
 await h.closeWindow(h.storage['watch:8'].manualWindows[0].id);assert.equal(h.messages.at(-1).id,8);assert.equal(h.messages.at(-1).message.action,'finishHandoff');
});


test('重新绑定后，旧面板不能继续提交生成请求，新面板使用正确业务',async()=>{
 const h=harness();const first=(await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data;
 const second=(await h.send({action:'arm',tab:7,space:'new-space',mode:'auto'},h.popup)).data;
 assert.ok((await h.send({action:'draft',bindingId:first.bindingId,question:'旧请求'},h.content)).error);assert.equal(h.calls.length,0);
 assert.ok((await h.send({action:'draft',bindingId:second.bindingId,question:'新请求'},h.content)).data);assert.equal(JSON.parse(h.calls.at(-1).options.body).space,'new-space');
});


test('网页脚本注入失败释放绑定，之后可在同一页面重新启动',async()=>{
 const h=harness();h.setScriptError(true);assert.match((await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).error,/注入失败/);
 assert.equal(h.storage.autoTab,undefined);assert.equal(h.storage['watch:7'],undefined);
 h.setScriptError(false);assert.ok((await h.send({action:'arm',tab:7,space:'s',mode:'auto'},h.popup)).data.bindingId);
});
