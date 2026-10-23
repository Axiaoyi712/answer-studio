// Local task ledger. Only tasks observed in the bound page can be tracked.
globalThis.ZhidaReception={
  tails:new Map(),arrivals:new Map(),
  stamp(s){
    if(!s.conversation)return;
    const key=JSON.stringify([s.account,s.conversation.id]),previous=this.tails.get(key),index=s.messages.findIndex(m=>m.id===previous);
    if(previous&&index>=0)for(const m of s.messages.slice(index+1))if(!m.time)this.arrivals.set(key+':'+m.id,Date.now());
    for(const m of s.messages)if(!m.time&&this.arrivals.has(key+':'+m.id)){m.time=this.arrivals.get(key+':'+m.id);m.observedTime=true;}
    while(this.arrivals.size>5000)this.arrivals.delete(this.arrivals.keys().next().value);
    if(s.messages.length)this.tails.set(key,s.messages.at(-1).id);
  },
  taskKey:(account,id)=>'reception-task:'+JSON.stringify([account,id]),
  async observe(s){
    const updates={},now=Date.now();
    for(const t of s.targets.filter(t=>t.kind==='c2c'&&t.unread>0)){
      const key=this.taskKey(s.account,t.id),old=(await chrome.storage.local.get(key))[key];
      if(old&&['handoff','manual','uncertain'].includes(old.state))continue;
      if(!old||old.state==='done'||(t.updated&&t.updated>old.listTime))updates[key]={...old,id:t.id,name:t.name,state:'pending',time:old?.state==='done'?now:old?.time||now,listTime:t.updated};
    }
    if(s.conversation?.kind==='c2c'){
      const key=this.taskKey(s.account,s.conversation.id),old=updates[key]||(await chrome.storage.local.get(key))[key];
      const pending=s.messages.slice(s.messages.findLastIndex(m=>m.role==='assistant'&&!m.failed&&!m.pending)+1).some(m=>m.role==='user');
      if(!old||old.state==='pending'||old.state==='done'&&pending)updates[key]={...old,id:s.conversation.id,name:s.conversation.name,state:'pending',time:old?.state==='done'?now:old?.time||now};
    }
    if(Object.keys(updates).length)await chrome.storage.local.set(updates);
  },
  async tasks(account){return Object.entries(await chrome.storage.local.get(null)).filter(([k])=>k.startsWith('reception-task:')).filter(([k])=>{try{return JSON.parse(k.slice(15))[0]===account;}catch{return false;}}).map(([,v])=>v);},
  async state(account,id,state){const key=this.taskKey(account,id),old=(await chrome.storage.local.get(key))[key]||{id,time:Date.now()};await chrome.storage.local.set({[key]:{...old,state}});},
  old(tail,now=Date.now(),hours=24){return hours>0&&tail.some(m=>!m.time||now-m.time>hours*3600000||m.time>now+300000);},
  async record(s,patch,request){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([this.space,s.account,s.conversation.id,patch.ids||s.messages.map(m=>m.id)])));
    const id='reception:'+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
    const record={id,space:this.space,account:s.account,conversation:s.conversation.id,name:s.conversation.name,time:Date.now(),history:s.messages.slice(-12),...patch};
    const event=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([record.stage||record.state,record.answer||'',record.reason||'',record.version||null,(record.sources||[]).map(f=>f.id)])));
    const eventKey=Array.from(new Uint8Array(event),n=>n.toString(16).padStart(2,'0')).join('');
    // Outbox survives local-service failures. Background adds the bound business ID.
    await chrome.storage.local.set({['reception-outbox:'+id+':'+eventKey]:record,['reception-detail:'+JSON.stringify([s.account,s.conversation.id])]:record});
    await this.flush(request);return record;
  },
  async flush(request){
    const all=await chrome.storage.local.get(null);
    for(const [key,record] of Object.entries(all).filter(([k,r])=>k.startsWith('reception-outbox:')&&r.account===this.account&&r.space===this.space).slice(0,10)){
      // Do not send another account's pending records through this binding.
      if(record.account!==this.account||record.space!==this.space)continue;
      try{await request('record',{record});await chrome.storage.local.remove(key);}catch{return;}
    }
    const unsynced=new Set(Object.entries(all).filter(([k])=>k.startsWith('reception-outbox:')).map(([,r])=>r.id));
    const completed=Object.entries(all).filter(([key,r])=>key.startsWith('reception-detail:')&&!['handoff','manual','uncertain','pending'].includes(r.state)&&!unsynced.has(r.id)).sort((a,b)=>b[1].time-a[1].time);
    for(const [index,[key,record]] of completed.entries())if(index>=20||record.time<Date.now()-30*86400000)await chrome.storage.local.remove(key);
  },
  async archive(account,request){
    const all=await chrome.storage.local.get(null),cutoff=Date.now()-90*86400000,entries=[];
    for(const [key,value] of Object.entries(all)){if(!(key.startsWith('inbox:')||key.startsWith('reception-task:'))||!value||!Number.isFinite(value.time)||value.time<=0||value.time>=cutoff)continue;let id;try{id=JSON.parse(key.slice(key.indexOf(':')+1));}catch{continue;}if(id[0]!==account)continue;
      const c=all['inbox-case:'+JSON.stringify([account,id[1]])],task=all[this.taskKey(account,id[1])];if(c?.state!=='active'||task?.state!=='done'||all['inbox-draft:'+JSON.stringify([account,id[1]])]||Object.values(all).some(r=>r?.account===account&&r?.conversation===id[1]&&r?.state==='pending'))continue;
      if(key.startsWith('inbox:')&&(value.state!=='echo-confirmed'||!Array.isArray(id[2])||!id[2].every(m=>c.handled?.includes(m))))continue;
      if(key.startsWith('reception-task:')&&value.state!=='done')continue;entries.push([key,value]);if(entries.length>=100)break;
    }
    if(!entries.length)return {count:0};const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(entries)))),n=>n.toString(16).padStart(2,'0')).join('');
    const receipt=await request('archive-local',{account,entries});if(receipt.sha256!==sha||receipt.count!==entries.length)throw Error('归档回执不匹配，未清理原记录');
    let count=0;for(const [key,value] of entries){const fresh=(await chrome.storage.local.get(key))[key];if(JSON.stringify(fresh)===JSON.stringify(value)){await chrome.storage.local.remove(key);count++;}}return {...receipt,count};
  },
  async detail(account,id){return (await chrome.storage.local.get('reception-detail:'+JSON.stringify([account,id])))['reception-detail:'+JSON.stringify([account,id])];}
};
