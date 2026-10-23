(() => {
  const card=el('article',undefined,'card interview');card.id='knowledge-interview';
  card.innerHTML='<div class="row"><div><h2>对话建库</h2><p class="muted">直接聊你的业务，我会逐步追问并整理。你确认的信息会自动存为待审核知识，核对、审核并发布后用于接待。</p></div><span class="badge">与当前业务独立保存</span></div><div class="interview-layout"><div><div id="interview-messages" role="log" aria-label="对话建库记录" aria-live="polite"></div><form id="interview-form"><label for="interview-input">告诉我你要做什么，或回答上面的问题</label><textarea id="interview-input" rows="3" maxlength="8000" placeholder="例如：我想做文具客服，主营中性笔和打印纸。" required></textarea><div class="row interview-actions"><span class="muted">Enter 发送 · Shift + Enter 换行</span><button id="interview-send">发送并整理</button></div></form></div><div class="interview-side"><h3>让它主动问你</h3><button id="interview-start" class="secondary">开始了解业务</button><button id="interview-gaps" class="secondary">补齐接待难题</button><button id="interview-summary" class="secondary">总结并入库</button><p id="interview-status" role="status"></p><div id="interview-error" role="alert" hidden></div><h3>本轮整理</h3><div id="interview-saved"></div><button id="interview-review" class="text">查看待审核知识</button><details><summary id="interview-gap-count">接待中待补的问题</summary><p class="muted">知识不足的接待问题会持续保留，补充、审核、发布并验证通过后才关闭；不改变客户待办状态。</p><div id="interview-gap-list"></div></details></div></div>';
  document.querySelector('#knowledge .stats').after(card);
  let owner='',data=null,loading=0,working=false,retry=null;const drafts=new Map();
  function render(){
    const messages=$('interview-messages');messages.replaceChildren();
    if(!data.history.length)messages.append(el('p','你可以直接说“我想做文具客服”，也可以点“开始了解业务”。已有知识会作为背景，不用从头填表。','muted'));
    for(const turn of data.history){const bubble=el('div',turn.content,'bubble '+(turn.role==='user'?'user':'interviewer'));if(turn.saved?.length)bubble.append(el('small','本轮整理 '+turn.saved.length+' 条，新增及修改内容需审核发布'));messages.append(bubble);}
    messages.scrollTop=messages.scrollHeight;
    $('interview-start').textContent=data.history.length?'继续了解业务':'开始了解业务';
    $('interview-gap-count').textContent='接待中待补的问题（'+data.gaps.length+'）';
    $('interview-gaps').textContent='补齐接待难题（'+data.gaps.filter(g=>['待补充','验证未通过','知识已停用或失效'].includes(g.stage)).length+'）';
    $('interview-gap-list').replaceChildren(...data.gaps.slice(0,10).map(g=>el('p',g.stage+' · '+g.question)));
    if(!data.gaps.length)$('interview-gap-list').textContent='暂未发现尚未整理的人工接待问题。';
    const saved=data.saved||data.history.filter(t=>t.role==='assistant').at(-1)?.saved||[];
    $('interview-saved').replaceChildren();
    for(const item of saved){const p=el('p',({created:'新增待审核',updated:'已更新待审核',unchanged:'已有相同知识',conflict:'修正待审核，原审核知识保留'}[item.status]||'已整理')+'：'+item.product+' / '+item.question);if(item.status==='conflict')p.append(el('strong','。确认新内容后，请在知识清单撤回旧答案再发布。'));$('interview-saved').append(p);}
    if(!saved.length)$('interview-saved').textContent='有了明确答案后会自动整理，你也可以随时点击“总结并入库”。';
    $('interview-status').textContent=data.configured?'对话自动保存，刷新后可以继续。':'未配置模型 API；请配置后重启本地服务，或继续手动录入。';
    controls();
  }
  function controls(){for(const id of ['interview-send','interview-start','interview-summary','interview-gaps','interview-input'])$(id).disabled=working||!data?.configured;$('interview-gaps').disabled||=!data?.gaps.some(g=>['待补充','验证未通过','知识已停用或失效'].includes(g.stage));}
  async function load(){
    const selected=current,serial=++loading;if(!selected)return;
    if(owner&&owner!==selected)drafts.set(owner,$('interview-input').value);
    if(owner!==selected){owner=selected;data=null;$('interview-input').value=drafts.get(owner)||'';$('interview-error').hidden=true;$('interview-messages').replaceChildren(el('p','正在读取此业务的建库对话…','muted'));}
    const result=await api('spaces/'+selected+'/knowledge-interview');
    if(current!==selected||serial!==loading)return;
    data=result;render();
  }
  async function send(mode){
    if(working||!data)return;
    const selected=current,message=mode==='message'?$('interview-input').value.trim():'';if(mode==='message'&&!message)return;
    const requestId=retry?.space===selected&&retry.mode===mode&&retry.message===message?retry.id:crypto.randomUUID();
    retry={space:selected,mode,message,id:requestId};working=true;busy=true;controls();$('spaces').disabled=$('new-space').disabled=true;
    $('interview-error').hidden=true;$('interview-status').textContent='正在思考下一步问题并整理知识，请稍等…';
    try{
      const result=await api('spaces/'+selected+'/knowledge-interview',{mode,message,requestId});
      retry=null;if(current!==selected)return;
      data=result;if(mode==='message'){$('interview-input').value='';drafts.delete(selected);}render();
      await refresh();
      const changed=result.saved.filter(s=>s.status!=='unchanged').length;
      $('interview-status').textContent=changed?'本轮 '+changed+' 条已存为待审核知识。核对、审核并发布后生效。':'本轮对话已保存，可以继续回答或补充。';
    }catch(e){$('interview-error').textContent=e.message+'。输入内容已保留，可再次点击重试。';$('interview-error').hidden=false;$('interview-status').textContent='本轮未完成，之前的对话和知识保留。';}
    finally{working=false;busy=false;controls();$('spaces').disabled=$('new-space').disabled=false;}
  }
  $('interview-form').onsubmit=e=>{e.preventDefault();send('message');};
  $('interview-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('interview-send').disabled)$('interview-form').requestSubmit();}};
  $('interview-start').onclick=()=>send('start');$('interview-gaps').onclick=()=>send('gaps');$('interview-summary').onclick=()=>send('summary');$('interview-review').onclick=openPendingKnowledge;
  globalThis.__zhidaRefreshInterview=load;
  controls();
  if(current)run(load);
})();
