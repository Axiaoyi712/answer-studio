ZhidaPageAdapters.register('xiaohongshu',(p,location)=>{
  const tools=ZhidaPageAdapters;
  const api={
    root:()=>document.querySelector('.xhs-im-view')||document.body,
    fault(){
      const nodes=document.querySelectorAll('[role="dialog"],[aria-modal="true"],[class*="modal"],[class*="dialog"]');
      for(const node of nodes){if(!tools.visible(node)||node.closest('.chat-item,.xhs-im-input-bar-editor,.xhs-im-view__sidebar'))continue;const text=node.innerText||'';if(text.includes('限制访问')&&text.includes('浏览器异常'))return {code:'platform-restricted',error:'平台显示限制访问，请按页面提示处理后重新启动此页面接待'};}
      return null;
    },
    editor:()=>tools.one(document,'.xhs-im-chat-window .xhs-im-input-bar-editor'),
    row(id){const nodes=[...document.querySelectorAll('.xhs-im-view__sidebar .xhs-im-conv-item')].filter(n=>n.getAttribute('data-conv-id')===id);if(nodes.length!==1)throw Error('目标会话发生变化');return nodes[0];},
    open(target){const node=api.row(target.id);if(node.getAttribute('data-conv-kind')!==target.kind)throw Error('会话类型发生变化');node.click();},
    back(){tools.one(document,'.xhs-im-conv-list__back-btn').click();},
    viewport(){const side=document.querySelector('.xhs-im-view__sidebar');if(!side)return null;const nodes=[side,...side.querySelectorAll('*')].filter(n=>n.clientHeight>0&&n.scrollHeight>n.clientHeight+2&&/auto|scroll/.test(getComputedStyle(n).overflowY)&&n.querySelector('.xhs-im-conv-item')),outer=nodes.filter(n=>!nodes.some(other=>other!==n&&other.contains(n)));return outer.length===1?outer[0]:null;},
    fill:tools.fill,readText:tools.readText,
    send:input=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true})),
    snapshot(){return (() => {
  const route=location.href;
  try {
    const blocked=api.fault();if(blocked)return {route,...blocked};
    if(location.origin!=='https://www.xiaohongshu.com'||!/^\/chat(?:\/[\w-]+)?\/?$/.test(location.pathname))throw new Error('请打开小红书消息页');
    function one(scope,selector){const list=[...scope.querySelectorAll(selector)].filter(n=>n.getClientRects().length);if(list.length!==1)throw new Error('页面结构未匹配：'+selector);return list[0];}
    const view=one(document,'.xhs-im-view');
    // Production Vue does not expose __vueParentComponent. Walk only mounted VNodes.
    let mount=view;while(mount&&!mount._vnode)mount=mount.parentElement;
    if(!mount)throw new Error('页面版本暂不支持自动识别：未找到已挂载视图');
    const components=[],visited=new Set(),queue=[mount._vnode];
    while(queue.length){
      const v=queue.pop();if(!v||typeof v!=='object'||visited.has(v))continue;
      visited.add(v);if(visited.size>20000)throw new Error('页面结构范围过大');
      if(v.component){components.push(v.component);queue.push(v.component.subTree);}
      if(Array.isArray(v.children))queue.push(...v.children);
      if(v.suspense?.activeBranch)queue.push(v.suspense.activeBranch);
    }
    function props(node,name){const matches=components.filter(c=>(c.type?.__name||c.type?.name)===name&&(c.vnode?.el===node||c.subTree?.el===node||c.subTree?.el?.contains(node)));if(matches.length!==1)throw new Error('页面版本暂不支持自动识别：'+name);return matches[0].props;}
    const owner=props(view,'IMView');
    const account=String(owner.currentUserId||'');if(!account)throw new Error('未识别到登录账号，请先登录');
    const sidebar=one(view,'.xhs-im-view__sidebar');
    const targets=[...sidebar.querySelectorAll('.xhs-im-conv-item')].map(node=>{
      const c=props(node,'ConversationItem').conv;
      if(!c||String(c.id)!==node.getAttribute('data-conv-id')||c.kind!==node.getAttribute('data-conv-kind'))throw new Error('会话列表正在变化');
      return {id:String(c.id),kind:c.kind,name:String(c.name||'').slice(0,100),unread:Number(c.unreadCount)||0,updated:Number(c.lastMessageAt)||0};
    });
    const result={route,account,targets,inFolder:!!sidebar.querySelector('.xhs-im-conv-list__back-btn'),conversation:null,messages:[]};
    const scrollers=[sidebar,...sidebar.querySelectorAll('*')].filter(n=>n.clientHeight>0&&n.scrollHeight>n.clientHeight+2&&/auto|scroll/.test(getComputedStyle(n).overflowY)&&n.querySelector('.xhs-im-conv-item'));
    const outer=scrollers.filter(n=>!scrollers.some(other=>other!==n&&other.contains(n)));
    const viewport=outer.length===1?outer[0]:null;result.listScan={supported:outer.length<=1,scrollable:!!viewport,top:viewport?.scrollTop||0,height:viewport?.scrollHeight||0,viewport:viewport?.clientHeight||0};
    const box=view.querySelector('.xhs-im-chat-window');
    if(!box){if(location.pathname.split('/')[2])throw new Error('会话尚未加载');return result;}
    const chat=props(box,'ChatWindow'),id=String(chat.conv?.id||'');
    if(!id||id!==location.pathname.split('/')[2]||String(chat.myUid)!==account)throw new Error('会话切换尚未完成');
    if(chat.isLoadingMessages||chat.isPreloadingMessages||chat.isLoadingHistory)throw new Error('消息正在加载');
    result.conversation={id,kind:chat.conv.kind,name:String(chat.conv.name||'').slice(0,100)};
    // DOM and component messages must agree; never infer ownership from screen position.
    const source=new Map((chat.messages||[]).map(m=>[String(m.messageId||m.uuid),m]));
    const seen=new Set();
    for(const node of box.querySelectorAll('.chat-item')){
      const m=source.get(node.getAttribute('data-message-id'));
      if(!m)throw new Error('消息数据与页面不一致');
      const bubble=node.querySelector('.chat-item__bubble');
      if(!bubble)continue; // System hints and revoked messages have no chat bubble.
      const id=String(m.uuid||m.messageId||'');if(!id||seen.has(id))throw new Error('消息标识缺失或重复');seen.add(id);
      if(!m.senderId)throw new Error('消息发送者无法识别');
      const self=String(m.senderId)===account;
      if(!bubble.classList.contains(self?'chat-item__bubble--me':'chat-item__bubble--other'))throw new Error('消息归属无法核对');
      const rawTime=m.timestamp??m.createTime??m.createdAt??m.sendTime;let time=typeof rawTime==='number'?rawTime:Date.parse(rawTime);if(time>0&&time<1e11)time*=1000;
      const media=bubble.querySelector('video')?'视频':bubble.querySelector('audio')?'语音':bubble.querySelector('img')?'图片':bubble.querySelector('a[download]')?'文件':'非文字消息';
      result.messages.push({time:Number.isFinite(time)&&time>0?time:null,id,role:self?'assistant':'user',type:Number(m.contentType),media:Number(m.contentType)===1?'':media,content:Number(m.contentType)===1?(bubble.innerText||'').trim():'',pending:!!node.querySelector('.chat-item__status-loading'),failed:!!node.querySelector('.chat-item__status-btn--failed')});
    }
    const latest=chat.messages?.at(-1);
    if(Number(latest?.contentType)===1&&!seen.has(String(latest.uuid||latest.messageId)))throw new Error('最新文字尚未显示，等待页面加载');
    const editor=box.querySelector('.xhs-im-input-bar-editor');
    const input=editor?props(editor,'InputBar'):null;
    result.editable=!!editor&&editor.isContentEditable&&!input.disabled&&String(input.conv?.id)===id&&!box.querySelector('.xhs-im-chat-window__banned-body');
    result.editorText=editor?.textContent||'';
    result.signature=JSON.stringify(result.messages.map(({id,role,type,content,pending,failed})=>({id,role,type,content,pending,failed})));
    return result;
  }catch(e){return {route,error:e.message};}
})();
    }
  };return api;
});
