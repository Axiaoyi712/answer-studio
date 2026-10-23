globalThis.ZhidaAutoPolicy={
  decision(reply){
    if(reply?.action==='skip')return 'skip';
    if(!reply||!['answer','clarify'].includes(reply.action)||typeof reply.answer!=='string'||!reply.answer.trim()||reply.answer.length>1500)return 'handoff';
    if(reply.engine==='local')return 'handoff'; // Offline test instructions must never reach a customer.
    if(reply.action==='answer'&&(!Array.isArray(reply.sources)||!reply.sources.length))return 'handoff';
    const links=reply.answer.match(/https?:\/\/[^\s，。！？<>"）)]+/gi)||[];
    const site=reply.channelPolicy||reply.sitePolicy;
    const linkMode=site?.linkMode||'approved-on-request';
    const bare=reply.answer.replace(/https?:\/\/[^\s，。！？<>"）)]+/gi,'').match(/(?:www\.)?[a-z0-9-]+\.(?:cn|com|net|org)\b/gi)||[];
    if(linkMode==='knowledge'){
      if([...links,...bare].some(link=>!reply.sources?.some(f=>typeof f.answer==='string'&&f.answer.includes(link))))return 'handoff';
    }else if(linkMode==='blocked'){
      if(links.length||bare.length)return 'handoff';
    }else{
      if(bare.length||links.length&&(!site?.siteAllowed||!site.requested||links.some(link=>link!==site.siteUrl)||!reply.sources?.some(f=>typeof f.answer==='string'&&f.answer.includes(site.siteUrl))))return 'handoff';
    }
    const text=reply.answer.replace(/https?:\/\/[^\s，。！？<>"）)]+/gi,'');
    // Exclude only complete, explicit warnings. Any other credential mention still requires review.
    const checked=text.replace(/(?:请)?(?:不要|别|请勿|切勿|不需要|不用|无需)(?:在(?:这段|普通|本站)?聊天(?:中|里))?(?:发送|提供|提交|分享|转发|发)(?:密码|验证码|密钥)(?:(?:、|或|和)(?:密码|验证码|密钥))*(?:等敏感信息)?(?=[。！？；;，,]|$)/g,'')
      .replace(/(?:不要|请勿|切勿|不需要|不用|无需|不建议)(?:把)?(?:密码|验证码|密钥)(?:(?:、|或|和)(?:密码|验证码|密钥))*(?:发送|发给|提供给|告诉|交给)(?:我们|我|客服|本站|他人|任何人)(?=[。！？；;，,]|$)/g,'');
    if(/验证码|密码|cookie|api.?key/i.test(checked)||!site?.allowContact&&/加.{0,3}(?:微信|QQ)/i.test(checked))return 'handoff';
    return 'send';
  },
  canSend({running,visible,route,expectedRoute,signature,expectedSignature,empty,enabled}){
    return running&&visible&&route===expectedRoute&&signature===expectedSignature&&empty&&enabled;
  },
  key(account,route,ids){return 'zhida-delivery:'+JSON.stringify([account,route,ids]);}
};
