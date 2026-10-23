const $=id=>document.getElementById(id);
let current='',space=null,session=null,last=null,busy=false;
let pendingOnly=false;
let editingFactId='';
function clearFactEdit(){editingFactId='';$('fact-form').reset();}
function filterKnowledge(){
  const cards=[...$('facts').children];for(const card of cards)card.hidden=pendingOnly&&card.dataset.approved==='1';
  const count=space.facts.filter(f=>!pendingOnly||!f.approved).length;
  $('knowledge-filter-status').textContent=`${pendingOnly?'待审核':'全部知识'}：${count} 条`;
  $('knowledge-filter-toggle').textContent=pendingOnly?'显示全部知识':'只看待审核';
  $('knowledge-filter-empty').hidden=!pendingOnly||count>0;
}
function openPendingKnowledge(){show('knowledge');pendingOnly=true;filterKnowledge();const list=$('facts').closest('article');list.scrollIntoView({behavior:'smooth',block:'start'});list.focus({preventScroll:true});}
let accessToken='';
function notice(text=''){$('notice').textContent=text;}
async function api(path,body){
  const res=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await res.json();if(!res.ok)throw new Error(value.error);return value;
}
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
function action(text,handler,cls='secondary'){const b=el('button',text,cls);b.type='button';b.onclick=()=>run(handler,b);return b;}
async function run(fn,button){try{notice();if(button)button.disabled=true;await fn();}catch(e){notice(e.message);}finally{if(button)button.disabled=false;}}
function show(tab){document.querySelectorAll('.tab').forEach(n=>n.hidden=n.id!==tab);document.querySelectorAll('nav button').forEach(n=>n.classList.toggle('selected',n.dataset.tab===tab));}
const debugGuide=el('article',undefined,'card');debugGuide.id='local-debug-guide';debugGuide.hidden=true;debugGuide.append(el('h2','本地问答调试 · 不连接小红书'),el('p','这里仅测试所选业务的知识和回答，不读取或发送小红书消息。知答扩展保持停用即可。发送测试问题时会调用已配置的模型。'),el('p','验证实际接待知识请选择“发布：当前生效快照”；验证刚修改的资料请选择草稿模式。回答不准确时核对下方引用，修正知识后重新审核、发布。'));$('chat').prepend(debugGuide);
function openLocalDebug(){debugGuide.hidden=location.hash!=='#debug';if(!debugGuide.hidden)show('chat');}
const debugOpen=action('本地问答调试',()=>{location.hash='debug';openLocalDebug();},'text');debugOpen.id='local-debug-open';document.querySelector('.aside-bottom').prepend(debugOpen);addEventListener('hashchange',openLocalDebug);
function reset(){session=null;last=null;$('messages').replaceChildren(el('p','开始新的测试对话。每个会话只属于当前业务。','muted'));$('sources').textContent='等待新的问题。';$('correct').disabled=true;}
async function releaseDiff(){
  const diff=await api(`spaces/${current}/release-diff`);let hint=$('release-hint');if(!hint){hint=el('div');hint.id='release-hint';hint.setAttribute('role','status');document.querySelector('.steps').after(hint);}
  hint.hidden=!diff.changed&&!diff.pending;hint.replaceChildren(el('strong',diff.changed?'有未发布修改：当前客服仍使用已发布版本。':`有 ${diff.pending} 条待审核知识，审核并发布后客服才会使用。`));if(diff.changed)hint.append(action('查看差异并发布',()=>$('publish').onclick()));if(diff.pending)hint.append(action('查看待审核知识',openPendingKnowledge));return diff;
}
function confirmRelease(diff,{title='确认发布变更',confirmText='确认发布',notes=[]}={}){return new Promise(resolve=>{
  const dialog=el('dialog');dialog.style.cssText='max-width:850px;max-height:85vh;overflow:auto;padding:24px;border:1px solid #bdcdbd;border-radius:12px';dialog.append(el('h2',title));for(const note of notes)dialog.append(el('p',note));
  const before=new Map(diff.old.facts.map(f=>[f.id,f])),after=new Map(diff.next.facts.map(f=>[f.id,f]));
  if(diff.old.rules!==diff.next.rules){dialog.append(el('h3','客服规则'),el('p','原规则：'+diff.old.rules),el('p','新规则：'+diff.next.rules));}
  for(const [id,f] of before)if(!after.has(id))dialog.append(el('p','撤回：'+f.question+' → '+f.answer));
  for(const [id,f] of after)if(!before.has(id)||JSON.stringify(f)!==JSON.stringify(before.get(id)))dialog.append(el('p','新增或修改：'+f.product+' / '+f.question+' → '+f.answer+'（'+f.source+'）'));
  if(!diff.changed)dialog.append(el('p','没有未发布的内容变更。'));
  let settled=false;const done=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};dialog.append(action(confirmText,()=>done(true)),action('取消',()=>done(false),'text'));dialog.oncancel=e=>{e.preventDefault();done(false);};document.body.append(dialog);dialog.showModal();
});}
async function loadSpaces(selectId=current){const list=await api('spaces');$('spaces').replaceChildren(...list.map(s=>{const o=el('option',s.name);o.value=s.id;return o;}));current=list.some(s=>s.id===selectId)?selectId:list[0]?.id||'';$('spaces').value=current;$('workspace').hidden=!current;$('empty').hidden=!!current;if(current)await refresh();}
async function refresh(){space=await api('spaces/'+current);$('title').textContent=space.name;$('rules').value=space.rules;$('count').textContent=space.facts.length;$('approved').textContent=space.facts.filter(f=>f.approved).length;$('release').textContent=space.active?'v'+(space.versions.length-space.versions.findIndex(v=>v.id===space.active)):'未发布';
  $('facts').replaceChildren();
  if(!space.facts.length)$('facts').append(el('p','还没有知识。先添加一条产品问答，或导入示例知识包。','muted'));
  for(const f of space.facts){const box=el('div',undefined,'fact');box.dataset.factId=f.id;box.dataset.approved=String(f.approved?1:0);box.append(el('span',`${f.product} · ${f.approved?'已审核':'待审核'}`,'badge'),el('h3',f.question),el('p',f.answer),el('p','依据：'+f.source,'muted'));const row=el('div',undefined,'row');row.append(action(f.approved?'撤回审核':'审核通过',async()=>{await api(`spaces/${current}/fact-state`,{id:f.id,approved:!f.approved});await refresh();}),action('以此修正',()=>{if(f.data&&!f.reference){globalThis.__zhidaEditProduct?.(f);return;}if(f.reference){notice('此问答引用统一资料，请修改原资料或解除引用后编辑。');return;}show('knowledge');editingFactId=f.id;const form=$('fact-form');for(const k of ['product','question','answer','source'])form.elements[k].value=f[k];notice('正在修正原条目：保存成功后替换原内容，不新增重复待办；已发布版本保持不变，审核发布后才更新正式回复。');form.scrollIntoView({behavior:'smooth'});},'text'),action('删除',async()=>{if(!confirm('删除草稿知识？历史发布快照仍保留。'))return;await api(`spaces/${current}/fact-delete`,{id:f.id});await refresh();},'text'));box.append(row);$('facts').append(box);}
  $('versions-list').replaceChildren();for(const [i,v] of space.versions.entries()){const row=el('div',undefined,'version');row.append(el('span',`v${space.versions.length-i} · ${new Date(v.created).toLocaleString()}${space.active===v.id?' · 当前生效':''}`));if(space.active!==v.id)row.append(action('查看差异并切换',()=>globalThis.__zhidaSwitchVersion(v.id)));$('versions-list').append(row);}
  filterKnowledge();
  await releaseDiff();
  await globalThis.__zhidaRefreshChannel?.();
  await globalThis.__zhidaRefreshRecords?.();
  await globalThis.__zhidaRefreshInterview?.();
  await globalThis.__zhidaRefreshQuality?.();
  await globalThis.__zhidaRefreshProducts?.();
  await globalThis.__zhidaRefreshMaintenance?.();
}
async function newSpace(){const name=prompt('业务空间名称，例如：服装客服');if(!name?.trim())return;const r=await api('spaces',{name});reset();clearFactEdit();await loadSpaces(r.id);show('knowledge');}
const knowledgeList=$('facts').closest('article');knowledgeList.id='knowledge-list';knowledgeList.tabIndex=-1;
knowledgeList.querySelector('.row .muted').textContent='以此修正后保存，会替换原条目；仍需审核发布';
const filterToggle=action('只看待审核',()=>{pendingOnly=!pendingOnly;filterKnowledge();});filterToggle.id='knowledge-filter-toggle';
const filterStatus=el('span','', 'muted');filterStatus.id='knowledge-filter-status';filterStatus.setAttribute('role','status');knowledgeList.querySelector('.row').append(filterStatus,filterToggle);
const filterEmpty=el('p','没有待审核知识，可以点击“显示全部知识”查看其他条目。','muted');filterEmpty.id='knowledge-filter-empty';filterEmpty.hidden=true;$('facts').after(filterEmpty);
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>show(b.dataset.tab));
$('new-space').onclick=()=>run(newSpace);$('create-first').onclick=()=>run(newSpace);
$('spaces').onchange=()=>{if(busy){$('spaces').value=current;notice('请等待当前回答完成再切换业务');return;}current=$('spaces').value;pendingOnly=false;clearFactEdit();reset();run(refresh);};
$('fact-form').onsubmit=e=>{e.preventDefault();run(async()=>{const revising=!!editingFactId,data=Object.fromEntries(new FormData(e.target));if(revising)data.id=editingFactId;await api(`spaces/${current}/${revising?'fact-revise':'facts'}`,data);clearFactEdit();await refresh();notice(revising?'修正已保存，原内容已替换；请核对后审核并发布。':'知识已保存，请核对后点击审核通过。');},e.submitter);};
$('cancel-edit').onclick=clearFactEdit;
$('save-rules').onclick=()=>run(async()=>{await api(`spaces/${current}/rules`,{rules:$('rules').value});await releaseDiff();notice('规则已保存，发布版本后正式生效。');},$('save-rules'));
$('file').onchange=()=>run(async()=>{const file=$('file').files[0];if(!file)return;if(file.size>1024*1024)throw new Error('文件最大1MB');const data=JSON.parse(await file.text());await api(`spaces/${current}/import`,{facts:Array.isArray(data)?data:data.facts});if(!Array.isArray(data)&&data.rules)await api(`spaces/${current}/rules`,{rules:data.rules});$('file').value='';await refresh();notice('导入完成，请逐条审核知识和客服规则。');});
$('export').onclick=()=>run(async()=>{const data=await api(`spaces/${current}/export`);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='knowledge-pack.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('publish').onclick=()=>run(async()=>{await globalThis.__zhidaCheckRelease?.();if(!await confirmRelease(await releaseDiff()))return;await api(`spaces/${current}/publish`,{});reset();await refresh();notice('版本已发布，可在问答实验室选择发布模式验证。');},$('publish'));
$('reset-chat').onclick=()=>{if(!busy)reset();};$('mode').onchange=reset;
$('chat-form').onsubmit=e=>{e.preventDefault();if(busy)return;run(async()=>{busy=true;$('mode').disabled=true;$('reset-chat').disabled=true;$('spaces').disabled=true;$('new-space').disabled=true;
  const question=$('question').value;const user=el('div',question,'bubble user');$('messages').append(user);$('question').value='';
  try{const r=await api(`spaces/${current}/chat`,{question,mode:$('mode').value,session});session=r.session;last={question,...r};const bubble=el('div',r.answer,'bubble');bubble.append(el('small',`${r.engine==='deepseek'?'DeepSeek':r.engine==='rules'?'本地接待规则':'本地标准问答'} · ${{answer:'回答',clarify:'需澄清',handoff:'需人工',skip:'跳过'}[r.action]}`));$('messages').append(bubble);$('sources').replaceChildren();if(!r.sources.length)$('sources').append(el('p','未找到可用依据。'));for(const s of r.sources){const item=el('div',undefined,'fact');item.append(el('strong',s.product),el('p',s.question),el('p',s.answer),el('p',s.source,'muted'));$('sources').append(item);}$('correct').disabled=false;}
  catch(err){$('messages').append(el('div','本次回答失败，未计入会话。请重试。','bubble'));$('question').value=question;throw err;}
  finally{busy=false;$('mode').disabled=false;$('reset-chat').disabled=false;$('spaces').disabled=false;$('new-space').disabled=false;$('messages').scrollTop=$('messages').scrollHeight;}
},$('send'));};
$('correct').onclick=()=>{if(!last)return;clearFactEdit();show('knowledge');const f=$('fact-form');f.elements.question.value=last.question;f.elements.product.value=last.sources[0]?.product||'';f.elements.answer.value='';f.elements.source.value='';notice('填写正确答案与资料来源，保存后审核。如旧知识有误，请先撤回旧条目。');f.scrollIntoView({behavior:'smooth'});};
$('auth').onclick=()=>{accessToken=prompt('管理访问令牌，仅保存在本次页面内存中')||'';run(init);};
$('demo').onclick=()=>run(async()=>{const r=await api('spaces',{name:'服装客服 · 演示',rules:'你是服装客服。先确认商品型号。尺寸推荐必须有尺码表，不得仅凭身高保证合身。资料为演示，不用于真实销售。'});await api(`spaces/${r.id}/import`,{facts:[{product:'A01 演示短袖',question:'A01 的面料是什么？',answer:'演示资料：A01 面料为100%棉。此数据仅用于功能测试，不能用于真实商品承诺。',source:'内置演示资料 / 非真实商品'},{product:'A01 演示短袖',question:'A01 怎么洗？',answer:'演示资料：建议按产品洗标处理；当前没有温度及烘干依据，请向人工确认。',source:'内置演示资料 / 非真实商品'}]});await loadSpaces(r.id);notice('演示资料已载入。请审核一条知识，然后到问答实验室输入它的标准问题。');},$('demo'));
async function init(){const s=await api('status');$('model-state').textContent=s.configured?`DeepSeek · ${s.model}`:'未配置模型 · 标准问答模式';await loadSpaces();openLocalDebug();}
run(init);
