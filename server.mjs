import {channelId} from './channel-settings.mjs';
import http from 'node:http';
import {prepareKnowledge} from './knowledge-draft.mjs';
import {createInterviewer} from './knowledge-interview.mjs';
import {setupRecords,saveRecord,archiveRecords,archiveAuxiliary,archiveBrowserRecords,listArchives,readArchive,settings,siteRequested,recordDetails} from './records.mjs';
import { readFileSync,mkdirSync,existsSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname,join } from 'node:path';
import { randomUUID,timingSafeEqual,randomBytes } from 'node:crypto';
import {validBridgeToken} from './bridge.mjs';
import {database,required,getSpace,createSpace,addFact,reviseFact,publish,answer} from './core.mjs';
import {controls,conflicts,draftSnapshot,activeSnapshot,setFactControl,resolveConflict,suiteSignature,fingerprint,activationPreview,activateChecked,checkRelease} from './knowledge-state.mjs';
import {readProgress,saveProgress,syncGaps,listGaps,linkGap,verifyGap,saveRegression,runRegression} from './learning-quality.mjs';
import {heartbeat,overview,reviewRecord,metered} from './operations.mjs';
import {observeConversation} from './conversation-memory.mjs';
import {createReceptionService} from './reception-service.mjs';
import {enrichedFacts,resolveReferences,setReference} from './product-data.mjs';
import {createBackupManager,recoveryGeneration} from './backups.mjs';

const root=dirname(fileURLToPath(import.meta.url));
const appVersion='0.14.0';
mkdirSync(join(root,'data'),{recursive:true});
const dbPath=process.env.DB_PATH || join(root,'data','studio.sqlite'),db=database(dbPath);
const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3080),token=process.env.ADMIN_TOKEN||'';
if(!['127.0.0.1','localhost','::1'].includes(host)&&token.length<24) throw new Error('非本地监听必须设置至少24字符的 ADMIN_TOKEN，并通过 HTTPS 反向代理访问');
setupRecords(db);
const interviewer=createInterviewer(db,{key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'});
const receptionService=createReceptionService(db,{key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'});
const backups=createBackupManager(db,{directory:process.env.BACKUP_DIR||join(dirname(dbPath),'managed-backups'),appVersion});
let activeRequests=0,maintenance=false;
const archiveDirectory=process.env.ARCHIVE_DIR||join(root,'data','archives');
let archiveError='';
function maintain(){try{for(const s of db.prepare('SELECT id FROM spaces').all()){const interview=JSON.parse(db.prepare('SELECT body FROM knowledge_interviews WHERE space=?').get(s.id)?.body||'{}');syncGaps(db,s.id,interview.covered||[]);}archiveRecords(db,archiveDirectory);archiveAuxiliary(db,join(dirname(dbPath),'maintenance-archives'));archiveError='';}catch(e){archiveError=e.message;}}
maintain();setInterval(()=>{if(!maintenance)maintain();},3600000).unref();
backups.scheduled().catch(()=>{});setInterval(()=>{if(!maintenance)backups.scheduled().catch(()=>{});},60000).unref();
const locks=new Set();
const bridgeTokenPath=join(root,'data','edge-bridge-token.txt');
if(!existsSync(bridgeTokenPath))writeFileSync(bridgeTokenPath,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});
const bridgeToken=readFileSync(bridgeTokenPath,'utf8').trim();
function send(res,status,data) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
function authorized(req) {if(!token)return true; const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));const expected=Buffer.from(token);return supplied.length===expected.length&&timingSafeEqual(supplied,expected);}
async function input(req) {let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>1024*1024)throw new Error('请求过大，最多1MB');}return text?JSON.parse(text):{};}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  const url=new URL(req.url,'http://localhost');
  const apiRequest=url.pathname.startsWith('/api/');
  if(apiRequest&&maintenance){send(res,503,{error:'正在恢复数据库，请稍后重新连接'});return;}
  if(apiRequest)activeRequests++;
  try {
    if(!url.pathname.startsWith('/api/')) {
      const files={"/reception.js":"reception.js",'/':'index.html','/app.js':'app.js','/product-data.js':'product-data.js','/quality.js':'quality.js','/maintenance.js':'maintenance.js','/knowledge-interview.js':'knowledge-interview.js','/handoff-reasons.js':'../edge-extension/handoff-reasons.js','/style.css':'style.css'};
      files['/web-chat-demo.js']='web-chat-demo.js';files['/web-chat-demo.css']='web-chat-demo.css';
      if(/^\/web-chat-demo\/chat\/(?:a|b)\/?$/.test(url.pathname))files[url.pathname]='web-chat-demo.html';
      const file=files[url.pathname];if(!file){send(res,404,{error:'不存在'});return;}
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
      res.end(readFileSync(join(root,'public',file)));return;
    }
    if(url.pathname.startsWith('/api/bridge/')) {
      const origin=req.headers.origin;
      if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){send(res,403,{error:'仅允许浏览器扩展调用'});return;}
      if(!validBridgeToken(req.headers['x-bridge-token'],bridgeToken)){send(res,401,{error:'本地连接令牌不正确，请读取 data/edge-bridge-token.txt'});return;}
      const bridgeBody=req.method==='POST'?await input(req):null;
      if(bridgeBody&&url.pathname!=='/api/bridge/validate-reply'&&!(url.pathname==='/api/bridge/heartbeat'&&!bridgeBody.running)&&(bridgeBody.generation||'initial')!==recoveryGeneration(db)){send(res,409,{error:'数据库已恢复，请核对业务并重新启动接待',code:'restore-required'});return;}
      if(req.method==='POST'&&url.pathname==='/api/bridge/heartbeat'){const b=bridgeBody;getSpace(db,b.space);send(res,200,heartbeat(db,b.space,b));return;}
      if(req.method==='POST'&&url.pathname==='/api/bridge/validate-reply'){
        const b=bridgeBody;getSpace(db,b.space);const active=activeSnapshot(db,b.space);
        const knowledgeValid=(b.generation||'initial')===recoveryGeneration(db)&&b.version===active.version&&b.signature===fingerprint(active.snapshot);
        const channelValid=!b.channelSignature||b.channelSignature===fingerprint(settings(db,b.space,undefined,channelId(b.channel)));
        send(res,200,{valid:knowledgeValid&&channelValid,...(!channelValid?{reasonCode:'answer-check',reason:'渠道规则在生成后发生变化，请重新核对'}:{})});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/bridge/channel'){const b=bridgeBody;getSpace(db,b.space);send(res,200,settings(db,b.space,undefined,channelId(b.channel)));return;}
      if(req.method==='POST'&&url.pathname==='/api/bridge/record'){const b=bridgeBody;getSpace(db,b.space);send(res,200,saveRecord(db,b));return;}
      if(req.method==='POST'&&url.pathname==='/api/bridge/archive-local'){const b=bridgeBody;getSpace(db,b.space);send(res,200,archiveBrowserRecords(join(dirname(dbPath),'browser-archives'),b));return;}
      if(req.method==='POST'&&url.pathname==='/api/bridge/learn'){const b=bridgeBody;getSpace(db,b.space);send(res,201,{id:addFact(db,b.space,b)});return;}
      if(req.method==='POST'&&url.pathname==='/api/bridge/prepare-knowledge'){const b=bridgeBody;getSpace(db,b.space);send(res,200,await prepareKnowledge(b,{key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'}));return;}
      if(req.method==='GET'&&url.pathname==='/api/bridge/status'){
        send(res,200,{version:appVersion,protocol:2,webChannels:true,generation:recoveryGeneration(db),configured:!!process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/bridge/spaces') {
        send(res,200,db.prepare('SELECT id,name FROM spaces WHERE active IS NOT NULL').all());return;
      }
      if(req.method==='POST'&&url.pathname==='/api/bridge/draft') {
        const b=bridgeBody;getSpace(db,b.space);if((b.generation||'initial')!==recoveryGeneration(db)){send(res,409,{error:'数据库已恢复，请核对业务并重新启动接待',code:'restore-required'});return;}
        const channel=channelId(b.channel),policy=settings(db,b.space,undefined,channel),signature=fingerprint(policy);
        const result=await receptionService.reply(b,{channelRules:policy.rules});
        if(signature!==fingerprint(settings(db,b.space,undefined,channel))){send(res,200,{action:'handoff',answer:'不好意思，请稍等',sources:[],engine:'rules',reasonCode:'answer-check',reason:'渠道规则在生成期间变化，请重新核对'});return;}
        result.channelPolicy={...policy,requested:siteRequested(b.question)};result.channelSignature=signature;result.sitePolicy={...policy,requested:siteRequested(b.question)};send(res,200,result);return;
      }
      send(res,404,{error:'连接接口不存在'});return;
    }
    if(!authorized(req)){send(res,401,{error:'请填写正确的管理访问令牌'});return;}
    if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host){send(res,403,{error:'不允许跨站请求'});return;}
    if(!token&&!['localhost','127.0.0.1','[::1]'].includes((req.headers.host||'').replace(/:\d+$/,''))){send(res,403,{error:'仅允许本机访问'});return;}
    const method=req.method,path=url.pathname;
    if(method==='GET'&&path==='/api/status') {send(res,200,{version:appVersion,generation:recoveryGeneration(db),model:process.env.DEEPSEEK_MODEL||'deepseek-flash',configured:!!process.env.DEEPSEEK_API_KEY,channel:'本地问答服务 · 网页客服由 Edge 扩展单独启动'});return;}
    if(method==='GET'&&path==='/api/backups'){send(res,200,{...backups.status(),files:backups.list()});return;}
    if(method==='GET'&&path==='/api/backup-download'){const name=url.searchParams.get('name');backups.inspect(name);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+name+'"'});res.end(readFileSync(backups.file(name)));return;}
    if(method==='GET'&&path==='/api/records'){
      const offset=Math.max(0,Number(url.searchParams.get('offset'))||0),q=(url.searchParams.get('q')||'').slice(0,100),space=url.searchParams.get('space')||'';
      const where="WHERE (?='' OR space=?) AND body LIKE ?",args=[space,space,'%'+q+'%'];
      send(res,200,{records:db.prepare('SELECT body,updated FROM reception '+where+' ORDER BY updated DESC,id LIMIT 100 OFFSET ?').all(...args,offset).map(r=>({...recordDetails(JSON.parse(r.body)),updated:r.updated,review:db.prepare('SELECT correct,resolved FROM reception_reviews WHERE record=?').get(JSON.parse(r.body).id)||null})),total:db.prepare('SELECT COUNT(*) n FROM reception '+where).get(...args).n,archives:listArchives(archiveDirectory),archiveDirectory,archiveError});return;
    }
    if(method==='GET'&&path==='/api/archive'){send(res,200,readArchive(archiveDirectory,url.searchParams.get('name')));return;}
    if(method==='POST'&&path==='/api/archive'){maintain();if(archiveError)throw new Error(archiveError);send(res,200,{ok:true});return;}
    if(method==='GET'&&path==='/api/spaces'){send(res,200,db.prepare('SELECT * FROM spaces').all());return;}
    if(method==='GET'&&path==='/api/record-events'){const space=required(url.searchParams.get('space'),'业务'),record=required(url.searchParams.get('record'),'记录');getSpace(db,space);send(res,200,db.prepare('SELECT created,body FROM reception_events WHERE space=? AND record=? ORDER BY created,rowid').all(space,record).map(e=>({time:e.created,...JSON.parse(e.body)})));return;}
    const body=method==='POST'?await input(req):{};
    if(method==='POST'&&path==='/api/backup-create'){send(res,201,await backups.create());return;}
    if(method==='POST'&&path==='/api/backup-verify'){send(res,200,backups.inspect(body.name));return;}
    if(method==='POST'&&path==='/api/restore-preview'){send(res,200,backups.preview(body.name));return;}
    if(method==='POST'&&path==='/api/restore'){
      if(body.confirmText!=='恢复全部数据')throw Error('请输入“恢复全部数据”再确认');
      if(activeRequests>1||receptionService.active)throw Error('仍有问答或编辑任务未结束，请等待完成后再恢复');
      if(db.prepare('SELECT body,seen FROM runtime_health').all().some(r=>JSON.parse(r.body).running&&Date.now()-r.seen<120000))throw Error('请先暂停所有自动接待，再恢复数据库');
      maintenance=true;try{send(res,200,await backups.restore(body.name,body.confirmation));}finally{maintenance=false;}return;
    }
    if(method==='POST'&&path==='/api/spaces'){send(res,201,{id:createSpace(db,body.name,body.rules)});return;}
    const match=path.match(/^\/api\/spaces\/([^/]+)(?:\/(.*))?$/);
    if(!match){send(res,404,{error:'接口不存在'});return;}
    const [,id,action='']=match,space=getSpace(db,id);
    const modelOptions={key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'};
    if(method==='GET'&&action==='overview'){interviewer.read(id);send(res,200,{...overview(db,id,Number(url.searchParams.get('days'))),gaps:listGaps(db,id).map(g=>({id:g.id,stage:g.stage,closed:g.closed}))});return;}
    if(method==='GET'&&action==='quality'){
      interviewer.read(id);const snapshot=draftSnapshot(db,id),signature=suiteSignature(db,id,snapshot),run=db.prepare('SELECT body FROM regression_runs WHERE space=? AND signature=? ORDER BY created DESC,rowid DESC LIMIT 1').get(id,signature);
      send(res,200,{controls:controls(db,id),conflicts:conflicts(snapshot),progress:readProgress(db,id),gaps:listGaps(db,id),cases:db.prepare('SELECT * FROM regression_cases WHERE space=? ORDER BY rowid').all(id).map(c=>({...c,expected:JSON.parse(c.expected),sources:JSON.parse(c.sources),...JSON.parse(c.checks)})),run:run?JSON.parse(run.body):null});return;
    }
    if(method==='POST'&&action==='fact-control'){send(res,200,setFactControl(db,id,body));return;}
    if(method==='POST'&&action==='resolve-conflict'){send(res,200,resolveConflict(db,id,body.id));return;}
    if(method==='POST'&&action==='interview-progress'){send(res,200,saveProgress(db,id,body,[{operator:true}]));return;}
    if(method==='POST'&&action==='gap-link'){linkGap(db,id,body.id,body.fact,body.remove===true);send(res,200,{ok:true});return;}
    if(method==='POST'&&action==='regression-save'){send(res,200,saveRegression(db,id,body));return;}
    if(method==='GET'&&action==='regression-export'){send(res,200,{cases:db.prepare('SELECT * FROM regression_cases WHERE space=? ORDER BY rowid').all(id).map(c=>({question:c.question,expected:JSON.parse(c.expected),sources:JSON.parse(c.sources),...JSON.parse(c.checks)}))});return;}
    if(method==='POST'&&action==='regression-import'){
      if(!Array.isArray(body.cases)||!body.cases.length||body.cases.length>50)throw Error('请导入1–50道已脱敏测试题');db.exec('BEGIN');try{for(const c of body.cases){const old=db.prepare('SELECT id FROM regression_cases WHERE space=? AND question=?').get(id,c.question);saveRegression(db,id,{...c,id:old?.id});}if(db.prepare('SELECT COUNT(*) n FROM regression_cases WHERE space=?').get(id).n>50)throw Error('每个业务最多50道发布回归题');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}send(res,200,{ok:true});return;
    }
    if(method==='POST'&&action==='regression-delete'){db.prepare('DELETE FROM regression_cases WHERE id=? AND space=?').run(body.id,id);send(res,200,{ok:true});return;}
    if(method==='POST'&&action==='record-review'){send(res,200,reviewRecord(db,id,body));return;}
    if(method==='POST'&&action==='activation-preview'){send(res,200,activationPreview(db,id,body.version));return;}
    if(method==='POST'&&['verify-gap','quality-check','activation-check'].includes(action)){
      const lock='quality:'+id;if(locks.has(lock))throw Error('此业务正在检查，请等待完成');locks.add(lock);
      try{if(action==='activation-check')activationPreview(db,id,body.version);send(res,200,await metered(db,id,'quality',modelOptions,opts=>action==='verify-gap'?verifyGap(db,id,body,opts):runRegression(db,id,opts,action==='activation-check'?body.version:null)));}finally{locks.delete(lock);}return;
    }
    if(action==='knowledge-interview'&&method==='GET'){send(res,200,interviewer.read(id));return;}
    if(action==='knowledge-interview'&&method==='POST'){send(res,200,await interviewer.turn(id,body));return;}
    if(method==='GET'&&action==='') {send(res,200,{...space,facts:resolveReferences(enrichedFacts(db,id)),versions:db.prepare('SELECT id,created FROM versions WHERE space=? ORDER BY created DESC').all(id)});return;}
    if(method==='POST'&&action==='fact-reference'){setReference(db,id,body.id,body.target||null);send(res,200,{ok:true});return;}
    if(method==='POST'&&action==='prepare-knowledge'){send(res,200,await prepareKnowledge(body,{key:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL||'deepseek-flash'}));return;}
    if(action==='channel'){send(res,200,settings(db,id,method==='POST'?body:undefined,url.searchParams.get('channel')||'xiaohongshu'));return;}
    if(method==='GET'&&action==='release-diff'){const old=space.active?JSON.parse(db.prepare('SELECT snapshot FROM versions WHERE id=?').get(space.active).snapshot):{facts:[],rules:''};const next=draftSnapshot(db,id);send(res,200,{changed:JSON.stringify(old)!==JSON.stringify(next),pending:db.prepare('SELECT COUNT(*) n FROM facts WHERE space=? AND approved=0').get(id).n,old,next});return;}
    if(method==='POST'&&action==='rules'){db.prepare('UPDATE spaces SET rules=? WHERE id=?').run(required(body.rules,'规则',3000),id);send(res,200,{ok:true});return;}
    if(method==='POST'&&action==='facts'){send(res,201,{id:addFact(db,id,body)});return;}
    if(method==='POST'&&action==='fact-revise'){send(res,200,{id:reviseFact(db,id,body)});return;}
    if(method==='POST'&&action==='import') {
      if(!Array.isArray(body.facts)||body.facts.length>300||!body.facts.length)throw new Error('请导入1–300条JSON知识数组');
      db.exec('BEGIN');try{const ids=new Map();for(const f of body.facts){if(f.id&&ids.has(f.id))throw Error('导入包含重复标识');const created=addFact(db,id,f);if(f.id)ids.set(f.id,created);}for(const f of body.facts)if(f.reference){if(!ids.has(f.reference)||!ids.has(f.id))throw Error('关联资料必须一起导入');setReference(db,id,ids.get(f.id),ids.get(f.reference));}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      send(res,201,{count:body.facts.length});return;
    }
    if(method==='POST'&&action==='fact-state') {
      if(typeof body.approved!=='boolean')throw new Error('审核状态无效');
      const r=db.prepare('UPDATE facts SET approved=? WHERE id=? AND space=?').run(body.approved?1:0,body.id,id);
      if(!r.changes)throw new Error('知识不存在');send(res,200,{ok:true});return;
    }
    if(method==='POST'&&action==='fact-delete'){if(db.prepare('SELECT fact FROM fact_references WHERE target=? AND space=?').get(body.id,id))throw Error('仍有问答引用此资料，请先解除引用');db.prepare('DELETE FROM facts WHERE id=? AND space=?').run(body.id,id);send(res,200,{ok:true});return;}
    if(method==='POST'&&action==='publish'){send(res,201,{id:publish(db,id)});return;}
    if(method==='POST'&&action==='activate') {
      const preview=activationPreview(db,id,body.version);if(preview.confirmation!==body.confirmation)throw Error('请先查看目标版本差异并确认切换');
      if(!preview.next.facts.length)throw Error('目标版本没有当前可用知识');checkRelease(db,id,preview.next);
      await backups.create('before-version-switch');send(res,200,activateChecked(db,id,body));return;
    }
    if(method==='GET'&&action==='export') {send(res,200,{name:space.name,rules:space.rules,facts:enrichedFacts(db,id).map(({id,product,question,answer,source,data,reference})=>({id,product,question,answer,source,data,reference}))});return;}
    if(method==='POST'&&action==='chat') {
      const question=required(body.question,'问题',2000),mode=body.mode==='published'?'published':'draft';
      let session=body.session?db.prepare('SELECT * FROM sessions WHERE id=? AND space=?').get(body.session,id):null;
      if(body.session&&!session)throw new Error('会话不属于当前业务');
      if(session&&(session.mode!==mode||session.version!==(mode==='published'?space.active:null)))throw new Error('模式或发布版本已变化，请开始新会话');
      const sessionId=session?.id||randomUUID();
      if(locks.has(sessionId))throw new Error('当前会话正在回复，请稍后');
      const version=mode==='published'?space.active:null;
      let snapshot;
      if(mode==='published') {
        if(!version)throw new Error('请先发布知识版本');
        snapshot=activeSnapshot(db,id).snapshot;
      }else snapshot=draftSnapshot(db,id);
      locks.add(sessionId);
      try{
        const history=session?JSON.parse(session.history):[];
        const memory=observeConversation(db,id,'workbench',sessionId,history,question);
        const result=await metered(db,id,'test',modelOptions,opts=>answer(snapshot,question,history,{...opts,context:memory.context}));
        if(result.action==='skip'){send(res,200,{...result,session:session?.id||null,version});return;}
        const updated=[...history,{role:'user',content:question},{role:'assistant',content:result.answer}].slice(-120);
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET history=excluded.history').run(sessionId,id,mode,version,JSON.stringify(updated));
        send(res,200,{...result,session:sessionId,version});
      }finally{locks.delete(sessionId);}return;
    }
    send(res,404,{error:'接口不存在'});
  }catch(e){send(res,400,{error:e.name==='TimeoutError'?'模型响应超时，请重试或转人工':e.message});}finally{if(apiRequest)activeRequests--;}
});
server.listen(port,host,()=>console.log(`产品问答工作台 http://${host}:${server.address().port} · ${process.env.DEEPSEEK_API_KEY?'DeepSeek 已配置':'未配置模型，标准问答模式'}`));
