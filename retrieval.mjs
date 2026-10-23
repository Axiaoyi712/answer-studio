const normalize=text=>text.normalize('NFKC').toLowerCase();
export function modelNames(text){
  return [...new Set((normalize(text).replace(/https?:\/\/\S+/g,'').match(/[a-z]{1,12}[-_]?\d+(?:[._-][a-z0-9]+)*/g)||[]))];
}
function searchText(text){
  return normalize(text).replace(/打印纸/g,'复印纸').replace(/一沓|一叠|一包/g,'每包').replace(/多少页|多少张|几页|几张/g,'张数')
    .replace(/快递费|邮费/g,'运费').replace(/笔头/g,'笔尖').replace(/寄出|发出/g,'发货').replace(/晕墨|晕染/g,'洇墨');
}
function tokens(text){
  const clean=searchText(text).replace(/[^\p{L}\p{N}]/gu,'');const result=new Set();
  for(let i=0;i<clean.length-1;i++)result.add(clean.slice(i,i+2));
  if(/张数|\d+\s*[张页]/.test(searchText(text)))result.add('数量:张');
  for(const [topic,pattern] of [['开票',/开票|发票/],['退货',/退货/],['换货',/换货/],['退款',/退款|退费/],['保修',/保修/],['试用',/试用/],['定制',/定制/],['货到付款',/货到付款/]])if(pattern.test(text))result.add('政策:'+topic);
  return result;
}
export function retrieve(facts,question){
  const q=tokens(question);if(!q.size)return [];
  const models=modelNames(question),compact=text=>normalize(text).replace(/[^\p{L}\p{N}.]/gu,'');
  const query=compact(question),documents=facts.map(f=>({title:tokens(f.product+' '+f.question+' '+(f.data?.aliases||[]).join(' ')),body:tokens(f.answer),models:modelNames(f.product+' '+f.question)})),frequency=new Map();
  for(const d of documents)for(const term of new Set([...d.title,...d.body]))frequency.set(term,(frequency.get(term)||0)+1);
  return facts.map((f,i)=>{
    const d=documents[i];if(models.length&&d.models.length&&!models.some(m=>d.models.includes(m)))return {...f,score:-1};
    const score=[...q].reduce((sum,t)=>sum+(d.title.has(t)?1:d.body.has(t)?.8:0)*(Math.log((facts.length+1)/((frequency.get(t)||0)+1))+1)*(t.startsWith('数量:')||t.startsWith('政策:')?3:1),0);
    const exact=f.question.split(/[？?！!\n｜|]/).some(alias=>compact(alias)===query);
    return {...f,score:score+(exact?1000:0)+(models.some(m=>d.models.includes(m))?20:0)};
  }).filter(f=>f.score>=2).sort((a,b)=>b.score-a.score).slice(0,5);
}
