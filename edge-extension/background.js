const BASE='http://127.0.0.1:3080/api/bridge/';
importScripts('page-adapters.js');
const A=ZhidaPageAdapters,adapterFiles=['page-adapters.js','adapters/xiaohongshu.js','adapters/dom.js'];
const ownerProfile=binding=>binding?.profile||A.builtin;
const stateKey=(name,p)=>A.stateKey(name,p);
async function profiles(){return [A.builtin,...((await chrome.storage.local.get('webProfiles')).webProfiles||[]).map(A.profile)];}
async function resolveProfile(url,id){const candidates=(await profiles()).filter(p=>A.matches(p,url)&&(!id||p.id===id));if(candidates.length!==1)throw Error('当前网页尚未配置适配，请选择或导入对应的网页适配文件');return candidates[0];}
async function readPage(tabId,profile){
  const world=profile.type==='xiaohongshu'?'MAIN':'ISOLATED';
  await chrome.scripting.executeScript({target:{tabId},world,files:adapterFiles});
  const rows=await chrome.scripting.executeScript({target:{tabId},world,func:p=>{try{return ZhidaPageAdapters.create(p).snapshot();}catch(e){return {route:location.href,error:e.message};}},args:[profile]});
  return rows[0]?.result||{error:'页面识别未返回结果'};
}
async function installInbox(tabId,bindingId,autoStart=false,space='',profile=A.builtin){
  await chrome.scripting.executeScript({target:{tabId},files:[...adapterFiles,'auto-policy.js','inbox-policy.js','handoff-reasons.js','reception.js']});
  await chrome.scripting.executeScript({target:{tabId},func:(id,start,space,profile)=>{globalThis.__zhidaBindingId=id;globalThis.__zhidaStartDaily=start;globalThis.__zhidaSpace=space;globalThis.__zhidaProfile=profile;},args:[bindingId,autoStart,space,profile]});
  await chrome.scripting.executeScript({target:{tabId},files:['inbox.js']});
}
async function notifyCase(id,record,repeat=false){
  if(!chrome.notifications)return {notified:false};
  const permission=await chrome.notifications.getPermissionLevel();if(permission!=='granted')return {notified:false};
  await chrome.notifications.create(id,{type:'basic',iconUrl:'icon.png',title:repeat?'人工待办已等待 5 分钟':'知答 · '+(record.fault?'接待异常':'需要人工处理'),message:record.message||(record.fault?'自动接待已停止，请打开面板检查。':'有咨询等待人工处理，请打开客服待办。'),priority:1});
  return {notified:true};
}
async function postHealth(health){
  const token=(await chrome.storage.session.get('bridgeToken')).bridgeToken||(await chrome.storage.local.get('bridgeToken')).bridgeToken;if(!token)return;
  const response=await fetch(BASE+'heartbeat',{method:'POST',headers:{'Content-Type':'application/json','X-Bridge-Token':token},body:JSON.stringify(health),signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('心跳同步失败');
}
async function watchdog(){
  const data=await chrome.storage.local.get(null);
  for(const p of await profiles()){const saved=data[stateKey('receptionSession',p)],health=data[stateKey('receptionHealth',p)];if(!saved?.desired||!health?.running||saved.space!==health.space||saved.account!==health.account)continue;
  const faultKey=stateKey('watchdogFault',p),noticeId=stateKey('zhida-watchdog-alert',p);
  let fault='';
  if(Date.now()-health.seen>120000)fault='客服页面超过2分钟无心跳，请检查标签页是否休眠、关闭或登录失效。';
  else if(!health.lastRead||Date.now()-health.lastRead>120000)fault='客服消息读取超过2分钟未成功，请检查页面。';
  else if(health.failures>=3)fault='问答服务连续失败，请检查模型服务与网络。';
  else if(health.pending>0&&Date.now()-Math.max(health.lastModel||0,health.lastSend||0)>300000)fault='有待回复任务持续积压，请打开客服面板检查。';
  try{await postHealth(health);}catch{fault='本地客服服务无法连接，请检查服务是否运行。';}
  if(!fault){if(data[faultKey])await chrome.storage.local.remove(faultKey);continue;}
  if(data[faultKey]===fault)continue;
  const tab=(await chrome.storage.session.get(stateKey('autoTab',p)))[stateKey('autoTab',p)],binding=tab?(await chrome.storage.session.get('watch:'+tab))['watch:'+tab]:null;
  const record={tab,bindingId:binding?.bindingId,fault:true,message:fault,started:true};
  const result=await notifyCase(noticeId,record);await chrome.storage.local.set({...result.notified?{[faultKey]:fault}:{},['notification:'+noticeId]:record});
  }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  if(sender.id!==chrome.runtime.id)return;
  const popup=sender.url===chrome.runtime.getURL('popup.html');
  (async()=>{
    if(popup&&message.action==='profiles')return profiles();
    if(popup&&message.action==='saveProfile'){
      const p=A.profile(message.profile);if(p.id==='xiaohongshu')throw Error('内置适配不能覆盖');
      const previous=(await profiles()).find(item=>item.id===p.id);if(previous&&(previous.origin!==p.origin||previous.pathPrefix!==p.pathPrefix))throw Error('更换站点或路径请使用新的适配 ID，以隔离账号和接待记录');
      const items=(await profiles()).filter(item=>item.id!=='xiaohongshu'&&item.id!==p.id);if(items.length>=20)throw Error('最多保存20个网页适配');
      items.push(p);await chrome.storage.local.set({webProfiles:items});return p;
    }
    if(message.action==='restoreReception'&&!popup){
      if(!sender.tab||sender.frameId!==0)throw new Error('不是客服页面');
      const prior=(await chrome.storage.session.get('watch:'+sender.tab.id))['watch:'+sender.tab.id];
      if(!(await profiles()).some(p=>A.matches(p,message.pageUrl)))return {disabled:true};
      const profile=await resolveProfile(message.pageUrl,prior?.profile?.id);if(!A.matches(profile,sender.url))throw Error('不是客服页面');
      const tabKey=stateKey('autoTab',profile),existing=(await chrome.storage.session.get(tabKey))[tabKey];
      const controller=existing?(await chrome.storage.session.get('watch:'+existing))['watch:'+existing]:null;
      if(controller?.manualWindows?.some(w=>w.id===sender.tab.windowId))return {manual:true};
      const runningKey=stateKey('receptionSession',profile),saved=(await chrome.storage.local.get(runningKey))[runningKey];
      if(!saved?.desired)return {disabled:true};
      if(existing){try{await chrome.tabs.get(existing);if(existing!==sender.tab.id)return {disabled:true};}catch{}}
      const live=await chrome.tabs.get(sender.tab.id);if(live.url!==message.pageUrl)throw new Error('页面已变化');
      const s=await readPage(live.id,profile);
      if(['platform-restricted','page-blocked'].includes(s?.code)){await chrome.storage.local.set({[runningKey]:{...saved,desired:false}});return {disabled:true,restricted:s.code==='platform-restricted',blocked:s.code==='page-blocked'};}
      if(s?.error||s?.account!==saved.account)return {disabled:!!s?.account};
      const local=await chrome.storage.local.get('bridgeToken'),session=await chrome.storage.session.get('bridgeToken');
      const token=session.bridgeToken||local.bridgeToken;if(!token)return {disabled:true};
      const status=await fetch(BASE+'status',{headers:{'X-Bridge-Token':token},signal:AbortSignal.timeout(10000)});if(!status.ok||!(await status.json()).configured)throw new Error('本地服务尚未就绪');
      const bindingId=Date.now().toString(36)+'-restore';
      await chrome.storage.session.set({[tabKey]:live.id,['watch:'+live.id]:{url:live.url,space:saved.space,mode:'auto',bindingId,profile}});
      await installInbox(live.id,bindingId,true,saved.space,profile);return {restored:true};
    }
    if(message.action==='manualSnapshot'&&!popup){
      if(!sender.tab||sender.frameId!==0)throw new Error('无效人工页面');
      const bindings=await chrome.storage.session.get(null);
      const entry=Object.entries(bindings).find(([key,b])=>key.startsWith('watch:')&&b.manualWindows?.some(w=>w.id===sender.tab.windowId));
      if(!entry)throw new Error('未绑定人工窗口');const [key,binding]=entry,autoTab=Number(key.slice(6)),profile=ownerProfile(binding);
      const manual=binding.manualWindows.find(w=>w.id===sender.tab.windowId),live=await chrome.tabs.get(sender.tab.id);
      if(!A.matches(profile,sender.url)||live.url!==message.pageUrl||!A.matches(profile,live.url))throw new Error('页面已变化');
      const snapshot=await readPage(live.id,profile);if(snapshot.error||snapshot.conversation?.id!==manual.conversation)return {ok:false};
      await chrome.tabs.sendMessage(autoTab,{action:'manualUpdate',bindingId:binding.bindingId,snapshot},{frameId:0});return {ok:true};
    }
    if(popup&&message.action==='arm'){
      if(message.mode!=='auto')throw new Error('旧监听已移除，请使用智能客服');
      const tab=await chrome.tabs.get(message.tab);
      const profile=await resolveProfile(tab.url,message.profileId);
      if(chrome.permissions&&!await chrome.permissions.contains({origins:[A.permissionPattern(profile)]}))throw Error('请先在扩展弹窗允许访问当前聊天站点');
      if(typeof message.space!=='string'||!message.space)throw new Error('请选择业务');
      const tabKey=stateKey('autoTab',profile),existing=(await chrome.storage.session.get(tabKey))[tabKey];
      if(existing&&existing!==tab.id)throw new Error('此网页适配已有专用接待标签页，请先停止原页面；不同适配可同时运行');
      await chrome.storage.session.set({[tabKey]:tab.id});
      const bindingId=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      await chrome.storage.session.set({['watch:'+tab.id]:{url:tab.url,space:message.space,mode:'auto',bindingId,profile}});
      try{
        if(profile.type==='dom'&&chrome.scripting.registerContentScripts){const id='zhida-'+profile.id;await chrome.scripting.unregisterContentScripts({ids:[id]}).catch(()=>{});await chrome.scripting.registerContentScripts([{id,matches:[A.permissionPattern(profile)],js:['bootstrap.js'],runAt:'document_idle'}]);}
        await installInbox(tab.id,bindingId,!!message.startDaily,message.space,profile);
      }catch(e){
        if((await chrome.storage.session.get('watch:'+tab.id))['watch:'+tab.id]?.bindingId===bindingId){await chrome.storage.session.remove('watch:'+tab.id);if((await chrome.storage.session.get(tabKey))[tabKey]===tab.id)await chrome.storage.session.remove(tabKey);}
        throw e;
      }
      return {ok:true,bindingId,profile};
    }
    if(!popup){
      if(!sender.tab||sender.frameId!==0||!['archive-local','draft','pageSnapshot','disarm','handoffBadge','openHandoff','runState','notify','record','learn','prepare-knowledge','completeCase','status','channel','heartbeat','validate-reply'].includes(message.action))throw new Error('禁止的调用');
      const binding=(await chrome.storage.session.get('watch:'+sender.tab.id))['watch:'+sender.tab.id];
      if(message.action!=='disarm'&&message.bindingId&&message.bindingId!==binding?.bindingId)throw Error('客服连接已更换，请重新打开面板');
      const live=await chrome.tabs.get(sender.tab.id);
      const profile=ownerProfile(binding);
      const chatPage={test:url=>A.matches(profile,url)},sameOriginChat=chatPage;
      // SPA navigation can leave MessageSender.url at the document's initial URL.
      // Keep tab/frame binding; compare the caller's current route with the live tab.
      const currentPage=message.pageUrl||sender.url;
      const autoPage=chatPage.test(sender.url||'')&&chatPage.test(live.url||'')&&currentPage===live.url;
      if(['runState','notify','record','learn','prepare-knowledge','completeCase','status','channel','heartbeat','validate-reply','archive-local'].includes(message.action)){
        if(!autoPage||binding?.mode!=='auto'||binding.bindingId!==message.bindingId)throw new Error('客服连接已失效');
        if(message.action==='archive-local'){const snapshot=await readPage(live.id,profile);if(snapshot?.account!==message.account)throw Error('归档账号与当前登录账号不一致');}
        if(message.action==='runState'){
          if(typeof message.account!=='string'||typeof message.desired!=='boolean')throw new Error('运行状态无效');
          if(message.desired){const snapshot=await readPage(live.id,profile);if(snapshot?.account!==message.account)throw new Error('账号校验失败');}
          await chrome.storage.local.set({[stateKey('receptionSession',profile)]:{desired:message.desired,space:binding.space,account:message.account}});
          if(!message.desired){const healthKey=stateKey('receptionHealth',profile),health=(await chrome.storage.local.get(healthKey))[healthKey];if(health?.space===binding.space&&health.account===message.account){const stopped={...health,running:false,seen:Date.now()};await chrome.storage.local.set({[healthKey]:stopped});postHealth(stopped).catch(()=>{});}}
          return {ok:true};
        }
        if(message.action==='notify'){
          const id='zhida:'+JSON.stringify([message.account,message.conversation||'fault']);
          const key='notification:'+id,old=(await chrome.storage.local.get(key))[key];
          if(old){await chrome.storage.local.set({[key]:{...old,tab:live.id,bindingId:binding.bindingId,started:old.started||!!message.started}});return {notified:old.notified};}
          const record={tab:live.id,bindingId:binding.bindingId,conversation:message.conversation,fault:!!message.fault,time:Date.now(),started:!!message.started,reminded:false};
          const result=await notifyCase(id,record);await chrome.storage.local.set({[key]:{...record,...result}});
          if(!record.fault)await chrome.alarms?.create(id,{when:Date.now()+300000});return result;
        }
        if(message.action==='completeCase'){
          const id='zhida:'+JSON.stringify([message.account,message.conversation||'fault']);await chrome.storage.local.remove('notification:'+id);await chrome.alarms?.clear(id);await chrome.notifications?.clear(id);return {ok:true};
        }
      }
      if(message.action==='openHandoff'){
        if(!autoPage||binding?.mode!=='auto'||!binding.bindingId||binding.bindingId!==message.bindingId)throw new Error('人工窗口连接已失效，请从原客服页面打开');
        if(typeof message.conversation!=='string'||!message.conversation||message.conversation.length>128||profile.type==='xiaohongshu'&&!/^[a-zA-Z0-9_-]+$/.test(message.conversation))throw new Error('会话标识无效');
        for(const [key,n] of Object.entries(await chrome.storage.local?.get(null)||{}))if(key.startsWith('notification:')&&n.tab===live.id&&n.conversation===message.conversation)await chrome.storage.local.set({[key]:{...n,started:true}});
        const windows=[];let existing;
        for(const item of binding.manualWindows||[]){try{await chrome.windows.get(item.id);windows.push(item);if(item.conversation===message.conversation)existing=item;}catch{}}
        if(existing)await chrome.windows.update(existing.id,{focused:true});
        else {
          const manual=await chrome.windows.create({url:A.conversationUrl(profile,message.conversation),type:'normal',width:1000,height:800,focused:true});
          windows.push({id:manual.id,conversation:message.conversation});
        }
        // Do not let an old panel's delayed window creation replace a newer binding.
        if((await chrome.storage.session.get('watch:'+live.id))['watch:'+live.id]?.bindingId!==binding.bindingId)throw new Error('客服连接已更换，请重新打开助手');
        await chrome.storage.session.set({['watch:'+live.id]:{...binding,manualWindows:windows}});
        return {ok:true,manualWindowOpen:true};
      }
      if(message.action==='handoffBadge'){
        if(!autoPage||binding?.mode!=='auto'||!binding.bindingId||binding.bindingId!==message.bindingId)throw new Error('人工提醒连接已失效');
        if(!Number.isInteger(message.count)||message.count<0||message.count>1000)throw new Error('待办数量无效');
        await Promise.all([chrome.action.setBadgeText({tabId:live.id,text:message.count?String(message.count):''}),chrome.action.setBadgeBackgroundColor({tabId:live.id,color:'#9b321b'})]);
        return {ok:true};
      }
      if(message.action==='disarm'){
        if(!chatPage.test(sender.url||'')||!binding?.bindingId||binding.bindingId!==message.bindingId||binding.mode!=='auto')return {ok:false};
        await chrome.storage.session.remove('watch:'+sender.tab.id);
        const tabKey=stateKey('autoTab',profile);if((await chrome.storage.session.get(tabKey))[tabKey]===sender.tab.id)await chrome.storage.session.remove(tabKey);
        return {ok:true};
      }
      if(message.action==='pageSnapshot'){
        if(binding?.mode!=='auto')throw new Error('自动客服连接已失效，请从扩展重新打开控制台');
        if(!autoPage)throw new Error('聊天页面正在切换，请稍后重新启动');
        const result=await readPage(live.id,profile);
        if(['platform-restricted','page-blocked'].includes(result.code)){
          const runningKey=stateKey('receptionSession',profile),saved=(await chrome.storage.local.get(runningKey))[runningKey];
          if(saved?.space===binding.space)await chrome.storage.local.set({[runningKey]:{...saved,desired:false}});
        }
        return result;
      }
      const allowed=binding?.mode==='auto'&&autoPage&&(message.action==='status'||message.action==='heartbeat'||message.action==='archive-local'||sameOriginChat.test(live.url||''));
      if(!allowed)throw new Error('会话已变化或连接已失效，请重新开启助手');
      if(message.action==='record'&&message.record?.space&&message.record.space!==binding.space)throw new Error('记录不属于当前业务');
      message.space=binding.space;message.channel=profile.id;
    }
    if(popup&&!['spaces','status'].includes(message.action))throw new Error('弹窗仅支持连接与启动，请在客服面板生成回复');
    const sessionToken=await chrome.storage.session.get('bridgeToken');
    const bridgeToken=sessionToken.bridgeToken||(await chrome.storage.local?.get('bridgeToken'))?.bridgeToken;
    if(!bridgeToken)throw new Error('请先填写本地连接令牌');
    if(!['spaces','draft','status','channel','record','learn','prepare-knowledge','heartbeat','validate-reply','archive-local'].includes(message.action))throw new Error('未知操作');
    const options={headers:{'X-Bridge-Token':bridgeToken},signal:AbortSignal.timeout(message.action==='draft'?Math.max(1,Math.min(22000,Number.isFinite(message.deadline)?message.deadline-Date.now():22000)):55000)};
    if(message.action==='draft'){
      options.method='POST';options.headers['Content-Type']='application/json';
      options.body=JSON.stringify({space:message.space,question:message.question,history:message.history,account:message.account,conversation:message.conversation,channel:message.channel,partialReplies:true,deadline:message.deadline,generation:message.generation});
    }
    if(['record','learn','prepare-knowledge'].includes(message.action)){
      options.method='POST';options.headers['Content-Type']='application/json';
      options.body=JSON.stringify({...(message.action==='record'?message.record:message.fact),space:message.space,generation:message.generation});
    }
    if(['channel','heartbeat','validate-reply','archive-local'].includes(message.action)){
      options.method='POST';options.headers['Content-Type']='application/json';
      options.body=JSON.stringify({...message,space:message.space});
      if(message.action==='heartbeat'){
        const health={...message,space:message.space,seen:Date.now()};await chrome.storage.local.set({[A.stateKey('receptionHealth',ownerProfile((await chrome.storage.session.get('watch:'+sender.tab.id))['watch:'+sender.tab.id]))]:health});
        await chrome.alarms?.create('zhida-watchdog',{periodInMinutes:1});
      }
    }
    let response;
    try {response=await fetch(BASE+message.action,options);}
    catch(e){
      if(e.name==='TimeoutError'||e.name==='AbortError')throw new Error('请求超时。请检查本地客服服务和模型网络连接；本次未发送任何聊天消息。');
      throw new Error('无法连接本地客服服务（127.0.0.1:3080）。请先运行项目 start.cmd，并保持服务窗口打开；若本地工作台可以打开，请检查 Edge 扩展是否允许访问 http://127.0.0.1/*。');
    }
    const data=await response.json();if(!response.ok)throw new Error(data.error||'本地服务请求失败');
    return data;
  })().then(data=>respond({data}),e=>respond({error:e.message}));
  return true;
});
chrome.alarms?.onAlarm.addListener(async alarm=>{
  if(alarm.name==='zhida-watchdog'){try{await watchdog();}catch{}return;}
  if(!alarm.name.startsWith('zhida:'))return;
  const key='notification:'+alarm.name,n=(await chrome.storage.local.get(key))[key];
  if(!n||n.started||n.reminded)return;
  try{await notifyCase(alarm.name,n,true);await chrome.storage.local.set({[key]:{...n,reminded:true}});}catch{}
});
chrome.notifications?.onClicked.addListener(async id=>{
  const n=(await chrome.storage.local.get('notification:'+id))['notification:'+id];if(!n)return;
  try{const tab=await chrome.tabs.get(n.tab);await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});await chrome.tabs.sendMessage(tab.id,{action:'showReception',bindingId:n.bindingId},{frameId:0});}catch{}
});
chrome.runtime.onStartup?.addListener(async()=>{
  await chrome.alarms?.create('zhida-watchdog',{periodInMinutes:1});
  for(const [key,n] of Object.entries(await chrome.storage.local.get(null)))if(key.startsWith('notification:')&&!n.started&&!n.reminded&&!n.fault)await chrome.alarms.create(key.slice(13),{when:Math.max(Date.now()+1000,n.time+300000)});
});
chrome.tabs.onRemoved.addListener(async id=>{const key='watch:'+id,binding=(await chrome.storage.session.get(key))[key];await chrome.storage.session.remove(key);const tabKey=stateKey('autoTab',ownerProfile(binding));if((await chrome.storage.session.get(tabKey))[tabKey]===id)await chrome.storage.session.remove(tabKey);});
chrome.windows.onRemoved.addListener(async windowId=>{
  for(const [key,binding] of Object.entries(await chrome.storage.session.get(null))){
    const manual=binding?.manualWindows?.find(item=>item.id===windowId);if(!key.startsWith('watch:')||binding?.mode!=='auto'||!binding.bindingId||!manual)continue;
    try{const autoTab=Number(key.slice(6)),owner=await chrome.tabs.get(autoTab);if(!A.matches(ownerProfile(binding),owner.url))continue;
      await chrome.tabs.update(autoTab,{active:true});await chrome.windows.update(owner.windowId,{focused:true});
      if((await chrome.storage.session.get(key))[key]?.bindingId!==binding.bindingId)continue;
      await chrome.tabs.sendMessage(autoTab,{action:'finishHandoff',bindingId:binding.bindingId,conversation:manual.conversation},{frameId:0});
    }catch{} // Closed controllers keep their persisted handoff for later recovery.
  }
});
