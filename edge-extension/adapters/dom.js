ZhidaPageAdapters.register('dom',(p,location)=>{
  const tools=ZhidaPageAdapters,s=p.selectors,a=p.attributes;
  const root=()=>tools.one(document,s.root),box=()=>tools.one(root(),s.conversation);
  const rows=()=>[...root().querySelectorAll(s.rows)].filter(tools.visible);
  function viewport(){return s.scroll?tools.one(root(),s.scroll):null;}
  function fault(){return s.blocked&&[...document.querySelectorAll(s.blocked)].some(tools.visible)?{code:'page-blocked',error:'当前网页有阻断提示，请处理后重新启动此页面接待'}:null;}
  const api={root,viewport,fault,
    editor:()=>tools.one(box(),s.input),
    row(id){const nodes=rows().filter(n=>n.getAttribute(a.row)===id);if(nodes.length!==1)throw Error('目标会话发生变化');return nodes[0];},
    open(target){const node=api.row(target.id);if((a.kind?node.getAttribute(a.kind):'c2c')!==target.kind)throw Error('会话类型发生变化');node.click();},
    back(){if(!s.back)throw Error('适配未配置会话列表返回入口');tools.one(root(),s.back).click();},
    fill:(input,text)=>tools.fill(input,text),readText:tools.readText,
    send(input){if(p.sendMode==='enter')input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));else{const button=tools.one(box(),s.send);if(button.disabled||button.getAttribute('aria-disabled')==='true')throw Error('发送按钮不可用');button.click();}},
    snapshot(){
      const blocked=fault();if(blocked)return {route:location.href,...blocked};
      const view=root(),rawAccount=view.getAttribute(a.account);if(!rawAccount?.trim())throw Error('未识别到当前登录账号');
      const account=p.id+':'+rawAccount,targets=rows().map(n=>({id:n.getAttribute(a.row),name:(n.getAttribute('aria-label')||n.innerText||'').trim().slice(0,100),kind:a.kind?n.getAttribute(a.kind):'c2c',unread:a.unread?Number(n.getAttribute(a.unread))||0:0,updated:0}));
      if(targets.some(t=>!t.id)||new Set(targets.map(t=>t.id)).size!==targets.length)throw Error('会话标识缺失或重复');
      const scroll=viewport(),result={route:location.href,account,targets,conversation:null,messages:[],inFolder:false,listScan:{supported:true,scrollable:!!scroll,top:scroll?.scrollTop||0,height:scroll?.scrollHeight||0,viewport:scroll?.clientHeight||0}};
      const boxes=[...view.querySelectorAll(s.conversation)].filter(tools.visible);if(!boxes.length)return result;if(boxes.length!==1)throw Error('会话内容无法唯一定位');
      const current=boxes[0],id=current.getAttribute(a.conversation);if(!id)throw Error('当前会话没有稳定标识');
      // URL and visible conversation must agree before any message can be sent.
      if(new URL(tools.conversationUrl(p,id)).pathname!==new URL(location.href).pathname)throw Error('会话切换尚未完成');
      const target=targets.find(t=>t.id===id);if(!target)throw Error('当前会话与列表不一致');
      result.conversation={id,kind:target.kind,name:s.name?tools.one(current,s.name).innerText.trim():target.name};
      const seen=new Set();
      for(const n of [...current.querySelectorAll(s.messages)].filter(tools.visible)){
        const mid=n.getAttribute(a.message),incoming=n.matches(s.incoming),outgoing=n.matches(s.outgoing);if(!mid||seen.has(mid)||incoming===outgoing)throw Error('消息标识或消息归属无法核对');seen.add(mid);
        const bodies=[...n.querySelectorAll(s.text)].filter(tools.visible);if(bodies.length>1)throw Error('消息正文无法唯一定位');
        const stamp=a.time?n.getAttribute(a.time):null;let time=stamp?Number(stamp):null;if(stamp&&!Number.isFinite(time))time=Date.parse(stamp);if(time>0&&time<1e11)time*=1000;
        result.messages.push({id:mid,role:incoming?'user':'assistant',type:bodies.length?1:2,content:bodies[0]?.innerText.trim()||'',media:bodies.length?'':'非文字消息',time:Number.isFinite(time)&&time>0?time:null,pending:n.getAttribute('data-send-state')==='pending',failed:n.getAttribute('data-send-state')==='failed'});
      }
      const input=api.editor(),button=s.send?tools.one(current,s.send):null;
      result.editable=(input.isContentEditable||input.matches('textarea,input[type="text"],input:not([type])'))&&!input.disabled&&!input.readOnly&&input.getAttribute('aria-disabled')!=='true'&&(!button||!button.disabled&&button.getAttribute('aria-disabled')!=='true');
      result.editorText=tools.readText(input);result.signature=JSON.stringify(result.messages.map(({id,role,type,content,pending,failed})=>({id,role,type,content,pending,failed})));
      return result;
    }
  };return api;
});
