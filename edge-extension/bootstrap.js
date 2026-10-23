(() => {
  if(window.top!==window||globalThis.__zhidaBootstrap)return;globalThis.__zhidaBootstrap=true;
  // Only a previously started account/business can resume. Login and binding are checked by the worker.
  let attempts=0,checking=false;
  function hint(text){let node=document.getElementById('zhida-restore-status');if(!node){node=document.createElement('div');node.id='zhida-restore-status';node.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647;background:#fff2d8;color:#754a18;border:1px solid #b38c55;border-radius:8px;padding:16px;max-width:360px;font:600 16px/1.7 sans-serif';document.documentElement.append(node);}node.textContent=text;}
  const timer=setInterval(async()=>{
    if(globalThis.__zhidaAutoClose){document.getElementById('zhida-restore-status')?.remove();clearInterval(timer);return;}
    if(checking)return;checking=true;
    try{
      const r=await chrome.runtime.sendMessage({action:'restoreReception',pageUrl:location.href});if(r?.error)throw Error(r.error);
      if(r?.data?.restricted||r?.data?.blocked){clearInterval(timer);hint(r.data.restricted?'知答已停止自动恢复：平台显示限制访问。请停用扩展，按平台提示重启浏览器；确认手动聊天恢复正常后再决定是否启用。':'知答已停止此页面自动恢复：网页有阻断提示。处理提示后重新打开此页面客服，其他页面不受影响。');}
      else if(r?.data?.manual){clearInterval(timer);let pending=false;const observer=new MutationObserver(update);function update(){if(pending)return;pending=true;setTimeout(async()=>{pending=false;try{await chrome.runtime.sendMessage({action:'manualSnapshot',pageUrl:location.href});}catch(e){if(/Extension context invalidated/i.test(e.message)){observer.disconnect();hint('知答已更新或停用：请刷新此页面，旧助手已停止。');}}},300);}observer.observe(document.body,{subtree:true,childList:true,characterData:true});update();}
      else if(r?.data?.restored||r?.data?.disabled){document.getElementById('zhida-restore-status')?.remove();clearInterval(timer);}
    }catch(e){if(/Extension context invalidated/i.test(e.message)){clearInterval(timer);hint('知答已更新或停用：请刷新此页面，旧助手已停止。');}else if(++attempts>=3)hint('知答：自动恢复正在等待页面或本地服务就绪。请运行 start.cmd；就绪后会继续检查。');}finally{checking=false;}
  },5000);
})();
