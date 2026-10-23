(() => {
  const factories=new Map();
  const builtin={id:'xiaohongshu',name:'小红书',type:'xiaohongshu',origin:'https://www.xiaohongshu.com',pathPrefix:'/chat',conversationPath:'/chat/{id}'};
  function profile(value=builtin){
    if(value.id==='xiaohongshu')return {...builtin};
    if(value.type!=='dom'||!/^[-a-z0-9]{1,40}$/.test(value.id||'')||!value.name?.trim()||value.name.length>60)throw Error('网页适配名称或 ID 无效');
    const origin=new URL(value.origin);if(!['http:','https:'].includes(origin.protocol)||origin.origin!==value.origin||origin.username||origin.password)throw Error('适配地址必须是完整的 HTTP(S) 站点来源，不含路径或凭证');
    if(typeof value.pathPrefix!=='string'||!value.pathPrefix.startsWith('/')||/[?#]/.test(value.pathPrefix)||value.pathPrefix.length>200)throw Error('聊天路径前缀无效');
    if(typeof value.conversationPath!=='string'||value.conversationPath.split('{id}').length!==2||!value.conversationPath.startsWith('/')||value.conversationPath.startsWith('//'))throw Error('会话路径须包含一个 {id}');
    const selectors={},attributes={};
    for(const key of ['root','conversation','rows','messages','text','incoming','outgoing','input','send','scroll','blocked','back','name']){
      const v=value.selectors?.[key]||'';if(typeof v!=='string'||v.length>400)throw Error('页面选择器无效：'+key);selectors[key]=v;
    }
    for(const key of ['root','conversation','rows','messages','text','incoming','outgoing','input'])if(!selectors[key])throw Error('适配缺少选择器：'+key);
    for(const key of ['account','conversation','row','message','unread','time','kind']){
      const v=value.attributes?.[key]||'';if(typeof v!=='string'||v&&!/^[a-zA-Z][\w:.-]{0,80}$/.test(v))throw Error('页面属性无效：'+key);attributes[key]=v;
    }
    for(const key of ['account','conversation','row','message'])if(!attributes[key])throw Error('适配缺少稳定标识属性：'+key);
    const result={id:value.id,name:value.name.trim(),type:'dom',origin:origin.origin,pathPrefix:value.pathPrefix,conversationPath:value.conversationPath,selectors,attributes,sendMode:value.sendMode||'click'};
    if(!['click','enter'].includes(result.sendMode)||result.sendMode==='click'&&!selectors.send)throw Error('点击发送模式需要发送按钮选择器');
    if(!matches(result,origin.origin+result.conversationPath.replace('{id}','test')))throw Error('会话路径必须位于聊天路径前缀内');
    return result;
  }
  function matches(p,url){try{const u=new URL(url),prefix=p.pathPrefix;return u.origin===p.origin&&(prefix==='/'||u.pathname===prefix||u.pathname.startsWith(prefix.endsWith('/')?prefix:prefix+'/'));}catch{return false;}}
  const api={builtin,profile,matches,register:(type,factory)=>factories.set(type,factory),
    permissionPattern(p){const u=new URL(p.origin);return u.protocol+'//'+u.hostname+'/*';},
    stateKey:(name,p)=>p.id==='xiaohongshu'?name:name+':'+p.id,
    conversationUrl(p,id){if(typeof id!=='string'||!id||id.length>128)throw Error('会话标识无效');const url=new URL(p.conversationPath.replace('{id}',encodeURIComponent(id)),p.origin).href;if(!matches(p,url))throw Error('会话地址超出绑定站点');return url;},
    create(value,location=globalThis.location){const p=profile(value);if(!matches(p,location.href))throw Error('当前页面不属于所选网页适配');const factory=factories.get(p.type);if(!factory)throw Error('网页适配尚未加载');return {...factory(p,location),profile:p,conversationUrl:id=>api.conversationUrl(p,id)};},
    visible:n=>!!n&&!!n.getClientRects().length&&!n.closest('[hidden]'),
    one(scope,selector){const nodes=[...scope.querySelectorAll(selector)].filter(api.visible);if(nodes.length!==1)throw Error('页面元素无法唯一定位：'+selector);return nodes[0];},
    readText:input=>'value' in input?input.value:input.textContent||'',
    fill(input,text){if(input.matches('textarea,input')){const prototype=input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,text);}else input.textContent=text;input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:text?'insertText':'deleteContentBackward',data:text||null}));},
    transient:error=>/页面正在切换|会话尚未加载|会话切换尚未完成|消息正在加载|最新文字尚未显示|会话列表正在变化|聊天页面正在切换/.test(error.message)
  };
  globalThis.ZhidaPageAdapters=api;
})();
