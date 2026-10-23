(() => {
  const $=id=>document.getElementById(id),key='zhida-web-chat-demo-v1',names={a:'演示客户 A',b:'演示客户 B'};
  let current=location.pathname.split('/').at(-1);if(!names[current])current='a';
  const read=()=>{try{return JSON.parse(localStorage.getItem(key))||{a:[],b:[]};}catch{return {a:[],b:[]};}};
  function render(){
    const state=read();$('contacts').replaceChildren();
    for(const [id,name] of Object.entries(names)){const button=document.createElement('button');button.className='contact';button.dataset.contactId=id;button.dataset.unread=String(state[id].at(-1)?.role==='user'?1:0);button.textContent=name;button.onclick=()=>{current=id;history.pushState(null,'','/web-chat-demo/chat/'+id);document.querySelector('textarea').value='';render();};$('contacts').append(button);}
    document.querySelector('.conversation').dataset.conversationId=current;document.querySelector('.customer-name').textContent=names[current];$('messages').replaceChildren();
    for(const m of state[current]){const item=document.createElement('div'),text=document.createElement('span');item.className='message '+(m.role==='user'?'incoming':'outgoing');item.dataset.messageId=m.id;item.dataset.time=String(m.time);text.className='message-text';text.textContent=m.content;item.append(text);$('messages').append(item);}
    $('messages').scrollTop=$('messages').scrollHeight;
  }
  function append(id,role,content){if(!content.trim())return;const state=read();state[id].push({id:crypto.randomUUID(),time:Date.now(),role,content:content.trim()});localStorage.setItem(key,JSON.stringify(state));render();}
  $('incoming').onclick=()=>append($('customer').value,'user',$('question').value);
  document.querySelector('.send').onclick=()=>{const input=document.querySelector('textarea');append(current,'assistant',input.value);input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));};
  $('block').onclick=()=>{const block=document.querySelector('.demo-blocked');block.hidden=!block.hidden;};
  addEventListener('storage',e=>{if(e.key===key)render();});addEventListener('popstate',()=>{const id=location.pathname.split('/').at(-1);if(names[id]){current=id;render();}});render();
})();
