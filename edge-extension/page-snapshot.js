// Adapter dispatch. Account ownership and message IDs are verified by each adapter.
(() => {
  try{return ZhidaPageAdapters.create(globalThis.__zhidaProfile||ZhidaPageAdapters.builtin,location).snapshot();}
  catch(e){return {route:location.href,error:e.message};}
})();
