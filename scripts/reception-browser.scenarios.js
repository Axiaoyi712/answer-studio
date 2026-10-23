// Isolated reception acceptance. No live platform/model requests.
const events=[],learned=[],notices=[],runStates=[];const realMessage=chrome.runtime.sendMessage;
let failures=0,customReply=null,knowledgeValid=true,validationBudget=Infinity;let modelGeneration='initial',delayedFailure=0;const healthReports=[],draftContexts=[],draftDeadlines=[];
chrome.storage.local.remove=async key=>{delete storage[key];};
chrome.runtime.sendMessage=async m=>{
  if(m.action==='record'){events.push(m.record);return {data:{ok:true}};}
  if(m.action==='heartbeat'){healthReports.push(m);return {data:{ok:true}};}
  if(m.action==='validate-reply')return {data:{valid:knowledgeValid&&validationBudget-->0}};
  if(m.action==='channel')return {data:{maxReplyAgeHours:globalThis.__zhidaProfile?.type==='dom'?0:24}};
  if(m.action==='status')return {data:{configured:true,generation:modelGeneration}};
  if(m.action==='runState'){runStates.push(m.desired);storage[ZhidaPageAdapters.stateKey('receptionSession',globalThis.__zhidaProfile||ZhidaPageAdapters.builtin)]={account:m.account,desired:m.desired,space:globalThis.__zhidaSpace};return {data:{ok:true}};}
  if(m.action==='notify'){notices.push(m);return {data:{notified:true}};}
  if(m.action==='completeCase')return {data:{ok:true}};
  if(m.action==='learn'){learned.push(m.fact);return {data:{ok:true}};}
  if(m.action==='prepare-knowledge')return {data:{product:'整理后的测试商品',question:'整理后的问题',answer:'经核实的人工答案',source:'',reviewRequired:true}};
  if(m.action==='draft'){
    draftContexts.push([m.account,m.conversation]);draftDeadlines.push(m.deadline);requests++;if(delayedFailure){const delay=delayedFailure;delayedFailure=0;await sleep(delay);throw Error('模拟请求超时');}questionCalls.push(m.question);if(failures>0){failures--;throw Error('模拟服务不可用');}
    if(holdDraft)await new Promise(resolve=>draftRelease=resolve);
    if(customReply)return {data:customReply};
    if(m.question.includes('超纲'))return {data:{action:'handoff',answer:'需人工核实',reason:'缺少商品依据',sources:[],engine:'deepseek'}};
    if(m.question.includes('模糊'))return {data:{action:'clarify',answer:'请说明具体需求',sources:[],engine:'deepseek'}};
    return {data:{action:'answer',answer:'已审核的商品答复：'+m.question,sources:[{id:'f',product:'示例商品',question:'说明',answer:'示例依据'}],engine:'deepseek'}};
  }
  return realMessage(m);
};
const baseRender=render;render=()=>{for(const rows of Object.values(messages))for(const m of rows)m.timestamp??=Date.now();baseRender();};
chats.a.unreadCount=chats.b.unreadCount=chats.c.unreadCount=0;
let seq=0;
function incoming(id,text,type=1,time=Date.now()){const key='new'+(++seq);messages[id].push({uuid:key,messageId:key,senderId:'visitor',contentType:type,text,timestamp:time});chats[id].unreadCount=current===id?0:1;render();return key;}
function selected(id){current=id;inFolder=id==='b';chats[id].unreadCount=0;fakeLocation.pathname='/chat/'+id;render();}
const until=async(fn,label,limit=30000)=>{for(let t=0;t<limit;t+=150){if(fn()){await sleep(1200);return;}await sleep(150);}throw Error(label+' / '+panel?.getElementById('status').textContent);};
const count=()=>sendCount;
const isRunning=()=>{panel.getElementById('diagnose').click();return JSON.parse(panel.getElementById('diagnostic').textContent).running;};
const ckey=id=>ZhidaInboxPolicy.caseKey('me',id);
async function resume(id){const b=[...panel.querySelectorAll('.handoff-card button')].find(b=>b.textContent==='人工已完成，恢复自动接待'&&b.closest('article').querySelector('a')?.href.endsWith('/'+id));if(!b)throw Error('缺少恢复按钮 '+id);b.click();await until(()=>storage[ckey(id)]?.state==='active','恢复客户');}
async function pause(){panel.getElementById('stop').click();await sleep(1600);}
(async()=>{
 try{
  storage.receptionTheme='night';delete storage.receptionThemePalette;
  selected('a');new Function(sources['auto-policy'])();new Function(sources['inbox-policy'])();new Function(sources['handoff-reasons'])();new Function(sources.reception)();new Function('location',sources.inbox)(fakeLocation);await sleep(200);
  check(panel.host.dataset.theme==='day'&&storage.receptionTheme==='day','升级后默认暖纸主题，不沿用之前的深色偏好');
  panel.getElementById('daily').style.transition='none';const themeControl=panel.getElementById('theme');themeControl.value='day';await themeControl.onchange();
  check(panel.host.dataset.theme==='day'&&getComputedStyle(panel.getElementById('panel')).backgroundColor==='rgb(255, 250, 242)'&&storage.receptionTheme==='day','日间暖纸墨棕主题并保存选择');
  themeControl.value='night';await themeControl.onchange();await sleep(250);check(panel.host.dataset.theme==='night'&&getComputedStyle(panel.getElementById('daily')).backgroundColor==='rgb(155, 206, 255)','夜间主题使用墨黑背景与冰蓝按钮');
  themeControl.value='auto';await themeControl.onchange();const bodyStyle=document.body.getAttribute('style');document.body.style.backgroundColor='#fff';await sleep(250);
  check(panel.host.dataset.theme==='day','自动主题识别页面变为白色');document.body.style.backgroundColor='transparent';await sleep(250);check(panel.host.dataset.theme===(matchMedia('(prefers-color-scheme: dark)').matches?'night':'day'),'页面底色透明时自动主题跟随系统设置');if(bodyStyle===null)document.body.removeAttribute('style');else document.body.setAttribute('style',bodyStyle);await sleep(250);check(panel.host.dataset.theme==='night','自动主题识别页面恢复深色，不影响接待模式');
  const normalSend=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>m.action==='pageSnapshot'?{data:{error:'模拟页面识别失败'}}:normalSend(m);
  panel.getElementById('start').click();await sleep(300);check(panel.getElementById('status').dataset.state==='error'&&getComputedStyle(panel.getElementById('status')).backgroundColor==='rgb(69, 28, 32)','启动失败显示红色报错');chrome.runtime.sendMessage=normalSend;
  panel.getElementById('start').click();await sleep(7000);check(!requests&&!sendCount,'检测模式不调用模型、不发送');await pause();
  check(panel.getElementById('status').dataset.state==='paused','手动暂停显示等待色，不误报为错误');
  panel.getElementById('minimize').click();check(panel.host.classList.contains('compact')&&getComputedStyle(panel.getElementById('panel')).display==='none'&&getComputedStyle(panel.getElementById('ball')).display!=='none'&&panel.host.offsetWidth===64,'缩小为悬浮球，面板真正隐藏且不占宽');panel.getElementById('ball').click();check(!panel.host.classList.contains('compact')&&getComputedStyle(panel.getElementById('panel')).display!=='none','点击悬浮球展开完整面板');
  const handle=panel.getElementById('drag'),left=panel.host.getBoundingClientRect().left;handle.setPointerCapture=()=>{};handle.onpointerdown({button:0,clientX:100,clientY:100,pointerId:1});handle.onpointermove({clientX:50,clientY:130});handle.onpointerup();check(panel.host.getBoundingClientRect().left<left&&Number.isFinite(storage.receptionPanel.left),'拖动标题改变位置并记住位置');
  const normalRect=panel.host.getBoundingClientRect(),field=document.createElement('textarea');field.value='尚未保存的知识修改';panel.getElementById('panel').append(field);
  panel.getElementById('maximize').click();const largeRect=panel.host.getBoundingClientRect();
  check(largeRect.width>normalRect.width&&largeRect.left>=0&&largeRect.right<=innerWidth&&largeRect.bottom<=innerHeight&&field.value==='尚未保存的知识修改','放大编辑窗口位于屏幕内并保留未保存内容');
  panel.getElementById('minimize').click();panel.getElementById('ball').click();check(panel.host.offsetWidth===largeRect.width,'放大窗口收成悬浮球后展开仍保持放大');
  panel.getElementById('maximize').click();const restoredRect=panel.host.getBoundingClientRect();check(restoredRect.width===normalRect.width&&Math.abs(restoredRect.left-normalRect.left)<1&&Math.abs(restoredRect.top-normalRect.top)<1&&field.value==='尚未保存的知识修改','还原原窗口大小和位置且不丢失修改');field.remove();
  panel.getElementById('daily').click();await until(()=>sendCount===1,'首次日常接待');check(runStates.at(-1)===true,'启动后持久保存接待意图');await until(()=>events.some(e=>e.state==='answer'),'回复记录保存');check(events.some(e=>e.state==='answer'),'已回复记录同步到本机服务');
  check(panel.getElementById('status').dataset.state==='running'&&getComputedStyle(panel.getElementById('status')).backgroundColor==='rgb(18, 51, 33)','故障恢复并正常接待后显示绿色');
  const start=count();incoming('a','第一条');await sleep(1200);incoming('a','第二条');await sleep(1400);check(count()===start,'顾客连发时等待短暂停顿，不逐条发送');await until(()=>count()===start+1,'合并回复');check(questionCalls.at(-1).includes('第一条\n第二条'),'多条消息按顺序合并回复');
  await sleep(1500);holdDraft=true;draftRelease=null;incoming('c','已读仍待回复');incoming('a','生成中');await until(()=>!!draftRelease,'进入生成中');chats.c.unreadCount=0;holdDraft=false;draftRelease();await until(()=>messages.c.some(m=>m.senderId==='me'&&m.text.includes('已读仍待回复')),'已读队列接待',45000);check(true,'发现过的任务变成已读也会继续接待');
  selected('a');await sleep(1600);const draftKey=ZhidaInboxPolicy.draftKey('me','a');let keptInput=document.querySelector('.xhs-im-input-bar-editor');
  keptInput.textContent='人工草稿：请保留\n第二行';keptInput.dispatchEvent(new InputEvent('input',{bubbles:true}));
  await until(()=>storage[draftKey]?.text==='人工草稿：请保留\n第二行','保存当前草稿');const keptSends=count();incoming('c','草稿期间的其他咨询');
  await until(()=>messages.c.some(m=>m.senderId==='me'&&m.text.includes('草稿期间的其他咨询')),'草稿不阻塞其他客户',45000);
  check(count()===keptSends+1&&storage[draftKey]?.text.includes('第二行')&&isRunning(),'草稿按会话保存，其他客户仍自动回复且未发送草稿');
  selected('a');await until(()=>document.querySelector('.xhs-im-input-bar-editor')?.textContent===storage[draftKey]?.text,'返回恢复草稿');
  check(panel.getElementById('savedDrafts').textContent.includes('测试客户 A'),'面板可查看保留的草稿及客户');
  await pause();globalThis.__zhidaAutoClose();selected('a');new Function('location',sources.inbox)(fakeLocation);panel.getElementById('daily').click();
  await until(()=>document.querySelector('.xhs-im-input-bar-editor')?.textContent==='人工草稿：请保留\n第二行','重开后草稿恢复');
  check(count()===keptSends+1&&storage[draftKey].account==='me','重开助手后草稿仍恢复且不自动发送');
  keptInput=document.querySelector('.xhs-im-input-bar-editor');keptInput.textContent='';keptInput.dispatchEvent(new InputEvent('input',{bubbles:true}));
  await until(()=>!storage[draftKey],'清空后移除草稿备份');incoming('a','清空草稿后的新咨询');await until(()=>messages.a.some(m=>m.senderId==='me'&&m.text.includes('清空草稿后的新咨询')),'清空后恢复原客户');
  check(panel.getElementById('savedDrafts').hidden,'草稿清空后原客户继续自动接待并移除备份');
  incoming('c','草稿保存失败恢复后的咨询');selected('a');const failSaveInput=document.querySelector('.xhs-im-input-bar-editor');failSaveInput.textContent='保存失败也不能丢的草稿';
  const realSet=chrome.storage.local.set,beforeFailedSave=count();chrome.storage.local.set=async value=>{if(Object.keys(value).some(k=>k.startsWith('inbox-draft:')))throw Error('模拟草稿保存失败');return realSet(value);};
  await until(()=>!isRunning(),'草稿保存失败停止切换');
  check(current==='a'&&failSaveInput.textContent==='保存失败也不能丢的草稿'&&count()===beforeFailedSave&&panel.getElementById('status').dataset.state==='error','草稿保存失败保留原输入并报错，禁止切换后丢稿');chrome.storage.local.set=realSet;
  panel.getElementById('daily').click();await until(()=>messages.c.some(m=>m.senderId==='me'&&m.text.includes('草稿保存失败恢复后的咨询')),'草稿保存恢复后其他接待');
  selected('a');await until(()=>document.querySelector('.xhs-im-input-bar-editor')?.textContent==='保存失败也不能丢的草稿','保存失败恢复的草稿');
  check(storage[draftKey]?.text==='保存失败也不能丢的草稿','保存功能恢复后先备份草稿再接待其他顾客');
  await pause();globalThis.__zhidaAutoClose();selected('a');document.querySelector('.xhs-im-input-bar-editor').textContent='页面上更新的人工草稿';
  storage[ZhidaInboxPolicy.draftKey('other','a')]={account:'other',conversation:'a',text:'另一个账号的草稿'};
  new Function('location',sources.inbox)(fakeLocation);panel.getElementById('daily').click();await until(()=>storage[draftKey]?.text==='页面上更新的人工草稿','保留页面上的新草稿');
  check(document.querySelector('.xhs-im-input-bar-editor').textContent==='页面上更新的人工草稿'&&!panel.getElementById('savedDrafts').textContent.includes('另一个账号'),'旧备份不覆盖页面新草稿，其他账号的草稿不显示');
  document.querySelector('.xhs-im-input-bar-editor').textContent='';await until(()=>!storage[draftKey],'新草稿清空后恢复');
  selected('a');await sleep(1600);panel.getElementById('takeover').click();await until(()=>storage[ckey('a')]?.state==='manual','人工接管');await until(isRunning,'恢复整体接待');check(isRunning(),'接管一个客户不停止整体接待');incoming('c','人工期间其他咨询');await until(()=>messages.c.some(m=>m.senderId==='me'&&m.text.includes('人工期间其他咨询')),'其他客户继续');check(true,'人工处理 A 时其他客户继续收到回复');
  const manualLink=[...panel.querySelectorAll('.handoff-card a')].find(a=>a.href.endsWith('/a'));manualLink.click();await sleep(600);check(manualCalls.at(-1)==='a'&&fakeLocation.pathname==='/chat/c','人工入口打开独立窗口，不导航自动客服');
  messages.a.push({uuid:'human-answer',messageId:'human-answer',senderId:'me',contentType:1,text:'人工已经核实的答案',timestamp:Date.now()});
  const waitId=incoming('a','交回后新问题');await resume('a');await until(()=>messages.a.some(m=>m.senderId==='me'&&m.text.includes('交回后新问题')),'恢复后回复新问题');check(storage[ckey('a')].handled.includes(waitId),'恢复处理新问题，不补发人工原待办');
  selected('c');incoming('c','超纲价格');const beforeNotice=count();await until(()=>storage[ckey('c')]?.noticeSent,'超纲等待说明',45000);check(count()===beforeNotice+1&&messages.c.at(-1).text==='不好意思，请稍等','转人工只发送一次等待说明');await sleep(6000);check(count()===beforeNotice+1,'待办未完成不重复发送等待说明');check(notices.some(n=>n.conversation==='c'),'新增人工待办触发桌面通知请求');check(panel.getElementById('ball').getAttribute('aria-label').includes('待办')&&!panel.getElementById('ballBadge').hidden&&!!panel.getElementById('ball').querySelector('svg'),'悬浮球显示待办数量');
  const detail=[...panel.querySelectorAll('.handoff-card details')].find(d=>d.closest('article').querySelector('a')?.href.endsWith('/c'));detail.open=true;await sleep(300);check(detail.textContent.includes('超纲价格')&&detail.querySelector('form'),'待办详情包含问题、历史和知识整理表单');const f=detail.querySelector('form');[...f.querySelectorAll('button')].find(b=>b.textContent==='用 AI 提炼知识草稿').click();await sleep(300);check(f.elements.question.value==='整理后的问题'&&f.elements.source.value===''&&!learned.length,'模型先整理可编辑草稿，不直接写知识或编造来源');f.elements.product.value='测试商品';f.elements.answer.value='人工确认答案';f.elements.source.value='官方产品资料';f.requestSubmit();await sleep(300);check(learned.length===1&&learned[0].answer==='人工确认答案','人工答案保存为待审核知识，不自动发布');
  await resume('c');incoming('c','图片咨询',2);await until(()=>storage[ckey('c')]?.state==='handoff'&&storage[ckey('c')]?.noticeSent,'非文字转人工',45000);check(storage[ckey('c')].reason.includes('非文字'),'图片消息转人工而非被忽略');check(panel.getElementById('handoffs').textContent.includes('非文字待查看'),'人工卡片显示具体待办分类');
  await resume('c');incoming('c','模糊需求一');let n=count();await until(()=>count()>n,'第一轮追问');await sleep(1300);incoming('c','模糊需求二');n=count();await until(()=>count()>n,'第二轮追问');await sleep(1300);incoming('c','模糊需求三');await until(()=>storage[ckey('c')]?.state==='handoff','追问上限',45000);check(storage[ckey('c')].reason.includes('两轮'),'最多两轮澄清，之后转人工');
  await resume('c');incoming('c','一个月前的咨询',1,Date.now()-31*86400000);n=count();await until(()=>storage[ckey('c')]?.state==='handoff','历史待确认');check(count()===n&&storage[ckey('c')].reason.includes('历史待确认'),'旧消息不自动补发，仅进入历史待确认');
  await resume('c');failures=2;incoming('c','暂时断网后恢复');n=requests;await until(()=>messages.c.some(m=>m.senderId==='me'&&m.text.includes('暂时断网后恢复')),'两次重试恢复',45000);check(requests===n+3&&new Set(draftDeadlines.slice(-3)).size===1,'短暂网络失败最多重试两次，共用同一个总截止时间');
  await sleep(1300);failSend=true;incoming('c','发送无法确认');await until(()=>storage[ckey('c')]?.state==='uncertain','不明确发送状态',45000);check(isRunning(),'发送结果不明确只隔离该客户，不停止整体');const unknown=count();failSend=false;incoming('a','异常隔离后其他咨询');await until(()=>messages.a.some(m=>m.senderId==='me'&&m.text.includes('异常隔离后其他咨询')),'异常后继续其他客户');check(count()===unknown+1,'不明确的发送不重试，其他客户继续回复');
  selected('a');const draft=document.querySelector('.xhs-im-input-bar-editor');draft.textContent='人工草稿';draft.dispatchEvent(new InputEvent('input',{bubbles:true}));await sleep(6500);check(isRunning()&&panel.getElementById('health').textContent.includes('保留草稿'),'专用页草稿保留并明显显示隔离状态');check(draft.textContent==='人工草稿','不覆盖人工草稿');draft.textContent='';draft.dispatchEvent(new InputEvent('input',{bubbles:true}));await until(()=>!storage[ZhidaInboxPolicy.draftKey('me','a')],'清空草稿同步完成');
  hidden=true;focused=false;incoming('a','后台的新问题');await until(()=>messages.a.some(m=>m.senderId==='me'&&m.text.includes('后台的新问题')),'后台接待');check(backgroundFocus===0,'切到后台仍接待且不抢输入框焦点');
  check(healthReports.some(h=>h.running&&h.lastRead>0)&&draftContexts.every(([a,c])=>a==='me'&&!!c),'独立心跳上报运行进度，模型请求按账号与会话隔离记忆');
  customReply={action:'answer',answer:'已核实规格。不好意思，请稍等',sources:[{id:'f'}],engine:'deepseek',followUp:{questions:['能刻字吗？']},reason:'部分问题缺少资料',reasonCode:'knowledge-missing'};
  let partialBefore=count();incoming('a','规格与刻字问题');await until(()=>storage[ckey('a')]?.state==='handoff'&&storage[ckey('a')]?.question==='能刻字吗？','部分回答转人工',45000);check(count()===partialBefore+1&&events.some(e=>e.state==='handoff'&&e.question==='能刻字吗？'&&e.answer.includes('已核实规格')),'多问题先发有依据的部分，未答问题单独进入人工且不重复发等待通知');
  customReply=null;messages.b.push({uuid:'b-human-baseline',messageId:'b-human-baseline',senderId:'me',contentType:1,text:'人工已处理原问题',timestamp:Date.now()});incoming('b','部分问题转人工后的其他咨询');await until(()=>messages.b.some(m=>m.senderId==='me'&&m.text.includes('部分问题转人工后的其他咨询')),'其他客户继续接待',45000);check(isRunning(),'部分问题转人工不停止其他客户接待');await resume('a');selected('a');
  customReply={action:'answer',answer:'已审核但随后撤回的答复',sources:[{id:'f'}],engine:'deepseek',knowledgeSignature:'fake-signature',version:'test'};validationBudget=1;
  const revokedBefore=count();incoming('a','发送前撤回知识');await until(()=>storage[ckey('a')]?.state==='handoff','发送前撤回拦截',45000);check(count()===revokedBefore&&document.querySelector('.xhs-im-input-bar-editor').textContent==='已审核但随后撤回的答复','填写后再次核实知识，已被停用则禁止发送并保留草稿核对');
  customReply=null;validationBudget=Infinity;document.querySelector('.xhs-im-input-bar-editor').textContent='';await resume('a');
  delayedFailure=22500;const beforeTimeout=requests;incoming('a','模拟慢请求');await until(()=>storage[ckey('a')]?.state==='handoff'&&storage[ckey('a')]?.noticeSent,'统一等待预算到期',50000);check(requests===beforeTimeout+1,'请求用完总等待预算后不继续重试');
  incoming('b','超时之后的其他咨询');await until(()=>messages.b.some(m=>m.senderId==='me'&&m.text.includes('超时之后的其他咨询')),'慢请求隔离后的接待',45000);check(isRunning(),'慢请求隔离后其他客户仍继续接待');
  modelGeneration='restored-test';await sleep(31000);await until(()=>!isRunning(),'恢复后停止旧代际任务');check(runStates.at(-1)===false&&panel.getElementById('status').textContent.includes('数据库已恢复'),'服务恢复代际变化后停止旧任务并提示重新核对');panel.getElementById('daily').click();await until(isRunning,'核对后重新启动');check(true,'用户主动重新启动后接受新的恢复代际');
  await pause();n=count();incoming('a','暂停期间问题');await sleep(7000);check(count()===n&&!isRunning()&&runStates.at(-1)===false,'手动暂停持久保存，之后不自动发送');
  const oldTime=Date.now()-91*86400000,oldKey='inbox:'+JSON.stringify(['me','archive-only',['old-message']]),oldTask=ZhidaReception.taskKey('me','archive-only');storage[oldKey]={state:'echo-confirmed',time:oldTime};storage[oldTask]={id:'archive-only',state:'done',time:oldTime};storage[ckey('archive-only')]={state:'active',handled:['old-message']};
  const archiveTransport=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>{if(m.action!=='archive-local')return archiveTransport(m);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(m.entries)));return {data:{count:m.entries.length,file:'isolated-browser-archive.json',sha256:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')}};};
  [...panel.getElementById('recent').querySelectorAll('button')].find(b=>b.textContent.includes('归档并清理')).click();await until(()=>!storage[oldKey]&&!storage[oldTask],'浏览器旧记录归档完成');check(!!storage[ckey('archive-only')]&&count()===n,'界面收到归档回执后清理旧任务，保留处理进度且不发送聊天消息');chrome.runtime.sendMessage=archiveTransport;
  panel.getElementById('loadRecent').click();await sleep(300);check(panel.getElementById('recentItems').textContent.includes('回答有误'),'已完成接待仍可查询、纠错和整理知识');
  const correction=[...panel.getElementById('recentItems').querySelectorAll('button')].find(b=>b.textContent.includes('回答有误'));correction.click();await sleep(500);check(panel.getElementById('handoffs').textContent.includes('回答有误'),'错误回答进入人工纠正待办');
  panel.getElementById('minimize').click();check(storage.receptionPanel.compact,'悬浮窗展开状态保存在本机');
  const previousSend=chrome.runtime.sendMessage;chrome.runtime.sendMessage=async m=>m.action==='pageSnapshot'?{data:{code:'platform-restricted',error:'平台显示限制访问'}}:previousSend(m);
  const sendsBeforeRestriction=count();panel.getElementById('daily').click();await sleep(500);
  check(!isRunning()&&panel.getElementById('daily').disabled&&panel.textContent.includes('不要反复点击启动')&&count()===sendsBeforeRestriction&&panel.getElementById('status').dataset.state==='error','平台限制锁定启动并显示红色恢复提示，不发送消息');
  chrome.runtime.sendMessage=previousSend;globalThis.__zhidaAutoClose();await sleep(200);
  const restrictionModal=document.createElement('div');restrictionModal.setAttribute('role','dialog');restrictionModal.textContent='限制访问 浏览器异常，请尝试关闭/卸载风险插件或重启试试';document.body.append(restrictionModal);
  globalThis.__zhidaSpace='fixture-space';storage.receptionSession={account:'me',space:'fixture-space',desired:true};
  let restrictedReads=0;chrome.runtime.sendMessage=async m=>{if(m.action==='pageSnapshot'){restrictedReads++;return {error:'聊天页面正在切换，请稍后重新启动'};}return previousSend(m);};
  new Function('location',sources.inbox)(fakeLocation);panel.getElementById('daily').click();await sleep(500);
  check(panel.getElementById('daily').disabled&&panel.getElementById('status').textContent.includes('平台限制访问')&&restrictedReads===0&&count()===sendsBeforeRestriction,'启动前已有限制弹窗时先停发，不因路由竞态误报会话切换或继续读取');
  check(storage.receptionSession.desired===false,'尚未读取账号时遇到限制也清除当前业务的自动恢复意图');
  restrictionModal.remove();globalThis.__zhidaAutoClose();chrome.runtime.sendMessage=previousSend;await sleep(200);
  new Function('location',sources.inbox)(fakeLocation);
  chrome.runtime.sendMessage=async m=>{if(m.action==='pageSnapshot')throw new Error('Extension context invalidated.');return previousSend(m);};
  panel.getElementById('daily').click();await sleep(500);
  check(!isRunning()&&panel.getElementById('daily').disabled&&[...panel.querySelectorAll('button')].some(b=>b.textContent==='刷新聊天页')&&count()===sendsBeforeRestriction&&panel.getElementById('status').dataset.state==='error','扩展失效停止旧助手并显示红色刷新提示，不发送消息');
  document.getElementById('results').textContent=JSON.stringify({ok:true,checks,sendCount,requests,records:events.length});
 }catch(e){document.getElementById('results').textContent=JSON.stringify({ok:false,error:e.message,checks,sendCount,requests,status:panel?.getElementById('status').textContent,records:events.length,storage,log:panel?.getElementById('log').textContent});}
})();
