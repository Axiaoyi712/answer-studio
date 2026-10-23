(() => {
  globalThis.__zhidaClose?.();globalThis.__zhidaAutoClose?.();
  const host=document.createElement('div');host.style.cssText='position:fixed;right:12px;top:65px;width:390px;max-width:95vw;z-index:2147483647';
  const root=host.attachShadow({mode:'closed'});
  root.innerHTML=`<style>*{box-sizing:border-box}section{font:13px/1.6 "Microsoft YaHei",sans-serif;color:#213e31;background:#f7f9f4;border:1px solid #bdcdbd;border-radius:12px;padding:17px;max-height:85vh;overflow:auto;box-shadow:0 8px 40px #0004}h3{margin:0}label{display:block;margin:9px 0}input,textarea{font:inherit;width:100%;padding:6px;border:1px solid #b9c8b7;border-radius:5px}input[type=checkbox]{width:auto}button{background:#236b52;color:white;border:0;border-radius:6px;padding:9px;margin:4px;cursor:pointer}button:disabled{opacity:.5}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;background:#fff;padding:8px}p{font-size:12px}#status{color:#8a490c}summary{cursor:pointer}</style>
  <section><h3>知答 · 自动客服 v0.4</h3><p>开启后会自动点击发送。当前只支持保持前台、使用站内切换的专用聊天标签页；关闭或刷新不会自动恢复。</p><button id="stop">立即停发 / 人工接管</button><button id="close">关闭</button>
  <details open id="settings"><summary>首次校准（全部需要核对）</summary><p>选择器必须来自当前真实页面。不会猜测未读标记、消息归属或发送按钮。仅支持有稳定消息ID、可核对会话ID的DOM。</p>
  <label>当前登录账号标识（自定义固定名称，换账号须更换）<input id="account" placeholder="例如：我的小红书主号"></label>
  <label>会话内容根容器 CSS<input id="container"></label>
  <label>根容器内会话ID元素 CSS（根本身填 :scope）<input id="identity" value=":scope"></label>
  <label>会话ID属性（其值须等于网址 /chat/ 后的ID）<input id="identityAttr" placeholder="例如 data-conversation-id"></label>
  <label>对方文字消息 CSS（相对根容器）<input id="incoming"></label>
  <label>自己文字消息 CSS（相对根容器）<input id="outgoing"></label>
  <label>消息稳定ID属性（在每个文字元素上）<input id="messageId" placeholder="例如 data-message-id"></label>
  <label>输入框 CSS（相对根容器）<input id="input"></label>
  <label>发送按钮 CSS（相对根容器）<input id="send"></label>
  <label>带未读标记的会话行 CSS（相对页面）<input id="unread" placeholder="必须只匹配未读会话，不是所有联系人"></label>
  <label>会话行内链接 CSS（行本身是链接填 :scope）<input id="link" value="a[href*='/chat/']"></label>
  <button id="save">保存校准</button><button id="load">载入校准</button><button id="preview">预览识别，不发送</button><pre id="previewText">尚未校准</pre></details>
  <label><input type="checkbox" id="confirmed">已核对：双方消息、会话ID、未读行、输入框与发送按钮正确；先使用测试账号验证</label>
  <button id="start">开启自动回复</button><p id="status" role="status">停止中，未发送。</p><label>当前问题<textarea id="question" readonly rows="2"></textarea></label><label>最新结果<textarea id="reply" readonly rows="4"></textarea></label><h4>需人工处理</h4><pre id="handoffs">暂无</pre><h4>运行记录</h4><pre id="log"></pre><p>超纲、敏感信息或购买链接、无法确认发送结果会转人工。本机发送记录用于防重，不等于平台送达回执；没有免封保证。</p></section>`;
  document.documentElement.append(host);
  const $=id=>root.getElementById(id),policy=globalThis.ZhidaAutoPolicy;
  const fields=['account','container','identity','identityAttr','incoming','outgoing','messageId','input','send','unread','link'];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let config=null,verified=false,running=false,busy=false,epoch=0,writing=false,expectedRoute=location.href,lastSignature='',count=0;
  const contexts=new Map(),observed=new Map(),blocked=new Set(),logs=[],handoffs=[];
  function log(t){$('status').textContent=t;logs.unshift(new Date().toLocaleTimeString()+' '+t);logs.splice(30);$('log').textContent=logs.join('\n');}
  function stop(t){running=false;epoch++;log(t);}
  function attention(t){blocked.add(location.href);handoffs.unshift(new URL(location.href).pathname+'\n'+t);handoffs.splice(20);$('handoffs').textContent=handoffs.join('\n\n');stop('需要人工：'+t);}
  const visible=n=>!!n&&n.getClientRects().length>0;
  function one(scope,selector){const nodes=selector===':scope'?[scope]:[...scope.querySelectorAll(selector)].filter(visible);if(nodes.length!==1)throw new Error('选择器必须唯一匹配：'+selector);return nodes[0];}
  function readConfig(){const c=Object.fromEntries(fields.map(k=>[k,$(k).value.trim()]));if(fields.some(k=>!c[k]))throw new Error('请填写全部校准项');if(c.account.length>100)throw new Error('账号标识过长');return c;}
  function read(){
    const route=new URL(location.href);if(route.origin!=='https://www.xiaohongshu.com'||!/^\/chat\/[\w-]+\/?$/.test(route.pathname))throw new Error('不在具体私信会话页');
    const box=one(document,config.container);
    if(box===document.body||box===document.documentElement||box.contains(host))throw new Error('根容器范围过大');
    const identity=one(box,config.identity);if(identity.getAttribute(config.identityAttr)!==route.pathname.split('/')[2])throw new Error('页面内容与网址会话ID不一致，停止发送');
    const incoming=[...box.querySelectorAll(config.incoming)],outgoing=[...box.querySelectorAll(config.outgoing)];
    if(incoming.some(n=>outgoing.includes(n)))throw new Error('双方消息选择器重叠');
    const nodes=[...incoming,...outgoing];if(nodes.length>300)throw new Error('消息范围过大');
    if(nodes.some(n=>nodes.some(m=>m!==n&&n.contains(m))))throw new Error('消息选择器嵌套重复');
    nodes.sort((a,b)=>a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING?-1:1);
    const seen=new Set();const messages=nodes.map(n=>{const id=n.getAttribute(config.messageId);if(!id||seen.has(id))throw new Error('消息ID缺失或重复，需要真实页面适配');seen.add(id);return {id,role:incoming.includes(n)?'user':'assistant',content:(n.innerText||'').trim()};});
    const input=one(box,config.input),send=one(box,config.send);
    if(!input.matches('textarea,input[type=text],input:not([type]),[contenteditable=true]'))throw new Error('输入框类型不支持');
    if(!send.matches('button,[role=button]'))throw new Error('发送控件必须是按钮');
    return {messages,input,send,signature:JSON.stringify(messages),route:location.href};
  }
  const empty=n=>!(n.isContentEditable?n.textContent:n.value)?.trim();
  const enabled=n=>!n.disabled&&n.getAttribute('aria-disabled')!=='true';
  function targets(){return [...document.querySelectorAll(config.unread)].filter(n=>visible(n)&&!n.contains(host)).map(row=>{const a=one(row,config.link);const u=new URL(a.getAttribute('href'),location.href);if(u.origin!=='https://www.xiaohongshu.com'||!/^\/chat\/[\w-]+\/?$/.test(u.pathname))throw new Error('会话链接不符合 /chat/ 路径');return {a,url:u.href};});}
  fields.forEach(k=>$(k).oninput=()=>{verified=false;$('confirmed').checked=false;stop('配置已修改，请重新预览');});
  $('preview').onclick=()=>{try{config=readConfig();const s=read(),list=targets();$('previewText').textContent=JSON.stringify({conversation:new URL(s.route).pathname,messages:s.messages.slice(-8),unread:list.map(t=>new URL(t.url).pathname),input:s.input.tagName,send:s.send.innerText},null,2);verified=true;$('confirmed').checked=false;log('请逐项核对预览；这里只检查结构，不证明业务身份正确。');}catch(e){verified=false;log(e.message);}};
  $('save').onclick=async()=>{try{await chrome.storage.local.set({zhidaAutoConfig:readConfig()});log('已保存配置，未启用自动回复');}catch(e){log(e.message);}};
  $('load').onclick=async()=>{try{const c=(await chrome.storage.local.get('zhidaAutoConfig')).zhidaAutoConfig;if(!c)throw new Error('尚未保存');stop('已载入，请重新预览');for(const k of fields)$(k).value=c[k]||'';verified=false;$('confirmed').checked=false;}catch(e){log(e.message);}};
  $('start').onclick=()=>{try{
    if(busy)throw new Error('上一任务还在结束，请稍后');if(!verified||!$('confirmed').checked)throw new Error('先预览并确认校准');
    if(document.hidden||!document.hasFocus())throw new Error('请保持聊天窗口在前台');
    config=readConfig();const s=read();if(!empty(s.input))throw new Error('输入框已有文字，请先人工处理');
    if(blocked.has(s.route))throw new Error('当前会话需要人工处理；处理后关闭控制台重新打开，不会自动重试不确定发送');
    observed.set(s.route,s.signature);lastSignature=s.signature;expectedRoute=s.route;running=true;epoch++;count=0;
    $('settings').open=false;log('自动回复已开启。当前历史不主动回复，开始检测未读会话和新消息。');
  }catch(e){log(e.message);}};
  $('stop').onclick=()=>stop('已停止自动发送');
  function guard(generation){if(!running||epoch!==generation||document.hidden||!document.hasFocus())throw new Error('已暂停或窗口不在前台');if(location.href!==expectedRoute)throw new Error('会话被切换');}
  async function processMessage(s,generation){
    const lastOut=s.messages.findLastIndex(m=>m.role==='assistant');
    const tail=s.messages.slice(lastOut+1).filter(m=>m.role==='user'&&m.content);
    if(!tail.length){observed.set(s.route,s.signature);return;}
    const question=tail.map(m=>m.content).join('\n');if(question.length>2000)throw new Error('消息过长，请人工处理');
    const key=policy.key(config.account,s.route,tail.map(m=>m.id));
    const prior=(await chrome.storage.local.get(key))[key];
    if(prior){if(['sending','unknown','handoff'].includes(prior.state))throw new Error('此问题已有未确认发送或人工处理记录，请人工核对；不会自动重发');observed.set(s.route,s.signature);return;}
    guard(generation);$('question').value=question;$('reply').value='';log('正在理解问题并查询已发布知识…');
    const history=(contexts.get(s.route)||[]).slice(-10);
    const response=await chrome.runtime.sendMessage({action:'draft',question,history});guard(generation);
    if(response?.error)throw new Error(response.error);
    const r=response.data;const fresh=read();if(fresh.signature!==s.signature){log('消息已更新，丢弃旧答案，等待重新处理');return;}
    $('reply').value=r.answer||'';const decision=policy.decision(r);
    if(decision==='handoff'){await chrome.storage.local.set({[key]:{state:'handoff',time:Date.now()}});throw new Error('问题超出资料范围、需人工审核或包含不允许自动发送的内容');}
    if(decision==='skip'){await chrome.storage.local.set({[key]:{state:'skipped',time:Date.now()}});observed.set(s.route,s.signature);log('已跳过测试或无须回复的消息');return;}
    if(count>=10)throw new Error('本轮10条试运行上限已到，检查结果后重新开启');
    if(!policy.canSend({running,visible:!document.hidden&&document.hasFocus(),route:location.href,expectedRoute:s.route,signature:fresh.signature,expectedSignature:s.signature,empty:empty(fresh.input),enabled:!fresh.input.disabled&&!fresh.input.readOnly}))throw new Error('发送前核对失败');
    writing=true;
    try{
      fresh.input.focus();if(fresh.input.isContentEditable)fresh.input.textContent=r.answer;
      else{const proto=fresh.input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(fresh.input,r.answer);}
      fresh.input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:r.answer}));
    }finally{writing=false;}
    await sleep(400);guard(generation);const ready=read();
    if(ready.signature!==s.signature)throw new Error('填写期间收到新消息，未发送；请人工处理输入框草稿');
    if((ready.input.isContentEditable?ready.input.textContent:ready.input.value)!==r.answer||!enabled(ready.send))throw new Error('编辑器或发送按钮未就绪，未发送');
    // Persist before clicking: uncertain completion is never retried automatically.
    await chrome.storage.local.set({[key]:{state:'sending',time:Date.now()}});guard(generation);
    const final=read();if(final.signature!==s.signature||final.send!==ready.send||!enabled(final.send)||(final.input.isContentEditable?final.input.textContent:final.input.value)!==r.answer)throw new Error('点击前页面变化，需人工核对');
    final.send.click();count++;log('已点击发送，正在检查页面回显…');
    const before=new Set(s.messages.map(m=>m.id));
    for(let i=0;i<12;i++){
      await sleep(500);guard(generation);const after=read();
      const echo=after.messages.find(m=>m.role==='assistant'&&!before.has(m.id)&&m.content===r.answer);
      if(echo&&empty(after.input)){
        await chrome.storage.local.set({[key]:{state:'echo-confirmed',time:Date.now()}});
        contexts.set(s.route,[...history,{role:'user',content:question},{role:'assistant',content:r.answer}].slice(-10));
        observed.set(s.route,s.signature);log('已出现己方消息回显（不是服务端送达凭证），继续监听');return;
      }
    }
    await chrome.storage.local.set({[key]:{state:'unknown',time:Date.now()}});throw new Error('发送结果无法确认，禁止自动重试，请检查是否已发送');
  }
  async function tick(){
    if(!running||busy)return;busy=true;const generation=epoch;
    try{
      guard(generation);let s=read();
      if(observed.get(s.route)===s.signature){
        const next=targets().find(t=>t.url!==location.href&&!blocked.has(t.url));
        if(!next)return;
        expectedRoute=next.url;next.a.click();log('正在打开未读会话…');
        let loaded=false;for(let i=0;i<16;i++){await sleep(250);if(!running||epoch!==generation)return;if(location.href!==expectedRoute)continue;try{s=read();loaded=true;break;}catch{}}
        if(!loaded)throw new Error('会话内容未能按ID验证，停止');
      }
      const signature=s.signature;await sleep(1500);guard(generation);s=read();if(s.signature!==signature)return;
      if(observed.get(s.route)!==s.signature)await processMessage(s,generation);
    }catch(e){if(running)attention(e.message);}finally{busy=false;}
  }
  function operator(e){if(e.isTrusted&&!e.composedPath().includes(host)&&!writing&&running)stop('检测到人工操作，已暂停自动发送');}
  function inactive(){if(running&&(document.hidden||!document.hasFocus()))stop('窗口失焦或隐藏，已暂停');}
  document.addEventListener('pointerdown',operator,true);document.addEventListener('keydown',operator,true);document.addEventListener('input',operator,true);document.addEventListener('visibilitychange',inactive);window.addEventListener('blur',inactive);
  const timer=setInterval(tick,1000);
  globalThis.__zhidaAutoClose=()=>{stop('已关闭');clearInterval(timer);document.removeEventListener('pointerdown',operator,true);document.removeEventListener('keydown',operator,true);document.removeEventListener('input',operator,true);document.removeEventListener('visibilitychange',inactive);window.removeEventListener('blur',inactive);host.remove();delete globalThis.__zhidaAutoClose;};
  $('close').onclick=globalThis.__zhidaAutoClose;
})();
