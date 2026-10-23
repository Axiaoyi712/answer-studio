(async()=>{try{
  for(const name of ['auto-policy','inbox-policy','handoff-reasons','reception'])new Function(sources[name])();
  current='a';fakeLocation.pathname='/chat/a';messages.a=[{uuid:'shared-id',messageId:'shared-id',senderId:'visitor',contentType:1,text:'顾客问：限制访问、浏览器异常是什么意思？',timestamp:Date.now()}];render();
  check(!snapshot(fakeLocation).error,'客户正文提到限制访问和浏览器异常，不误判成平台阻断');
  const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.textContent='限制访问 浏览器异常';document.body.append(modal);check(snapshot(fakeLocation).code==='platform-restricted','实际可见的阻断弹窗仍阻止读取');modal.hidden=true;check(!snapshot(fakeLocation).error,'隐藏的历史弹窗不误报');modal.remove();
  const legacy=ZhidaInboxPolicy.caseKey('me','a');storage[legacy]={state:'active',handled:['shared-id']};storage.receptionSession={desired:true,account:'me',space:'same-business'};
  globalThis.__zhidaProfile=ZhidaPageAdapters.profile(demoProfile);globalThis.__zhidaSpace='same-business';
  fakeLocation.origin=demoProfile.origin;fakeLocation.pathname='/web-chat-demo/chat/a';current='a';
  messages.a=[{uuid:'shared-id',messageId:'shared-id',senderId:'visitor',contentType:1,text:'你好',timestamp:Date.now()-48*3600000}];messages.b=[];
  render=()=>{
    const app=document.getElementById('app');app.innerHTML='<main id="demo-chat" data-account-id="demo-owner"><aside></aside><section class="conversation"><h2 class="customer-name"></h2><div class="messages"></div><textarea></textarea><button class="send">发送</button></section></main><div class="demo-blocked" role="dialog" hidden>测试页面阻断</div>';
    const root=app.querySelector('main'),side=root.querySelector('aside'),box=root.querySelector('.conversation');box.dataset.conversationId=current;box.querySelector('h2').textContent='演示客户 '+current;
    for(const id of ['a','b']){const button=document.createElement('button');button.className='contact';button.dataset.contactId=id;button.dataset.unread=String(chats[id].unreadCount);button.textContent='演示客户 '+id;button.onclick=()=>{current=id;chats[id].unreadCount=0;fakeLocation.pathname='/web-chat-demo/chat/'+id;render();};side.append(button);}
    for(const m of messages[current]){const n=document.createElement('div'),text=document.createElement('span');n.className='message '+(m.senderId==='me'?'outgoing':'incoming');n.dataset.messageId=m.uuid;n.dataset.time=String(m.timestamp);text.className='message-text';text.textContent=m.text;n.append(text);box.querySelector('.messages').append(n);}
    box.querySelector('.send').onclick=()=>{sendCount++;const text=box.querySelector('textarea').value;messages[current].push({uuid:'generic-out-'+sendCount,messageId:'generic-out-'+sendCount,senderId:'me',contentType:1,text,timestamp:Date.now()});render();};
  };
  chats.a.unreadCount=chats.b.unreadCount=0;render();
  const adapter=ZhidaPageAdapters.create(demoProfile,fakeLocation),first=snapshot(fakeLocation);
  check(first.account==='web-demo:demo-owner'&&first.messages[0].role==='user'&&first.editable,'另一种 DOM 结构独立识别账号、消息归属和 textarea');
  const message=document.querySelector('.message');message.classList.add('outgoing');check(!!snapshot(fakeLocation).error,'消息归属存在歧义时拒绝发送');message.classList.remove('outgoing');
  const cloned=message.cloneNode(true);message.after(cloned);check(!!snapshot(fakeLocation).error,'稳定消息 ID 重复时拒绝读取');cloned.remove();
  const input=adapter.editor();input.disabled=true;check(snapshot(fakeLocation).editable===false,'禁用输入框识别为不可发送');input.disabled=false;
  customReply={action:'clarify',answer:'好的，我在。',engine:'deepseek'};new Function('location',sources.inbox)(fakeLocation);await sleep(300);
  panel.getElementById('mode').value='detect';panel.getElementById('mode').dispatchEvent(new Event('change'));panel.getElementById('start').click();await sleep(4500);
  check(requests===0&&sendCount===0&&isRunning(),'通用网页检测模式不调用模型、不填写、不发送');await pause();
  panel.getElementById('daily').click();await until(()=>sendCount===1,'通用网页发送首条回复');
  check(snapshot(fakeLocation).messages.at(-1).role==='assistant'&&snapshot(fakeLocation).messages.at(-1).content==='好的，我在。'&&!adapter.editor().value,'通用引擎通过 textarea 和发送按钮完成回复并核实回显');
  check(storage.receptionSession.desired===true&&storage['receptionSession:web-demo'].desired===true&&storage[legacy].handled[0]==='shared-id','相同客户和消息 ID 不与小红书防重、账号及运行状态混用');
  await pause();panel.getElementById('daily').click();await sleep(6000);check(sendCount===1,'重新启动后不重复发送已确认的消息');
  await pause();incoming('a','当前客户的新问题');incoming('b','其他客户的新问题');adapter.fill(adapter.editor(),'尚未发送的人工草稿');panel.getElementById('daily').click();await until(()=>sendCount===2,'保留草稿后接待其他客户');
  check(messages.b.at(-1).senderId==='me'&&!messages.a.some(m=>m.senderId==='me'&&m.text==='尚未发送的人工草稿'),'textarea 草稿不外发，其他客户继续接待');
  const draft=storage[ZhidaInboxPolicy.draftKey('web-demo:demo-owner','a')];
  check(draft?.text==='尚未发送的人工草稿'&&[...panel.getElementById('savedDrafts').querySelectorAll('textarea')].some(n=>n.value===draft.text),'通用网页的人工草稿可在面板核对');
  await pause();globalThis.__zhidaAutoClose();await sleep(300);current='a';fakeLocation.pathname='/web-chat-demo/chat/a';render();
  new Function('location',sources.inbox)(fakeLocation);await sleep(300);const blocked=document.querySelector('.demo-blocked');blocked.hidden=false;const before=sendCount;panel.getElementById('daily').click();await sleep(500);
  check(!isRunning()&&panel.getElementById('daily').disabled&&sendCount===before,'通用网页的可见阻断元素停止本页面，不强行发送');
  check(storage.receptionSession.desired===true&&storage['receptionSession:web-demo'].desired===false,'本页面故障不会清除另一个渠道的运行意图');
  globalThis.__zhidaAutoClose();document.getElementById('results').textContent=JSON.stringify({ok:true,checks,sendCount,requests});
}catch(e){document.getElementById('results').textContent=JSON.stringify({ok:false,error:e.message,checks,sendCount,requests,status:panel?.getElementById('status').textContent,log:panel?.getElementById('log').textContent});}})();
