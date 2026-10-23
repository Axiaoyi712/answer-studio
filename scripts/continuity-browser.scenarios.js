// Isolated virtual-list and queue acceptance; no real platform or model.
let virtualMode=true,foundVirtual=false;
chats.d={id:'d',name:'列表下方客户',kind:'c2c',unreadCount:1};messages.d=[{uuid:'d1',messageId:'d1',senderId:'visitor',contentType:1,text:'列表下方的咨询',timestamp:Date.now()}];messages.a=[];messages.b=[];messages.c=[];
const normalRender=render;
render=()=>{
 normalRender();if(!virtualMode||inFolder)return;const side=document.querySelector('.xhs-im-view__sidebar');side.style.cssText='height:100px;overflow-y:auto';
 const append=()=>{if(side.querySelector('[data-conv-id="d"]'))return;foundVirtual=true;const n=document.createElement('div');n.className='xhs-im-conv-item';n.dataset.convId='d';n.dataset.convKind='c2c';n.textContent='下方客户';n.onclick=()=>{current='d';chats.d.unreadCount=0;fakeLocation.pathname='/chat/d';render();};side.append(n);rootVNode.component.subTree.children.push(vnode('ConversationItem',n,{conv:chats.d}));};
 const spacer=document.createElement('div');spacer.style.height='400px';side.append(spacer);if(foundVirtual)append();side.onscroll=()=>{if(side.scrollTop>50)append();};
};
(async()=>{try{
 selected('a');check(!snapshot(fakeLocation).targets.some(t=>t.id==='d'),'初始列表尚未加载下方客户');
 for(const name of ['auto-policy','inbox-policy','handoff-reasons','reception'])new Function(sources[name])();new Function('location',sources.inbox)(fakeLocation);panel.getElementById('daily').click();
 await until(()=>messages.d.some(m=>m.senderId==='me'),'分批扫描发现下方客户并回复',65000);
 check(foundVirtual&&panel.getElementById('coverage').textContent.includes('本轮已发现'),'分批检查实际发现原先未加载的会话并显示覆盖范围');
 virtualMode=false;selected('a');incoming('a','第一轮问题');await until(()=>messages.a.some(m=>m.senderId==='me'&&m.text.includes('第一轮问题')),'完成第一轮');
 incoming('c','等候中的客户');incoming('a','当前客户继续提问');
 await until(()=>messages.c.some(m=>m.senderId==='me'&&m.text.includes('等候中的客户')),'轮到等待客户');
 await until(()=>messages.a.some(m=>m.senderId==='me'&&m.text.includes('当前客户继续提问')),'继续原客户');
 check(questionCalls.findIndex(q=>q.includes('等候中的客户'))<questionCalls.findIndex(q=>q.includes('当前客户继续提问')),'当前客户完成一轮后，先接待等待中的其他客户');
 check(events.some(e=>e.stage==='generated')&&events.some(e=>e.stage==='validated')&&events.some(e=>e.stage==='sending'),'接待保存生成、校验与准备发送阶段');
 const before=count();await pause();await sleep(6500);check(count()===before,'手动暂停后不再发送');
 document.getElementById('results').textContent=JSON.stringify({ok:true,checks,sendCount,requests});
}catch(e){document.getElementById('results').textContent=JSON.stringify({ok:false,error:e.message,checks,scan:snapshot(fakeLocation).listScan,coverage:panel?.getElementById('coverage').textContent,status:panel?.getElementById('status').textContent,log:panel?.getElementById('log').textContent});}})();
