// Only consume a complete sequence of social phrases. A thank-you followed by
// a product question must continue through retrieval and normal fact checks.
export function socialClosing(lines){
  if(!lines.length)return false;
  const ack='(?:好(?:的|了)?|嗯嗯?|恩恩?|哦哦?|ok|收到|(?:我)?(?:已经|都)?(?:明白了?|了解了?|知道了)|行(?:的)?|可以(?:的)?)';
  const thanks='(?:(?:真(?:是|的)?|太|非常|十分|特别|很|万分|实在)*(?:谢谢|感谢|多谢)(?:你|您)?(?:的?(?:帮助|解答|回答|推荐|介绍|服务|耐心解答))?|谢啦|辛苦(?:你|您)?了?)';
  const done='(?:没关系|不用了|不需要了|(?:我)?(?:没有|没)(?:(?:其他|其它|别的)?(?:问题|疑问|事情|需求))?|(?:我的|我这边的)?(?:问题|疑问)(?:你|您)?(?:都已经|都|已经)?(?:解答|回答|解决)(?:完|清楚)?了)';
  const bye='(?:再见|拜拜|bye(?:bye)?|回见|(?:有|如果有)(?:需要|问题)再(?:联系|咨询|找)(?:你|您))';
  const phrase=new RegExp('^(?:'+[ack,thanks,done,bye].join('|')+')(?:啦|了|啊|呀|哦|呢|哈|喔)*','i');
  return lines.every(line=>{
    if(!line)return false;
    // Consume a phrase at a time instead of backtracking over all partitions of
    // repeated acknowledgements (e.g. a long "嗯嗯…多少钱" message).
    while(line){const match=line.match(phrase);if(!match)return false;line=line.slice(match[0].length);}
    return true;
  });
}

export function contextualConfirmation(lines,previousReply){
  if(!previousReply||!/[？?]|请(?:确认|提供|选择|告诉|补充)/.test(previousReply))return false;
  const short=/^(?:好(?:的)?|可以(?:的)?|行(?:的)?|嗯嗯?|恩恩?|ok)(?:啦|了|啊|呀|哦|呢|哈|喔)*$/i;
  return lines.length>0&&lines.every(line=>short.test(line));
}
