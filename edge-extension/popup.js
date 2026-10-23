const $=id=>document.getElementById(id);
async function request(message){const r=await chrome.runtime.sendMessage(message);if(r?.error)throw new Error(r.error);return r.data;}
async function attempt(fn){$('status').textContent='';try{await fn();}catch(e){$('status').textContent=e.message;}}
let profiles=[];
async function loadProfiles(selected){
  profiles=await request({action:'profiles'});const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const id=selected||profiles.find(p=>{try{const u=new URL(tab?.url);return u.origin===p.origin&&(p.pathPrefix==='/'||u.pathname===p.pathPrefix||u.pathname.startsWith(p.pathPrefix+'/'));}catch{return false;}})?.id;
  $('profile').replaceChildren();for(const p of profiles){const option=document.createElement('option');option.value=p.id;option.textContent=p.name+' · '+p.id;$('profile').append(option);}if(id)$('profile').value=id;
}
async function start(startDaily){
  const profile=profiles.find(p=>p.id===$('profile').value);if(!profile)throw Error('请选择网页适配');
  // Browser site permission must be requested directly from this button gesture.
  const origin=new URL(profile.origin),pattern=origin.protocol+'//'+origin.hostname+'/*';
  if(!await chrome.permissions.request({origins:[pattern]}))throw Error('需要允许访问所选聊天站点，才能读取消息和填写回复');
  await spaces();const health=await request({action:'status'});if(!health.configured)throw Error('模型未配置，请先启动并配置本地客服服务');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('请先打开聊天网页');
  if(!$('space').value)throw Error('请选择已发布业务');await chrome.storage.local.set({lastSpace:$('space').value});
  await request({action:'arm',tab:tab.id,space:$('space').value,profileId:profile.id,mode:'auto',startDaily});window.close();
}
$('auto').onclick=()=>attempt(()=>start(true));$('inspect').onclick=()=>attempt(()=>start(false));
$('profile-file').onchange=()=>attempt(async()=>{const file=$('profile-file').files[0];if(!file)return;if(file.size>32768)throw Error('网页适配文件最多32KB');const profile=await request({action:'saveProfile',profile:JSON.parse(await file.text())});await loadProfiles(profile.id);$('status').textContent='已导入 '+profile.name+'。打开对应聊天网页后，可先检测再启动。';});
async function spaces(){
  let service;try{service=await request({action:'status'});}catch(e){if(e.message.includes('连接接口不存在'))throw new Error('本地服务仍为旧版本，请关闭服务窗口并重新运行 start.cmd');throw e;}
  if(service.protocol!==2)throw new Error('本地服务需要更新，请重新运行 start.cmd');
  if(!service.webChannels)throw new Error('网页客服需要服务 0.14.0：请关闭旧服务窗口，再重新运行 start.cmd');
  $('service').textContent='服务 '+service.version+' · '+(service.configured?'DeepSeek 已配置':'未配置模型，仅可精确匹配标准问答');
  const data=await request({action:'spaces'});$('space').replaceChildren();for(const item of data){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;$('space').append(o);}if(!data.length)throw new Error('没有已发布业务，请先到知答工作台发布');
  const {lastSpace}=await chrome.storage.local.get('lastSpace');if(data.some(item=>item.id===lastSpace))$('space').value=lastSpace;
}
$('connect').onclick=()=>attempt(async()=>{const bridgeToken=$('token').value.trim();if(!/^[0-9a-f]{64}$/.test(bridgeToken))throw new Error('请复制本地生成的64位连接令牌，不是模型密钥');await chrome.storage.local.set({bridgeToken});await chrome.storage.session.set({bridgeToken});$('token').value='';await spaces();$('status').textContent='本地服务已连接';});
attempt(async()=>{await loadProfiles();const session=await chrome.storage.session.get('bridgeToken'),local=await chrome.storage.local.get('bridgeToken');const bridgeToken=session.bridgeToken||local.bridgeToken;if(bridgeToken){await chrome.storage.local.set({bridgeToken});await spaces();}else $('status').textContent='请先展开连接设置，填写本地连接令牌。';});
