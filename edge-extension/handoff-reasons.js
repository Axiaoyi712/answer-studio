globalThis.ZhidaHandoff={
  categories:{'knowledge-missing':['缺少知识',true],'answer-check':['回答需核对',false],'model-output':['模型格式异常',false],'service-error':['问答服务故障',false],'delivery-uncertain':['发送待核对',false],'page-error':['页面或连接故障',false],'history-review':['历史消息待确认',false],'media-review':['非文字待查看',false],'business-action':['售后或业务处理',false],'manual-request':['客户要求人工',false],'clarification-limit':['需求仍不明确',false],'manual-takeover':['人工接管',false],'general-review':['其他待核对',false]},
  describe(reason='',code=''){
    if(!this.categories[code]){
      const rules=[['delivery-uncertain',/发送失败|结果不明|未确认发送|发送后|禁止重发|回显/],['page-error',/页面|扩展|浏览器|账号发生|登录|输入框|草稿|输入或消息|发送前输入|当前无法发送/],['history-review',/历史|早于.*小时|时间不明/],['service-error',/服务.*(?:不可用|异常|失败)|网络|超时|HTTP|接口.*失败/],['model-output',/模型.*(?:格式|结构|截断|返回|内容)|JSON/],['media-review',/非文字|图片|语音|视频|文件/],['business-action',/退款|退费|投诉|赔偿|售后事项|受伤|过敏/],['manual-request',/要求人工|请求人工|人工请求/],['manual-takeover',/手动接管|人工接管|人工处理中|人工回复|人工窗口/],['clarification-limit',/连续.*追问|澄清.*上限|需求.*不明确/],['answer-check',/核对未通过|事实.*核验|引用|发送审核|回答有误/],['knowledge-missing',/缺少.*(?:资料|知识|依据|规则)|缺乏.*依据|需补充.*资料/]];
      code=rules.find(([,pattern])=>pattern.test(reason))?.[0]||'general-review';
    }
    const [label,knowledgeGap]=this.categories[code];return {code,label,knowledgeGap};
  }
};
