export function channelId(value='xiaohongshu'){
  if(typeof value!=='string'||!/^[-a-z0-9]{1,40}$/.test(value))throw Error('渠道 ID 无效');return value;
}
export function channelDefaults(id){
  return {siteAllowed:false,siteUrl:'',rules:'',linkMode:id==='xiaohongshu'?'approved-on-request':'knowledge',allowContact:false,maxReplyAgeHours:id==='xiaohongshu'?24:0};
}
export function channelPolicy(id,body={}){
  channelId(id);const value={...channelDefaults(id),...body};
  if(typeof value.siteAllowed!=='boolean'||typeof value.siteUrl!=='string'||typeof value.rules!=='string'||value.rules.length>2000||!['blocked','approved-on-request','knowledge'].includes(value.linkMode)||typeof value.allowContact!=='boolean'||!Number.isFinite(value.maxReplyAgeHours)||value.maxReplyAgeHours<0||value.maxReplyAgeHours>720)throw Error('渠道设置无效');
  if(value.siteUrl){const u=new URL(value.siteUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error('网站地址须为不含凭证的 HTTPS 地址');}
  return Object.fromEntries(Object.keys(channelDefaults(id)).map(key=>[key,value[key]]));
}
