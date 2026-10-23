import {timingSafeEqual} from 'node:crypto';
import {getSpace,required,answer} from './core.mjs';
import {activeSnapshot,fingerprint} from './knowledge-state.mjs';
import {observeConversation} from './conversation-memory.mjs';
import {metered} from './operations.mjs';
export function validBridgeToken(value, expected) {
  const a=Buffer.from(value||''),b=Buffer.from(expected||'');
  return b.length>=32 && a.length===b.length && timingSafeEqual(a,b);
}
export async function bridgeReply(db, body, options={}) {
  const space=getSpace(db,required(body.space,'业务空间',100));
  if(!space.active)throw new Error('请先在工作台发布知识版本');
  const question=required(body.question,'问题',2000);
  const row=db.prepare('SELECT snapshot FROM versions WHERE id=? AND space=?').get(space.active,space.id);
  if(!row)throw new Error('生效版本不存在');
  // Only explicitly supplied, observed conversation turns; no draft is persisted as sent.
  const history=body.history??[];
  if(!Array.isArray(history)||history.length>12||history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>4000))throw new Error('会话上下文格式无效');
  const memory=observeConversation(db,space.id,body.account,body.conversation,history,question);
  const active=activeSnapshot(db,space.id);
  const result=await metered(db,space.id,'reception',options,opts=>answer(active.snapshot,question,memory.history,{...opts,context:memory.context}));
  options.signal?.throwIfAborted();
  const fresh=activeSnapshot(db,space.id);
  if(fresh.version!==active.version||fingerprint(fresh.snapshot)!==fingerprint(active.snapshot))return {action:'handoff',answer:'不好意思，请稍等',sources:[],reasonCode:'knowledge-missing',reason:'知识版本、有效期或停用状态在生成期间变化，请重新核对',engine:'rules',draftOnly:true};
  if(result.followUp?.questions.length&&body.partialReplies!==true)return {...result,action:'handoff',answer:'不好意思，请稍等',followUp:undefined,reason:'客户端需更新后才能分开处理多个问题',reasonCode:'knowledge-missing',draftOnly:true};
  return {...result,context:memory.context,knowledgeSignature:fingerprint(active.snapshot),version:space.active,draftOnly:true};
}
