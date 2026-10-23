(() => {
 const card=el('details',undefined,'card');card.id='product-data';
 card.innerHTML='<summary>统一商品资料（可选）</summary><p class="muted">价格、规格和政策在此维护一次。普通问答可引用这份资料；保存后仍须审核、发布。阶梯价、活动价等复杂规则请继续保留为普通问答。</p><form id="product-data-form"><label>商品 / 型号<input name="product" required maxlength="100"></label><label>常见问法<input name="question" required maxlength="1000" placeholder="例如：P01多少钱？｜P01什么规格？"></label><label>商品别名（用 ｜ 分隔）<input name="aliases"></label><div class="grid"><label>单价（元，可留空）<input name="amount" type="number" min="0" step="0.01"></label><label>计价单位<input name="unit" placeholder="例如：支、包、件"></label></div><label>规格与用途<textarea name="specs" maxlength="2000"></textarea></label><div id="product-policy-rows"></div><button id="add-product-policy" type="button" class="secondary">＋ 添加服务政策</button><label>资料来源<input name="source" required maxlength="1000"></label><button>保存统一资料为待审核</button><button id="clear-product-data" type="button" class="text">清空</button></form>';
 $('knowledge-list').before(card);let editing='',owner='';const form=$('product-data-form'),split=s=>s.split(/[｜|]/).map(x=>x.trim()).filter(Boolean);
 const field=(root,label,name,value='')=>{const l=el('label',label),i=el('input');i.name=name;i.value=value;l.append(i);root.append(l);return i;};
 function policyRow(p={topic:'开票',allowed:true,variant:'',conditions:[],exceptions:[]}){
  const row=el('fieldset');row.className='product-policy';row.append(el('legend','服务政策'));
  const topic=el('select');topic.name='topic';for(const t of ['开票','退货','换货','退款','保修','试用','定制','货到付款']){const o=el('option',t);o.value=t;topic.append(o);}topic.value=p.topic;
  const allowed=el('select');allowed.name='allowed';for(const [v,t] of [['true','支持'],['false','不支持']]){const o=el('option',t);o.value=v;allowed.append(o);}allowed.value=String(p.allowed);row.append(topic,allowed);
  field(row,'范围（电子、纸质、无理由等，可留空）','variant',p.variant);field(row,'适用条件（用 ｜ 分隔）','conditions',p.conditions.join('｜'));field(row,'例外（用 ｜ 分隔，例如：定制）','exceptions',p.exceptions.join('｜'));
  row.append(action('移除此政策',()=>row.remove(),'text'));$('product-policy-rows').append(row);
 }
 function clear(){editing='';form.reset();$('product-policy-rows').replaceChildren();}
 globalThis.__zhidaEditProduct=f=>{show('knowledge');card.open=true;clear();editing=f.id;for(const key of ['product','question','source'])form.elements[key].value=f[key];const d=f.data;form.elements.aliases.value=d.aliases.join('｜');form.elements.amount.value=d.price?.amount??'';form.elements.unit.value=d.price?.unit||'';form.elements.specs.value=d.specs;d.policies.forEach(policyRow);card.scrollIntoView({block:'start'});notice('修改统一资料后，相关引用问答会随本次审核发布更新。');};
 $('add-product-policy').onclick=()=>policyRow();$('clear-product-data').onclick=clear;
 form.onsubmit=e=>{e.preventDefault();run(async()=>{const values=Object.fromEntries(new FormData(form)),policies=[...$('product-policy-rows').children].map(row=>{const v=name=>row.querySelector('[name="'+name+'"]').value;return {topic:v('topic'),allowed:v('allowed')==='true',variant:v('variant'),conditions:split(v('conditions')),exceptions:split(v('exceptions'))};});
  await api(`spaces/${current}/${editing?'fact-revise':'facts'}`,{id:editing||undefined,product:values.product,question:values.question,source:values.source,data:{aliases:split(values.aliases),price:values.amount===''?null:{amount:Number(values.amount),unit:values.unit},specs:values.specs,policies}});clear();await refresh();notice('统一商品资料已保存。请核对字段、审核并发布，正式回复才会更新。');},e.submitter);};
 globalThis.__zhidaRefreshProducts=()=>{
  if(owner!==current){owner=current;clear();}
  for(const node of $('facts').children){const f=space.facts.find(f=>f.id===node.dataset.factId);if(!f)continue;const row=node.querySelector('.row');if(f.data&&!f.reference){node.append(el('p','统一资料 · 修改一次，引用问答同步更新','muted'));continue;}
   row.append(action(f.reference?'更改 / 解除资料引用':'引用统一商品资料',()=>{
    const dialog=el('dialog',undefined,'quality-dialog'),select=el('select');dialog.append(el('h2','问答引用统一商品资料'),el('p','关联后保留本问法，答案和来源随统一资料生成。解除后恢复原问答内容；操作后需重新审核发布。'));
    const none=el('option','不引用，使用原问答');none.value='';select.append(none);for(const t of space.facts.filter(t=>t.data&&!t.reference&&t.id!==f.id)){const o=el('option',t.product+' / '+t.question);o.value=t.id;select.append(o);}select.value=f.reference||'';dialog.append(select,action('保存引用',async()=>{await api(`spaces/${current}/fact-reference`,{id:f.id,target:select.value});dialog.close();dialog.remove();await refresh();}),action('取消',()=>{dialog.close();dialog.remove();},'text'));dialog.oncancel=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
   },'text'));
  }
 };
 if(current)globalThis.__zhidaRefreshProducts();
})();
