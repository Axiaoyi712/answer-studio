import {bridgeReply} from './bridge.mjs';

const unavailable=(reason,extra={})=>({action:'handoff',answer:'不好意思，请稍等',sources:[],engine:'rules',draftOnly:true,reasonCode:'service-error',reason,retryable:false,...extra});
export function createReceptionService(db,{timeoutMs=18000,cooldownMs=30000,now=Date.now,...options}={}){
  const active=new Set();let failures=0,openUntil=0;
  async function reply(body,requestOptions={}){
    const cooling=now()<openUntil;
    const id=JSON.stringify([body.space,body.account||'',body.conversation||'legacy']);
    if(active.has(id)||active.size>=2)return unavailable('问答任务正在处理，当前客户需稍后核实');
    const budget=Math.min(timeoutMs,Number.isFinite(body.deadline)?body.deadline-now():timeoutMs);
    if(budget<=0)return unavailable('本次问答等待预算已用完');
    active.add(id);const controller=new AbortController();let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=new DOMException('本次问答超时','TimeoutError');controller.abort(error);reject(error);},budget);});
    try{
      const result=await Promise.race([bridgeReply(db,body,{...options,...requestOptions,modelUnavailable:cooling,signal:controller.signal}),timeout]);
      if(cooling&&result.reasonCode==='service-error')return {...result,retryAfterMs:Math.max(0,openUntil-now()),retryable:false};
      if(['service-error','model-output'].includes(result.reasonCode)){failures++;if(failures>=3)openUntil=now()+cooldownMs;}
      else if(result.modelCalled||result.engine==='deepseek')failures=0;
      return result;
    }catch(e){if(!cooling){failures++;if(failures>=3)openUntil=now()+cooldownMs;}return unavailable(['TimeoutError','AbortError'].includes(e.name)?'模型等待已达上限，当前客户转待办，继续接待其他顾客':'问答服务暂时不可用，当前客户转待办，继续接待其他顾客',{timedOut:['TimeoutError','AbortError'].includes(e.name)});}
    finally{clearTimeout(timer);active.delete(id);}
  }
  return {reply,get active(){return active.size;}};
}
