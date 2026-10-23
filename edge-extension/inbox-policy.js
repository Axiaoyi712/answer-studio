globalThis.ZhidaInboxPolicy={
  pending(messages,handled=[]){const last=messages.findLastIndex(m=>m.role==='assistant'&&!m.failed&&!m.pending);const done=new Set(handled);return messages.slice(last+1).filter(m=>m.role==='user'&&!done.has(m.id));},
  unconfirmed(messages,handled=[]){const done=new Set(handled),last=messages.findLastIndex(m=>m.role==='assistant'&&!m.failed&&!m.pending);let waiting=false;for(const m of messages.slice(last+1)){if(m.role==='user'&&!done.has(m.id))waiting=true;if(waiting&&m.role==='assistant'&&(m.failed||m.pending))return true;}return false;},
  clarificationCount(c,result,now=Date.now()){if(result.action!=='clarify'||result.clarification===false)return 0;return Number.isFinite(c.clarifiedAt)&&now>=c.clarifiedAt&&now-c.clarifiedAt<1800000?(c.clarifications||0)+1:1;},
  caseKey(account,conversation){return 'inbox-case:'+JSON.stringify([account,conversation]);},
  draftKey(account,conversation){return 'inbox-draft:'+JSON.stringify([account,conversation]);},
  handled(previous,messages){return [...new Set([...previous,...messages.map(m=>m.id)])].slice(-1000);},
  key(account,conversation,messages){return 'inbox:'+JSON.stringify([account,conversation,messages.map(m=>m.id)]);},
  next(targets,blocked,current,tasks=[]){const waiting=new Map(tasks.filter(t=>t.state==='pending').map(t=>[t.id,t.time]));return targets.filter(t=>t.kind==='c2c'&&(t.unread>0||waiting.has(t.id))&&t.id!==current&&!blocked.has(t.id)).sort((a,b)=>(waiting.get(a.id)||Infinity)-(waiting.get(b.id)||Infinity))[0];},
  same(a,b){return a.account===b.account&&a.route===b.route&&a.conversation?.id===b.conversation?.id&&a.signature===b.signature;}
};
