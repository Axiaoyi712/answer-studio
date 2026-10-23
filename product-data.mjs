const topics=['开票','退货','换货','退款','保修','试用','定制','货到付款'];
const text=(v,name,max=2000)=>{if(typeof v!=='string'||v.length>max)throw Error(name+'格式无效');return v.trim();};
const list=(v,name)=>{if(!Array.isArray(v)||v.length>30)throw Error(name+'格式无效');return [...new Set(v.map(s=>text(s,name,100)).filter(Boolean))];};
export function writeProductFact(db,write){db.exec('SAVEPOINT product_fact');try{write();db.exec('RELEASE product_fact');}catch(e){db.exec('ROLLBACK TO product_fact');db.exec('RELEASE product_fact');throw e;}}
export function setupProductData(db){db.exec(`CREATE TABLE IF NOT EXISTS product_data(fact TEXT PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,space TEXT NOT NULL REFERENCES spaces(id),body TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS fact_references(fact TEXT PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,space TEXT NOT NULL REFERENCES spaces(id),target TEXT NOT NULL REFERENCES facts(id));`);}
export function validateProductData(body){
 if(!body||typeof body!=='object')throw Error('商品资料格式无效');
 const value={aliases:list(body.aliases||[],'商品别名'),specs:text(body.specs||'','规格'),price:null,policies:[]};
 if(body.price!==null&&body.price!==undefined){const p=body.price;if(!Number.isFinite(p.amount)||p.amount<0||p.amount>1e9||Math.abs(Math.round(p.amount*100)-p.amount*100)>1e-6)throw Error('价格须为非负金额，最多两位小数');value.price={amount:p.amount,unit:text(p.unit,'计价单位',20)};if(!value.price.unit)throw Error('请填写计价单位');}
 if(!Array.isArray(body.policies||[])||(body.policies||[]).length>20)throw Error('政策格式无效');
 for(const p of body.policies||[]){if(!topics.includes(p.topic)||typeof p.allowed!=='boolean')throw Error('政策类型或支持状态无效');const policy={topic:p.topic,allowed:p.allowed,variant:text(p.variant||'','政策范围',30),conditions:list(p.conditions||[],'适用条件'),exceptions:list(p.exceptions||[],'例外').map(e=>e.replace(/除外$/,'').replace(/^(预售|定制)(?:商品|产品)$/,'$1'))};if(policy.exceptions.some(e=>!e))throw Error('请填写实际例外范围');if(value.policies.some(old=>old.topic===policy.topic&&old.variant===policy.variant))throw Error('同一政策范围只能配置一次');value.policies.push(policy);}
 if(!value.price&&!value.specs&&!value.policies.length)throw Error('至少填写价格、规格或一项政策');return value;
}
export function productAnswer(product,data){
 const lines=[];if(data.specs)lines.push(product+'：'+data.specs+'。');if(data.price)lines.push(product+'单'+data.price.unit+data.price.amount+'元。');
 for(const p of data.policies){const topic=p.topic==='开票'?'开具'+p.variant+'发票':p.variant+p.topic;lines.push((p.conditions.length?'仅限'+p.conditions.join('且')+'，':'')+(p.allowed?'支持':'不支持')+topic+'。'+p.exceptions.map(e=>e.replace(/(?:商品|产品)?除外$/,'')+'除外。').join(''));}return lines.join('\n');
}
export function enrichedFacts(db,space){const data=new Map(db.prepare('SELECT fact,body FROM product_data WHERE space=?').all(space).map(r=>[r.fact,JSON.parse(r.body)])),refs=new Map(db.prepare('SELECT fact,target FROM fact_references WHERE space=?').all(space).map(r=>[r.fact,r.target]));return db.prepare('SELECT * FROM facts WHERE space=? ORDER BY rowid').all(space).map(f=>({...f,...(data.has(f.id)?{data:data.get(f.id)}:{}),...(refs.has(f.id)?{reference:refs.get(f.id)}:{})}));}
export function resolveReferences(facts){const byId=new Map(facts.map(f=>[f.id,f]));return facts.flatMap(f=>{if(!f.reference)return [f];const target=byId.get(f.reference);return target?.data?[{...f,product:target.product,answer:target.answer,source:target.source,data:target.data}]:[];});}
export function setReference(db,space,id,target){
 const fact=db.prepare('SELECT * FROM facts WHERE id=? AND space=?').get(id,space);if(!fact)throw Error('问答不属于当前业务');
 if((db.prepare('SELECT target FROM fact_references WHERE fact=? AND space=?').get(id,space)?.target||null)===(target||null))return;
 writeProductFact(db,()=>{
 if(target){if(target===id||db.prepare('SELECT fact FROM product_data WHERE fact=?').get(id)||!db.prepare('SELECT fact FROM product_data WHERE fact=? AND space=?').get(target,space))throw Error('请引用本业务的其他统一商品资料');db.prepare('INSERT INTO fact_references VALUES(?,?,?) ON CONFLICT(fact) DO UPDATE SET target=excluded.target').run(id,space,target);}
 else db.prepare('DELETE FROM fact_references WHERE fact=? AND space=?').run(id,space);
 db.prepare('UPDATE facts SET approved=0 WHERE id=?').run(id);
 });
}
