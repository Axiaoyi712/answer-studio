(() => {
  globalThis.__zhidaClose?.();globalThis.__zhidaAutoClose?.();
  const adapter=ZhidaPageAdapters.create(globalThis.__zhidaProfile||ZhidaPageAdapters.builtin,location),profile=adapter.profile;
  const runningKey=ZhidaPageAdapters.stateKey('receptionSession',profile);let channelPolicy={maxReplyAgeHours:0};
  const bindingId=globalThis.__zhidaBindingId;const reception=globalThis.ZhidaReception;reception.space=globalThis.__zhidaSpace;
  const host=document.createElement('div');host.style.cssText='position:fixed;right:16px;top:80px;width:380px;max-width:95vw;z-index:2147483647';
  const ui=host.attachShadow({mode:'closed'});
  ui.innerHTML=`<style>
:host{font-family:"Microsoft YaHei UI","Microsoft YaHei",system-ui,sans-serif;font-size:16px;font-weight:500;color:#15251b;color-scheme:light}
*{box-sizing:border-box}[hidden]{display:none!important}
button,input,textarea,select{font:inherit}button,a,summary{-webkit-tap-highlight-color:transparent}
button{border:1px solid #81947d;border-radius:10px;background:#fff;color:#244f35;padding:9px 12px;margin:4px 4px 4px 0;cursor:pointer;box-shadow:inset 0 1px #fff,0 1px 2px #233a2410;transition:background .18s,box-shadow .18s,transform .18s,border-color .18s;line-height:1.45}
button:hover:not(:disabled){background:#e9efdf;border-color:#bacdb8;transform:translateY(-1px);box-shadow:inset 0 1px #fff,0 3px 7px #233a2414}
button:active:not(:disabled){transform:translateY(1px);box-shadow:inset 0 2px 3px #34482d18}
button:disabled{opacity:.48;cursor:default}
button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #bd9b47;outline-offset:3px}
#ball{display:none;position:relative;isolation:isolate;width:64px;height:64px;padding:0;margin:0;border-radius:50%;border:1px solid #fffef3;color:#345f49;background:radial-gradient(circle at 29% 22%,#fff 0%,#fbfcf5 25%,#e9eee1 55%,#c6d3be 79%,#8ca78e 100%);box-shadow:inset 2px 3px 5px #fff,inset -3px -5px 8px #66866a66,0 8px 18px #0004,0 2px 4px #0003;touch-action:none;overflow:visible;cursor:grab;transition:transform .2s,box-shadow .2s}
#ball::before{content:"";position:absolute;inset:5px;border-radius:50%;border-top:1px solid #fff9;pointer-events:none}
#ball:hover:not(:disabled){background:radial-gradient(circle at 29% 22%,#fff,#fbfcf5 25%,#e9eee1 55%,#c6d3be 79%,#8ca78e);border-color:#fff;transform:scale(1.06);box-shadow:inset 2px 3px 5px #fff,inset -3px -5px 8px #66866a66,0 11px 24px #0005}
#ball:active:not(:disabled){transform:scale(.96);cursor:grabbing}
#ball svg{width:27px;height:27px;pointer-events:none;filter:drop-shadow(0 1px 1px #fff)}
.ball-badge{position:absolute;top:-4px;right:-5px;min-width:26px;height:26px;padding:0 5px;border:2px solid #fffaf0;border-radius:12px;display:grid;place-items:center;background:linear-gradient(#bd624a,#a33e2d);color:#fff;font-size:15px;font-weight:700;line-height:1;box-shadow:0 2px 5px #0003;pointer-events:none}
.ball-state{position:absolute;width:8px;height:8px;bottom:10px;right:11px;border:1.5px solid #f7faee;border-radius:50%;background:#7e8879;pointer-events:none}
#ball.is-running .ball-state{background:#3e8a58}#ball.is-waiting .ball-state{background:#a97828}#ball.is-error .ball-state{background:#b44f37}
#ball.is-running{animation:porcelain-float 4s ease-in-out infinite}#ball.has-tasks .ball-badge{animation:badge-arrive .28s ease-out}
:host(.is-dragging) #ball{animation:none;transform:none;cursor:grabbing}
:host(.compact) #ball{display:grid;place-items:center}:host(.compact) #panel{display:none}
#panel{position:relative;font-size:16px;line-height:1.7;background:#fff;border:1px solid #81947d;border-radius:20px;padding:0 16px 16px;max-height:80vh;overflow:auto;box-shadow:0 10px 28px #0003,0 2px 6px #0002;scrollbar-width:thin;scrollbar-color:#c3cbb9 transparent;animation:panel-arrive .2s ease-out}
:host(.enlarged) #panel{height:calc(100vh - 32px);max-height:calc(100vh - 32px)}:host(.enlarged) #handoffs{max-height:none}:host(.enlarged) .handoff-card textarea{min-height:140px}
.toolbar{position:sticky;top:0;background:#fff;z-index:2;padding:15px 0 10px;border-bottom:1px solid #81947d;margin-bottom:13px}
.header-row{display:flex;align-items:center;gap:8px}.header-row h3{flex:1;min-width:0;display:flex;align-items:center;gap:9px;margin:0;font-size:18px;font-weight:700;line-height:1.4}
#drag{cursor:grab;touch-action:none}#drag:active{cursor:grabbing}.brand-mark{width:31px;height:31px;flex:none;display:grid;place-items:center;border-radius:10px;background:linear-gradient(#f1f4e6,#e4ead5);color:#466748;border:1px solid #81947d;box-shadow:inset 0 1px #fff;font-size:14px}.brand-caption{display:block;font-size:15px;color:#354435;font-weight:400;margin-top:3px}
.window-tools{display:flex;gap:5px}.window-tools button{width:29px;height:29px;flex:none;display:grid;place-items:center;padding:0;margin:0;border-radius:9px;background:#f5f7ee;box-shadow:inset 0 1px #fff;color:#6b7c65}.window-tools svg{width:15px;height:15px;pointer-events:none}#close:hover{background:#fae9df;border-color:#dcb8a7;color:#9d4633}
#stop{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin:11px 0 0;padding:9px 10px;font-size:16px;color:#925b43;border-color:#e7d6c9;background:#faf5ed;box-shadow:none}#stop:hover{color:#963e2b;background:#f7e8dc;border-color:#d6af99}
p{font-size:15px;color:#354435;margin:10px 0;overflow-wrap:anywhere}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#fffef9;border:1px solid #81947d;border-radius:10px;padding:10px;max-height:200px;overflow:auto;color:#344b36}
summary{cursor:pointer;padding:8px 0;color:#244f35;font-size:16px}details{border-top:1px solid #81947d;margin-top:10px}details[open]>summary{font-weight:600}details p{font-size:15px}
label{display:block;font-size:16px;margin:8px 0}input:not([type=checkbox]),textarea,select{border:1px solid #81947d;border-radius:9px;background:#fffefb;color:#344b36;max-width:100%;padding:9px;box-shadow:inset 0 1px 2px #34482d08}input[type=checkbox]{accent-color:#446e4c}textarea{resize:vertical}
#daily,#start{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin:12px 0 8px;background:#173e35;color:#fff;border:1px solid #416b50;border-radius:12px;padding:12px;font-weight:600;box-shadow:inset 0 1px #ffffff30,0 3px 0 #234832,0 5px 9px #23483218}
#daily:hover,#start:hover{background:#244f3c;box-shadow:inset 0 1px #ffffff30,0 3px 0 #234832,0 7px 12px #23483224}
#daily:active,#start:active{transform:translateY(2px);box-shadow:inset 0 1px 2px #183c3233,0 1px 0 #234832}
#daily svg{width:14px;height:14px;pointer-events:none}
#health{font-size:15px;font-weight:600;color:#354435;background:#e4ecdf;border:1px solid #81947d;border-radius:9px;padding:10px;margin-top:13px}
.queue-metrics{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0 13px}.queue-metrics>div{border-radius:12px;padding:9px 12px;background:#e4ecdf;border:1px solid #81947d;box-shadow:inset 0 1px #ffffff7a}.queue-metrics strong{display:block;font-size:23px;line-height:1.5;color:#35543a;font-weight:600}.queue-metrics span{font-size:15px;color:#354435}
#status{font-size:18px;font-weight:700;line-height:1.7;letter-spacing:.2px;color:#34583d;background:#e8efdf;border:1px solid #81947d;border-left:4px solid #527a50;border-radius:10px;padding:12px;margin:13px 0;box-shadow:inset 0 1px #ffffff8c}
#status[data-state=paused],#status[data-state=waiting]{color:#815b2c;background:#fbf0df;border-color:#ead8b9;border-left-color:#b28b48}
#status[data-state=error]{color:#991b1b;background:#fef2f2;border-color:#ef4444;border-left-color:#dc2626}
#summary,#totals,#caseStatus{font-size:15px;color:#354435}
#handoffAlert{margin-top:12px;padding:11px;border:1px solid #b58352;border-radius:12px;background:#fff4e8;color:#754324;box-shadow:inset 0 1px #fff9}
#handoffAlert strong{display:block;font-size:16px}#handoffAlert p{font-size:15px;color:#754f35;margin:5px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#handoffAlert button{width:100%;margin:7px 0 0;background:#f6e4d7;color:#8a4730;border-color:#e1bba5;box-shadow:inset 0 1px #fff7}
.handoff-card{margin:10px 0;padding:12px;background:#faf5ed;border:1px solid #b58352;border-left:3px solid #ba8a61;border-radius:12px}.handoff-card strong{display:block;font-size:16px;color:#754324}.handoff-card p{margin:7px 0;font-size:15px;color:#754f35}.handoff-card a{display:block;text-align:center;padding:8px 10px;border-radius:9px;border:1px solid #b58352;background:#f2e4d5;color:#754324;text-decoration:none;font-size:16px;transition:background .18s,transform .18s}.handoff-card a:hover{background:#e9d6c2;transform:translateY(-1px)}.handoff-card>button{width:100%;margin:8px 0 0;font-size:16px}.handoff-card details{background:#fffdf7;border-radius:9px;padding:0 9px}.handoff-card textarea{display:block;width:100%;margin:5px 0}.handoff-card form button{max-width:100%;white-space:normal;font-size:16px}
#handoffs{max-height:360px;overflow:auto;scrollbar-width:thin;scrollbar-color:#c3cbb9 transparent}
@keyframes porcelain-float{0%,100%{translate:0 0}50%{translate:0 -2px}}@keyframes badge-arrive{from{scale:.65;opacity:.3}to{scale:1;opacity:1}}@keyframes panel-arrive{from{opacity:.5;translate:0 5px}to{opacity:1;translate:0 0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}

#panel{color:#15251b}button{min-height:42px}#ball{min-height:64px}.window-tools button{width:32px;height:32px;min-height:32px;color:#354435;border-color:#81947d}.window-tools svg{width:17px;height:17px}.brand-mark{font-size:16px}.handoff-card a{min-height:44px}textarea,select,input:not([type=checkbox]){font-size:16px;color:#15251b}.handoff-card details{background:#fff}#handoffAlert p{-webkit-line-clamp:3}
/* C2: dark frame, ice-blue actions, white editing fields. */
:host{font-size:17px;font-weight:400;color:#f3f4f6;color-scheme:dark}
#panel{font-size:17px;line-height:1.8;background:#17212d;color:#f3f4f6;border-color:#69778a;box-shadow:0 14px 35px #0005;scrollbar-color:#8796ab #111820}
.toolbar{background:#111820;border-color:#657184}.header-row h3{font-size:21px;font-weight:600}.brand-caption{color:#cbd5e1}.brand-mark{background:#29372f;color:#d6f5df;border-color:#779c86;box-shadow:none}
button{font-size:17px;background:#263b50;color:#e6f2ff;border-color:#7998b8;box-shadow:none}button:hover:not(:disabled){background:#344f6b;border-color:#a5c5e5;box-shadow:none}button:active:not(:disabled){box-shadow:none}
.window-tools button{background:#232a34;color:#f3f4f6;border-color:#8995a6;box-shadow:none}#close:hover{background:#451c20;color:#fecaca;border-color:#ff7676}
#stop{font-size:17px;background:#263b50;color:#e6f2ff;border-color:#7998b8}#stop:hover{background:#344f6b;color:#fff;border-color:#a5c5e5}
#daily,#start,.handoff-card form button{font-size:17px;background:#9bceff;color:#10283e;border-color:#9bceff;box-shadow:none;font-weight:600}#daily:hover,#start:hover,.handoff-card form button:hover{background:#b4dcff;color:#10283e;border-color:#b4dcff;box-shadow:none}#daily:active,#start:active{box-shadow:none}
p,details p,#summary,#totals,#caseStatus{font-size:16px;color:#cbd5e1}label{font-size:17px;color:#f3f4f6}summary{font-size:17px;color:#e6f2ff}
details{border-color:#657184}#panel>details:not(#handoffList):not(#recent):not(#caseControls){background:#090c10;padding:0 12px;border-radius:9px}#panel>details:not(#handoffList):not(#recent):not(#caseControls) summary{font-size:16px;color:#cbd5e1}
pre{background:#090c10;color:#e6edf5;border-color:#657184}
textarea,select,input:not([type=checkbox]){font-size:17px;font-weight:400;line-height:1.85;background:#fff;color:#111827;border-color:#8895a6;box-shadow:none;color-scheme:light}textarea::placeholder,input::placeholder{color:#475569;opacity:1}input[type=checkbox]{accent-color:#9bceff}
#health{font-size:16px;background:#24384d;color:#e8f4ff;border-color:#7998b8}.queue-metrics>div{background:#24384d;color:#e8f4ff;border-color:#7998b8;box-shadow:none}.queue-metrics strong{color:#e8f4ff;font-size:26px}.queue-metrics span{color:#e8f4ff;font-size:16px}.queue-metrics>div:last-child{background:#e2efff;border-color:#b5d8ff}.queue-metrics>div:last-child strong,.queue-metrics>div:last-child span{color:#15365a}
#status{font-size:19px;font-weight:600;background:#123321;color:#bbf7d0;border-color:#4dbe79;border-left-color:#4ade80;box-shadow:none}#status[data-state=paused],#status[data-state=waiting]{background:#3c3012;color:#fde68a;border-color:#e6b748}#status[data-state=error]{background:#451c20;color:#fecaca;border-color:#ff7676}
#handoffAlert{background:#3c3012;color:#fde68a;border-color:#e6b748;box-shadow:none}#handoffAlert strong,#handoffAlert p{color:#fde68a}#handoffAlert button{background:#9bceff;color:#10283e;border-color:#9bceff}
.handoff-card{background:#25374c;color:#f3f4f6;border-color:#85a8cc;border-left-color:#9bceff}.handoff-card strong{font-size:17px;color:#f3f4f6}.handoff-card p{font-size:16px;color:#e6edf5}.handoff-card a{font-size:17px;background:#cbe5ff;color:#10283e;border-color:#85a8cc}.handoff-card a:hover{background:#e2efff}.handoff-card details{background:#111820}.handoff-card textarea{color:#111827}.handoff-card form button{font-size:17px}
#handoffs{scrollbar-color:#8796ab #111820}:focus-visible{outline-color:#6abaff}
.theme-control{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 0;font-size:16px;color:#cbd5e1}.theme-control select{width:auto;max-width:220px;margin:0;padding:5px 9px;font-size:16px;background:#232a34;color:#f3f4f6;border-color:#8995a6;color-scheme:dark}
:host(.day){color:#27231f;color-scheme:light}:host(.day) #panel{background:#fffaf2;color:#27231f;border-color:#97856d;scrollbar-color:#8895a6 #f0e9dd}:host(.day) .toolbar{background:#fffaf2;border-color:#bcb09d}
:host(.day) .brand-caption,:host(.day) .theme-control{color:#5b5147}:host(.day) .theme-control select,:host(.day) .window-tools button{background:#f0e9dd;color:#27231f;border-color:#97856d;color-scheme:light}
:host(.day) button{background:#f0e9dd;color:#27231f;border-color:#97856d}:host(.day) button:hover:not(:disabled){background:#e7dccb;border-color:#89765f}:host(.day) #stop{background:#f0e9dd;color:#27231f;border-color:#97856d}
:host(.day) #daily,:host(.day) #start,:host(.day) .handoff-card form button{background:#25483d;color:#fffdf8;border-color:#25483d}:host(.day) #daily:hover,:host(.day) #start:hover,:host(.day) .handoff-card form button:hover{background:#315a4b}
:host(.day) p,:host(.day) details p,:host(.day) #summary,:host(.day) #totals,:host(.day) #caseStatus{color:#5b5147}:host(.day) label,:host(.day) summary{color:#27231f}:host(.day) details{border-color:#bcb09d}
:host(.day) #panel>details:not(#handoffList):not(#recent):not(#caseControls){background:#f0e9dd}:host(.day) #panel>details:not(#handoffList):not(#recent):not(#caseControls) summary{color:#5b5147}:host(.day) pre{background:#f0e9dd;color:#27231f;border-color:#bcb09d}
:host(.day) #health,:host(.day) .queue-metrics>div{background:#f5eee3;color:#27231f;border-color:#bcb09d}:host(.day) .queue-metrics strong,:host(.day) .queue-metrics span{color:#27231f}:host(.day) .queue-metrics>div:last-child{background:#eee4d3}
:host(.day) #status{background:#ecfdf3;color:#14532d;border-color:#60a878;border-left-color:#16813a}:host(.day) #status[data-state=paused],:host(.day) #status[data-state=waiting]{background:#fffbeb;color:#78350f;border-color:#c79b34}:host(.day) #status[data-state=error]{background:#fef2f2;color:#991b1b;border-color:#ef4444}
:host(.day) #handoffAlert{background:#fffbeb;color:#78350f;border-color:#c79b34}:host(.day) #handoffAlert strong,:host(.day) #handoffAlert p{color:#78350f}:host(.day) #handoffAlert button{background:#25483d;color:#fffdf8;border-color:#25483d}
:host(.day) .handoff-card{background:#f5eee3;color:#27231f;border-color:#bcb09d}:host(.day) .handoff-card strong{color:#27231f}:host(.day) .handoff-card p{color:#5b5147}:host(.day) .handoff-card a{background:#e7dece;color:#fffdf8;border-color:#25483d}:host(.day) .handoff-card details{background:#fff}:host(.day) #handoffs{scrollbar-color:#8895a6 #f0e9dd}
:host(.day) textarea,:host(.day) select,:host(.day) input:not([type=checkbox]){background:#fffdf8;color:#27231f;border-color:#97856d}:host(.day) .handoff-card a{color:#27231f}
.recovery-alert{padding:14px;border:2px solid #ff7676;border-radius:10px;background:#451c20;color:#fecaca;line-height:1.8}:host(.day) .recovery-alert{background:#fef2f2;color:#991b1b;border-color:#ef4444}
</style><button id="ball" aria-label="展开客服面板" title="点击展开，拖动移动"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7h16a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H14l-7 4v-4a4 4 0 0 1-4-4V11a4 4 0 0 1 5-4Z"/><path d="m12 16 3 3 6-7"/></svg><span id="ballBadge" class="ball-badge" hidden></span><span class="ball-state" aria-hidden="true"></span></button><section id="panel"><div class="toolbar"><div class="header-row"><h3 id="drag"><span class="brand-mark">知</span><span>智能客服<small class="brand-caption">知答 · v0.11.0</small></span></h3><div class="window-tools"><button id="minimize" aria-label="缩成悬浮球" title="缩成悬浮球，接待继续运行"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10h12"/></svg></button><button id="close" aria-label="关闭客服并停止自动回复" title="关闭客服并停止自动回复"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div></div><button id="stop" title="停止全部自动回复"><span aria-hidden="true">Ⅱ</span> 暂停接待</button><p id="status" role="status" data-state="paused">尚未启动，不会发送。</p></div><div id="handoffAlert" hidden role="alert" aria-live="assertive" aria-atomic="true"><strong id="handoffAlertTitle"></strong><p id="handoffAlertReason"></p><p id="handoffScope"></p><button id="showHandoffs">查看人工待办</button></div><p>自动识别当前账号、联系人和输入框，不用填写顾客信息。此页专用于自动接待，人工请使用独立窗口。群聊不自动回复。</p><button id="daily" title="自动发送回复，处理当前及其他待回复私信"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="m5 3 8 5-8 5Z"/></svg>开始日常接待</button><p>日常接待会处理当前未回复消息与其他未读私信。下方保留逐步测试模式。</p><details id="tests"><summary>检测、草稿和单条验证</summary><label>运行模式<select id="mode" style="display:block;width:100%;padding:8px;margin:8px 0"><option value="detect">1 · 只检测，不调用模型</option><option value="draft">2 · 生成回复，不填写或发送</option><option value="auto">3 · 自动回复 / 单条验证</option></select></label><label style="display:block"><input type="checkbox" id="scan"> 检查未读会话切换</label><p>勾选后会打开未读会话和陌生人消息夹，可能将消息标为已读。默认只检查当前页面。</p><label id="continuousLabel" hidden><input type="checkbox" id="continuous"> 连续自动回复（不勾选时只发送一条）</label><button id="start">开始检测</button></details><p id="health" role="status">已暂停 · 尚未检查</p><div class="queue-metrics"><div><strong id="pendingValue">0</strong><span>待回复</span></div><div><strong id="handoffValue">0</strong><span>待人工</span></div></div><p id="summary">尚未读取页面。</p><p id="totals">生成 0 次 · 确认发送 0 条</p><p id="caseStatus">当前会话：尚未识别</p><details id="caseControls"><summary>当前会话接管与恢复</summary><button id="takeover" disabled>仅接管当前会话</button><button id="resumeCase" disabled>人工已完成，恢复此客户</button><p>恢复只跳过原人工待办，新问题继续接待；其他会话保持运行。</p></details><details><summary>接待与人工交接说明</summary><p>人工处理完成后关闭独立人工窗口，会自动返回此页并恢复该客户接待，无需再点恢复。自动客服保留在原窗口。鼠标、键盘、切换窗口或标签页不会暂停接待。输入框有草稿时先备份，仅跳过当前客户，继续接待其他顾客；需停止请点击“暂停接待”。账号变化或平台限制会整体停发；发送结果不明确仅交人工核对对应客户。</p></details><details><summary>本次合并的问题</summary><pre id="question">暂无</pre></details><details><summary>最新回复（检测模式不生成）</summary><p id="engine"></p><p id="reason"></p><pre id="reply">暂无</pre></details><details open id="handoffList"><summary id="handoffHeading">需要人工处理</summary><div id="handoffs">暂无</div></details><details id="recent"><summary>近期接待、纠错与知识整理</summary><button id="loadRecent">刷新近期接待</button><div id="recentItems"></div></details><details><summary>运行记录</summary><pre id="log"></pre></details><details><summary>页面识别失败？</summary><p>报告汇总本次运行的阶段和操作次数，不额外读取网页；不包含消息正文、账号 ID 或令牌。</p><button id="diagnose">生成诊断报告</button><pre id="diagnostic"></pre></details></section>`;
  document.documentElement.append(host);
  const $=id=>ui.getElementById(id),policy=globalThis.ZhidaInboxPolicy;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let recoveryKind='';
  function showRecovery(kind){
    if(recoveryKind)return;recoveryKind=kind;running=false;epoch++;clearInterval(timer);clearInterval(heartbeatTimer);observer.disconnect();
    $('daily').disabled=true;$('start').disabled=true;
    const box=document.createElement('div');box.setAttribute('role','alert');box.className='recovery-alert';
    box.textContent=kind==='blocked'?'当前网页出现阻断提示，此页面已停止接待。处理页面提示后重新打开客服；其他页面不受影响。':kind==='restricted'?'平台限制访问：已停止接待与页面检查。请在 Edge 扩展管理中停用知答，按平台提示重启浏览器；停用时先确认手动聊天正常。不要反复点击启动。':'扩展已更新或停用：旧助手已停止。请刷新聊天页后重新打开知答，知识和待办会保留。';
    if(kind!=='restricted'&&kind!=='blocked'){const button=document.createElement('button');button.textContent='刷新聊天页';button.onclick=()=>location.reload();box.append(button);}
    $('status').after(box);log(kind==='restricted'?'平台限制访问，已停止；请按下方步骤处理':'扩展连接已失效，请刷新聊天页');
    if(kind==='restricted'||kind==='blocked'){
      chrome.storage.local.get(runningKey).then(data=>{const saved=data[runningKey];return saved?.space===reception.space&&(!account||saved.account===account)?chrome.storage.local.set({[runningKey]:{...saved,desired:false}}):undefined;}).catch(()=>{});
      if(account)persistRunning(false).catch(()=>{});
    }
  }
  let running=false,busy=false,epoch=0,account='',expectedRoute=location.href,mode='detect',phase='未启动',lastFailure=null,latest=null;
  const stats={reads:0,models:0,opened:0,filled:0,sent:0,confirmed:0};
  let lastModelDiagnostic=null,serviceGeneration=null;
  let lastModelAt=0,lastSendAt=0,modelFailures=0,heartbeatBusy=false;
  async function reportHealth(){
    if(!account||heartbeatBusy||recoveryKind==='context')return;heartbeatBusy=true;
    try{await request('heartbeat',{account,running:running&&mode==='auto',phase,lastRead:lastHealth,lastModel:lastModelAt,lastSend:lastSendAt,pending:pendingCount,handoffs:handoffs.size,failures:modelFailures,waiting:waitingForDraft});}catch{}finally{heartbeatBusy=false;}
  }
  let openingManual=false,activeReply=null;
  let daily=false,lastHealth=0,lastPing=0,pendingCount=0,waitingForDraft=false,serviceHealthy=true,statusError=false,runWrites=Promise.resolve();const bursts=new Map(),seenOwn=new Map();
  async function persistRunning(desired){if(!account||recoveryKind==='context')return;const owner=account;runWrites=runWrites.catch(()=>{}).then(()=>request('runState',{account:owner,desired}));try{await runWrites;}catch(e){if(!recoveryKind)log('运行状态保存失败：'+e.message,true);if(desired)throw e;}}
  function health(){
    const text=!serviceHealthy?'连接异常':running?waitingForDraft?'当前会话保留草稿，其他接待继续':'接待中':'已暂停';
    $('health').textContent=text+' · 最后检查 '+(lastHealth?new Date(lastHealth).toLocaleTimeString():'尚无');
    const faulted=statusError||!serviceHealthy||!!recoveryKind;
    $('status').dataset.state=faulted?'error':!running?'paused':waitingForDraft?'waiting':'running';
    $('pendingValue').textContent=pendingCount;$('handoffValue').textContent=handoffs.size;
    $('ballBadge').hidden=!handoffs.size;$('ballBadge').textContent=handoffs.size>99?'99+':String(handoffs.size);
    const label='知答 · '+text+(handoffs.size?' · 待办 '+handoffs.size+' 个会话':'');
    $('ball').setAttribute('aria-label',label+'，点击展开客服面板');$('ball').title=label+'；点击展开，拖动移动';
    $('ball').classList.toggle('has-tasks',!!handoffs.size);
    $('ball').classList.toggle('is-running',running&&!waitingForDraft&&!faulted);
    $('ball').classList.toggle('is-waiting',running&&waitingForDraft&&!faulted);
    $('ball').classList.toggle('is-error',faulted);
  }
  async function journal(s,patch){reception.account=s.account;return reception.record(s,patch,(action,extra)=>request(action,extra));}
  async function finishTask(s){await reception.state(s.account,s.conversation.id,'done');}
  function attachKnowledgeDraft(form,r){
    const button=document.createElement('button');button.type='button';button.textContent='用 AI 提炼知识草稿';
    const hint=document.createElement('p');hint.textContent='请核对答案、补充依据后保存；AI 整理不会自动审核或发布。';
    button.onclick=async()=>{button.disabled=true;try{const draft=await request('prepare-knowledge',{fact:{question:r?.question||'请整理这段人工接待记录',history:(r?.history||[]).filter(m=>m.type===1||m.type===undefined).map(({role,content})=>({role,content})),humanAnswer:['manual','done'].includes(r?.state)?r?.history?.filter(m=>m.role==='assistant').at(-1)?.content||'':'',answer:r?.state==='answer'?r.answer:''}});for(const key of ['product','question','answer','source'])form.elements[key].value=draft[key]||'';hint.textContent='AI 草稿已生成，请核实事实并补充资料依据，再保存待审核。';}catch(e){hint.textContent=e.message+'；仍可手工填写。';}finally{button.disabled=false;}};
    form.prepend(button,hint);
  }

  let badgeCount=-1;
  const displayedHandoffs=new Map();
  const resuming=new Set();
  const resumeChecks=new Set();
  const observed=new Map(),blocked=new Set(),logs=[],handoffs=new Map(),cases=new Map(),draftRead=new Map();
  const preservedDrafts=new Map();let displayedDraft=null;
  let yieldFrom='',lastListScan=0;const coverage=new Map();
  const coverageLabel=document.createElement('p');coverageLabel.id='coverage';$('summary').after(coverageLabel);
  async function scanList(s,g){
    const key=s.inFolder?'folder':'main',state=coverage.get(key)||{seen:new Set(),steps:0,bottom:false,at:0};coverage.set(key,state);
    s.targets.filter(t=>t.kind==='c2c').forEach(t=>state.seen.add(t.id));const info=s.listScan;
    coverageLabel.textContent=(s.inFolder?'陌生人列表':'会话列表')+' · 本轮已发现 '+state.seen.size+' 个私信会话 · '+(state.bottom?'已检查到当前页面列表底部':info?.scrollable?'正在分批检查':'仅确认已加载范围，无法据此判断全部私信');
    if(!info?.supported||!info.scrollable||Date.now()-lastListScan<15000)return false;
    if(state.pauseUntil>Date.now()||state.bottom&&Date.now()-state.at<60000)return false;lastListScan=Date.now();
    const node=adapter.viewport();if(!node)return false;guard(g);
    if(!state.started&&node.scrollTop>2){node.scrollTop=0;state.started=true;state.steps++;}
    else if(node.scrollTop+node.clientHeight>=node.scrollHeight-2){state.bottom=true;state.at=Date.now();state.steps=0;state.started=false;node.scrollTop=0;}
    else{state.bottom=false;state.started=true;node.scrollTop+=Math.max(80,node.clientHeight*.8);state.steps++;if(state.steps>=40){state.at=Date.now();state.pauseUntil=Date.now()+60000;state.steps=0;coverageLabel.textContent+=' · 本轮达到分批上限，稍后继续检查';}}
    node.dispatchEvent(new Event('scroll',{bubbles:true}));await sleep(500);guard(g);dirty=true;return true;
  }
  const draftSection=document.createElement('details'),draftHeading=document.createElement('summary'),draftItems=document.createElement('div');
  draftSection.id='savedDrafts';draftSection.hidden=true;draftSection.append(draftHeading,draftItems);$('totals').after(draftSection);
  function renderDrafts(){
    draftSection.hidden=!preservedDrafts.size;draftHeading.textContent='已保留的草稿（'+preservedDrafts.size+'）';draftItems.replaceChildren();
    for(const d of preservedDrafts.values()){
      const card=document.createElement('article'),name=document.createElement('strong'),text=document.createElement('textarea'),copy=document.createElement('button'),hint=document.createElement('p');
      card.className='handoff-card';name.textContent=d.name||'私信';text.value=d.text;text.readOnly=true;text.setAttribute('aria-label',name.textContent+'的本地草稿');
      copy.textContent='复制草稿';copy.onclick=async()=>{try{await navigator.clipboard.writeText(d.text);copy.textContent='已复制';}catch{log('复制失败，请选中草稿文字复制',true);}};
      hint.textContent='返回对应会话时自动恢复；清空后继续该客户；人工发送后可在待办恢复接待。其他客户照常接待。';card.append(name,text,copy,hint);draftItems.append(card);
    }
  }
  async function preserveDraft(s,g){
    if(s.conversation?.kind!=='c2c')return false;
    const id=s.conversation.id,key=policy.draftKey(s.account,id),saved=preservedDrafts.get(id),input=editor();let text=s.editorText||'';
    if(saved&&!text.trim()){
      const own=s.messages.filter(m=>m.role==='assistant').at(-1);
      if(displayedDraft?.key===key&&displayedDraft.input===input||own&&own.id!==saved.lastOwn&&own.content===saved.text&&!own.pending&&!own.failed){
        await chrome.storage.local.remove(key);guard(g);preservedDrafts.delete(id);displayedDraft=null;renderDrafts();waitingForDraft=false;health();return false;
      }
      guard(g);adapter.fill(input,saved.text);
      const fresh=await snapshot();guard(g);if(!policy.same(s,fresh)||fresh.editorText!==saved.text)throw new Error('草稿恢复时页面或输入变化，备份仍保留，请核对后启动');
      text=saved.text;
    }
    if(!text.trim()){displayedDraft=null;return false;}
    if(!saved||saved.text!==text){
      const draft={account:s.account,conversation:id,name:s.conversation.name,text,lastOwn:s.messages.filter(m=>m.role==='assistant').at(-1)?.id||'',time:Date.now()};
      await chrome.storage.local.set({[key]:draft});guard(g);preservedDrafts.set(id,draft);renderDrafts();
    }
    displayedDraft={key,input};const fresh=await snapshot();guard(g);
    if(!policy.same(s,fresh)||fresh.editorText!==text)throw pageChanged();
    const note='当前草稿已保留，仅跳过此客户；继续接待其他顾客';if($('status').textContent!==note)log(note);return true;
  }
  let dirty=true,checkAt=0,folderEntry=null,folderChecked=null;
  const observer=new MutationObserver(()=>{dirty=true;});observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','data-conv-id','data-message-id']});
  function log(message,error=false){statusError=error;$('status').textContent=message;updateHandoffScope();health();logs.unshift(new Date().toLocaleTimeString()+' ['+phase+'] '+message);logs.splice(25);$('log').textContent=logs.join('\n');}
  function stop(reason,persist=true,error=false){running=false;epoch++;log(reason,error);health();reportHealth();if(daily&&persist)persistRunning(false).catch(()=>{});}
  async function pauseFault(reason){stop(reason,true,true);try{await request('notify',{account,fault:true});}catch{}} 
  function pageChanged(){return Object.assign(new Error('会话已切换，继续检查当前页面'),{code:'conversation-changed'});}
  function platformGuard(){const fault=adapter.fault();if(fault){showRecovery(fault.code==='platform-restricted'?'restricted':'blocked');throw new Error(fault.error);}}
  function guard(g){if(!running||g!==epoch)throw new Error('已停止');platformGuard();if(location.href!==expectedRoute)throw pageChanged();}
  async function request(action,extra={}){let r;try{r=await chrome.runtime.sendMessage({action,generation:serviceGeneration,...extra,bindingId,pageUrl:location.href});}catch(e){if(/Extension context invalidated/i.test(e.message)){showRecovery('context');throw new Error('扩展已更新或停用，请刷新聊天页');}throw e;}if(r?.data?.code==='platform-restricted')showRecovery('restricted');if(r?.data?.code==='page-blocked')showRecovery('blocked');if(r?.error)throw new Error(r.error);if(!r?.data)throw new Error('扩展连接已失效，请重新打开助手');return r.data;}
  async function snapshot(){platformGuard();phase='页面读取';stats.reads++;let s;try{s=await request('pageSnapshot');platformGuard();if(s.error)throw new Error(s.error);if(s.route!==location.href)throw pageChanged();}catch(e){platformGuard();if(ZhidaPageAdapters.transient(e))throw pageChanged();throw e;}if(account&&s.account!==account)throw new Error('登录账号发生变化，请关闭后重新打开助手');waitingForDraft=mode==='auto'&&!!s.editorText?.trim();if(mode==='auto')reception.stamp(s);latest=s;lastHealth=Date.now();if(mode==='auto'){await reception.observe(s);reception.account=s.account;pendingCount=(await reception.tasks(s.account)).filter(t=>t.state==='pending').length;}health();$('summary').textContent='已加载 '+s.targets.length+' 个列表项，'+s.targets.filter(t=>t.kind==='c2c'&&t.unread>0).length+' 个未读私信；'+(s.conversation?'当前会话 '+s.messages.length+' 条消息':'当前未打开会话');$('totals').textContent='生成 '+stats.models+' 次 · 确认发送 '+stats.confirmed+' 条';$('takeover').disabled=!s.conversation||s.conversation.kind!=='c2c';await loadCase(s);return s;}
  const editor=()=>adapter.editor();
  function updateHandoffScope(){$('handoffScope').textContent=running&&mode==='auto'?$('scan').checked?'仅这些会话等待人工，其他顾客继续自动接待。':'当前只处理此会话；开启日常接待可接待其他顾客。':'这些会话等待人工；自动接待当前未运行。';}
  function renderHandoffs(){
    const items=[...handoffs.entries()].reverse();
    const changed=items.some(([id,item])=>displayedHandoffs.get(id)!==item.name+'\n'+item.reason);
    displayedHandoffs.clear();for(const [id,item] of items)displayedHandoffs.set(id,item.name+'\n'+item.reason);
    health();$('handoffHeading').textContent='需要人工处理（'+items.length+'）';$('handoffs').replaceChildren();
    $('handoffAlert').hidden=!items.length;updateHandoffScope();
    const title='待人工接待 · '+items.length+' 个会话';
    const detail=items.length?items[0][1].name+'：'+items[0][1].reason:'';
    if($('handoffAlertTitle').textContent!==title)$('handoffAlertTitle').textContent=title;
    if($('handoffAlertReason').textContent!==detail)$('handoffAlertReason').textContent=detail;
    if(badgeCount!==items.length){badgeCount=items.length;try{chrome.runtime.sendMessage({action:'handoffBadge',bindingId,pageUrl:location.href,count:items.length}).catch(()=>{});}catch{}}
    if(!items.length){$('handoffs').textContent='暂无';return;}
    for(const [id,item] of items){const box=document.createElement('article'),name=document.createElement('strong'),text=document.createElement('p'),link=document.createElement('a'),resume=document.createElement('button');box.className='handoff-card';name.textContent=item.name;text.textContent='['+globalThis.ZhidaHandoff.describe(item.reason,item.reasonCode).label+'] '+item.reason;link.textContent='独立窗口人工处理';link.href=adapter.conversationUrl(id);link.target='_blank';link.rel='noopener noreferrer';link.onclick=e=>{e.preventDefault();openHandoff(id);};resume.textContent=resuming.has(id)?'正在恢复…':'人工已完成，恢复自动接待';resume.disabled=resuming.has(id);resume.onclick=()=>resumeHandoff(id);const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent='查看详情 / 纠错 / 整理知识';detail.append(summary);detail.ontoggle=async()=>{if(!detail.open||detail.dataset.loaded)return;detail.dataset.loaded='1';const r=await reception.detail(account,id);const content=document.createElement('pre');content.textContent=r?JSON.stringify({问题:r.question,近期对话:r.history,拟回复:r.answer,引用资料:r.sources,原因:r.reason},null,2):'暂无已保存详情，请打开人工窗口查看。';detail.append(content);const correct=document.createElement('button');correct.textContent='标记回答有误，转人工纠正';correct.onclick=async()=>{const key=policy.caseKey(account,id),c=cases.get(key)||{handled:[]};const next={...c,state:'handoff',reason:'回答有误，等待人工纠正',reasonCode:'answer-check',time:Date.now()};await chrome.storage.local.set({[key]:next});cases.set(key,next);blocked.add(id);handoffs.set(id,{name:item.name,reason:next.reason});renderHandoffs();};detail.append(correct);const form=document.createElement('form');for(const [key,label,value] of [['product','商品 / 服务',''],['question','标准问题',r?.question||''],['answer','正确的人工答案',r?.history?.filter(m=>m.role==='assistant').at(-1)?.content||''],['source','资料依据（请人工核实）','']]){const l=document.createElement('label');l.textContent=label;const input=document.createElement('textarea');input.name=key;input.value=value;input.required=true;l.append(input);form.append(l);}const learn=document.createElement('button');learn.textContent='整理为待审核知识';form.append(learn);attachKnowledgeDraft(form,r);form.onsubmit=async e=>{e.preventDefault();learn.disabled=true;try{await request('learn',{fact:Object.fromEntries(new FormData(form))});learn.textContent='已存为待审核，请到工作台审核发布';}catch(e){log(e.message,true);}finally{learn.disabled=false;}};detail.append(form);};const brief=document.createElement('p');const c=cases.get(policy.caseKey(account,id));brief.textContent=(c?.question||'等待核对')+' · 等待 '+Math.max(0,Math.floor((Date.now()-(c?.time||Date.now()))/60000))+' 分钟';box.append(name,text,brief,link,resume,detail);$('handoffs').append(box);}
    if(changed)showHandoffs();
  }
  function showHandoffs(){
    $('handoffList').open=true;$('handoffs').scrollTop=0;
    $('panel').scrollTop+=Math.max(0,$('handoffList').getBoundingClientRect().top-ui.querySelector('.toolbar').getBoundingClientRect().bottom-12);
  }
  $('loadRecent').onclick=async()=>{
    const all=await chrome.storage.local.get(null);$('recentItems').replaceChildren();
    for(const r of Object.entries(all).filter(([key,v])=>key.startsWith('reception-detail:')&&v.account===account).map(([,v])=>v).sort((a,b)=>b.time-a.time).slice(0,20)){
      const box=document.createElement('article');box.className='handoff-card';const name=document.createElement('strong');name.textContent=r.name||'顾客';const text=document.createElement('pre');text.textContent=JSON.stringify({问题:r.question,答案:r.answer,对话:r.history,依据:r.sources},null,2);box.append(name,text);
      const correct=document.createElement('button');correct.textContent='回答有误，转人工纠正';correct.onclick=async()=>{const key=policy.caseKey(account,r.conversation),c=cases.get(key)||(await chrome.storage.local.get(key))[key]||{handled:[]};const next={...c,state:'handoff',reason:'回答有误，等待人工纠正',reasonCode:'answer-check',question:r.question,name:r.name,manualPending:r.ids||[],time:Date.now()};await chrome.storage.local.set({[key]:next});cases.set(key,next);blocked.add(r.conversation);handoffs.set(r.conversation,{name:r.name||'顾客',reason:next.reason});await reception.state(account,r.conversation,'handoff');await journal({account,conversation:{id:r.conversation,name:r.name},messages:r.history||[]},{...r,state:'handoff',reason:next.reason});renderHandoffs();await request('notify',{account,conversation:r.conversation});};box.append(correct);
      const form=document.createElement('form');for(const [key,label,value] of [['product','商品 / 服务',''],['question','标准问题',r.question||''],['answer','核实后的答案',r.state==='answer'?r.answer:r.history?.filter(m=>m.role==='assistant').at(-1)?.content||''],['source','资料依据','']]){const l=document.createElement('label');l.textContent=label;const t=document.createElement('textarea');t.name=key;t.value=value||'';t.required=true;l.append(t);form.append(l);}const submit=document.createElement('button');submit.textContent='整理为待审核知识';form.append(submit);attachKnowledgeDraft(form,r);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await request('learn',{fact:Object.fromEntries(new FormData(form))});submit.textContent='已创建，去工作台审核发布';}catch(e){log(e.message,true);}finally{submit.disabled=false;}};box.append(form);$('recentItems').append(box);
    }
    if(!$('recentItems').children.length)$('recentItems').textContent='暂无记录，完整记录和归档请到工作台查看。';
  };
  const archiveOld=document.createElement('button');archiveOld.textContent='归档并清理90天前已完成的旧任务';archiveOld.onclick=async()=>{archiveOld.disabled=true;try{const r=await reception.archive(account,(a,x)=>request(a,x));log(r.count?'已校验归档并清理 '+r.count+' 条旧记录；人工和发送结果未确认的记录保留':'没有可清理的旧记录；未完成任务和客户处理进度保留');}catch(e){log(e.message,true);}finally{archiveOld.disabled=false;}};$('recent').append(archiveOld);
  $('showHandoffs').onclick=showHandoffs;
  async function openHandoff(id){
    if(openingManual)return;openingManual=true;
    try{
      if(!blocked.has(id)){
        const key=policy.caseKey(account,id),c=cases.get(key)||(await chrome.storage.local.get(key))[key]||{handled:[]};
        const next={...c,state:'manual',manualPending:draftRead.get(id)||[],name:handoffs.get(id)?.name||'私信',reason:'已打开独立人工窗口',time:Date.now()};
        await chrome.storage.local.set({[key]:next});cases.set(key,next);blocked.add(id);
      }
      const c=cases.get(policy.caseKey(account,id));if(c){const next={...c,state:'manual'};cases.set(policy.caseKey(account,id),next);await chrome.storage.local.set({[policy.caseKey(account,id)]:next});}
      await request('openHandoff',{bindingId,conversation:id});
      log(running?'人工窗口已打开；处理完关闭该窗口，会自动返回并恢复接待':'人工窗口已打开；关闭后自动恢复客户状态，全局接待仍保持停止');
    }catch(e){log('人工窗口未打开：'+e.message,true);}finally{openingManual=false;}
  }
  async function resumeHandoff(id){
    if(resuming.has(id)||openingManual)return {ok:false,error:'交接尚在进行，请稍后重试'};resuming.add(id);renderHandoffs();
    try{
      const s=await request('pageSnapshot');if(s.error)throw new Error(s.error);
      if(!account||s.account!==account||s.route!==location.href)throw new Error('账号或页面已变化，请重新打开助手');
      const key=policy.caseKey(account,id),c=cases.get(key)||(await chrome.storage.local.get(key))[key]||{state:'active',handled:[]};
      await request('completeCase',{account,conversation:id}).catch(()=>{});
      await reception.state(account,id,'pending');
      const record=await reception.detail(account,id);if(record)await journal({...s,conversation:{id,name:c.name},messages:record.history||[]},{...record,state:'done'});
      let held=c.manualPending;
      if(!Array.isArray(held)){
        held=[...(draftRead.get(id)||[])];
        // Older versions kept handoff/uncertain IDs in delivery records only.
        for(const [record,value] of Object.entries(await chrome.storage.local.get(null))){
          if(!record.startsWith('inbox:')||!['handoff','sending','unknown'].includes(value?.state))continue;
          let ids;try{ids=JSON.parse(record.slice('inbox:'.length));}catch{continue;}
          if(ids[0]===account&&ids[1]===id&&Array.isArray(ids[2]))held.push(...ids[2]);
        }
      }
      const next={...c,state:'active',reason:'',reasonCode:'',manualPending:[],question:'',clarifications:0,noticeAttempted:false,noticeSent:false,handled:policy.handled(c.handled||[],held.map(id=>({id}))),time:Date.now()};
      await chrome.storage.local.set({[key]:next});cases.set(key,next);blocked.delete(id);handoffs.delete(id);draftRead.delete(id);observed.delete(id);seenOwn.delete(id);resumeChecks.add(id);dirty=true;
      if(latest?.conversation?.id===id)await loadCase(latest);
      log(running&&mode==='auto'?'该客户已恢复自动接待；原待办不重发，新问题继续接待':'该客户已允许自动接待；点击开始日常接待后处理新问题');
      return {ok:true};
    }catch(e){log('恢复失败：'+e.message,true);return {ok:false,error:e.message};}finally{resuming.delete(id);renderHandoffs();}
  }
  async function loadCase(s){
    if(!s.conversation){$('resumeCase').disabled=true;$('caseStatus').textContent='当前会话：尚未打开';return {state:'active',handled:[]};}
    const id=s.conversation.id,key=policy.caseKey(s.account,id);
    if(!cases.has(key)){const stored=(await chrome.storage.local.get(key))[key];cases.set(key,stored&&Array.isArray(stored.handled)?stored:{state:'active',handled:[]});}
    const c=cases.get(key),paused=c.state!=='active';
    if(paused){blocked.add(id);handoffs.set(id,{name:s.conversation.name||c.name||'当前会话',reason:c.reason||'已由人工接管',reasonCode:c.reasonCode});renderHandoffs();}else blocked.delete(id);
    $('caseStatus').textContent='当前会话：'+(s.conversation.name||'私信')+' · '+(paused?'人工处理中':'可自动接待');
    $('resumeCase').disabled=!paused;if(paused)$('caseControls').open=true;
    return c;
  }
  async function saveCase(s,patch){const c=await loadCase(s);const next={...c,...patch,name:s.conversation.name||c.name||'私信',time:Date.now()};const key=policy.caseKey(s.account,s.conversation.id);await chrome.storage.local.set({[key]:next});cases.set(key,next);await loadCase(s);return next;}
  async function restoreCases(owner){
    const stored=await chrome.storage.local.get(null);
    preservedDrafts.clear();displayedDraft=null;
    for(const [key,d] of Object.entries(stored))if(d?.account===owner&&typeof d.conversation==='string'&&typeof d.text==='string'&&d.text.trim()&&key===policy.draftKey(owner,d.conversation))preservedDrafts.set(d.conversation,d);
    renderDrafts();
    for(const [key,c] of Object.entries(stored)){if(!key.startsWith('inbox-case:')||!c||!Array.isArray(c.handled))continue;let ids;try{ids=JSON.parse(key.slice('inbox-case:'.length));}catch{continue;}if(ids[0]!==owner||c.state==='active')continue;cases.set(key,c);blocked.add(ids[1]);handoffs.set(ids[1],{name:c.name||'私信',reason:c.reason||'已由人工接管',reasonCode:c.reasonCode});await request('notify',{account:owner,conversation:ids[1],started:c.state==='manual'}).catch(()=>{});}
    renderHandoffs();
  }
  async function handoff(s,reason,state='handoff',reasonCode=''){
    const category=globalThis.ZhidaHandoff.describe(reason,reasonCode);reasonCode=category.code;
    if(mode==='auto'){const c=await loadCase(s);const tail=policy.pending(s.messages,c.handled);await saveCase(s,{state,reason,reasonCode,question:tail.map(m=>m.content||'[非文字消息]').join('\n'),manualPending:tail.map(m=>m.id)});await reception.state(s.account,s.conversation.id,state);await journal(s,{state,ids:tail.map(m=>m.id),question:tail.map(m=>m.content||'[非文字消息]').join('\n'),reason,reasonCode,answer:activeReply?.snapshot?.conversation.id===s.conversation.id?activeReply.result?.answer||'':'',sources:activeReply?.snapshot?.conversation.id===s.conversation.id?activeReply.result?.sources||[]:[]});try{const n=await request('notify',{account:s.account,conversation:s.conversation.id});if(n.notified===false)log('桌面通知未启用，请在 Edge/系统设置中允许；待办保留在面板');}catch{log('桌面通知不可用，待办已保留');}}
    observed.set(s.conversation.id,s.signature);handoffs.delete(s.conversation.id);handoffs.set(s.conversation.id,{name:s.conversation.name||'当前会话',reason,reasonCode});renderHandoffs();log('当前会话需要人工：['+category.label+'] '+reason+(mode==='auto'?'；继续接待其他顾客':''));
  }
  async function open(target,g){
    guard(g);
    if(!['c2c','stranger-folder'].includes(target.kind))throw new Error('不支持此类会话');
    phase='切换会话';stats.opened++;log('正在打开未读会话');adapter.open(target);
    for(let i=0;i<24;i++){
      await sleep(250);if(!running||epoch!==g)throw new Error('已停止');
      let s;try{s=await snapshot();}catch(e){if(i===23)throw e;continue;}
      if(target.kind==='stranger-folder'?s.inFolder:s.conversation?.id===target.id){expectedRoute=s.route;return s;}
      if(s.route!==expectedRoute)throw pageChanged();
    }
    throw new Error('未能确认会话已打开，已暂停');
  }
  async function answer(s,g){
    const c=await loadCase(s);guard(g);
    const done=[...c.handled,...(mode==='draft'?(draftRead.get(s.conversation.id)||[]):[])];
    if(mode==='auto'&&policy.unconfirmed(s.messages,done)){await handoff(s,'页面存在失败或发送中的回复，请人工核对；未重新生成或重发','uncertain','delivery-uncertain');return;}
    const tail=policy.pending(s.messages,done);if(!tail.length){if(mode==='auto')await finishTask(s);observed.set(s.conversation.id,s.signature);return;}
    if(mode==='detect'){observed.set(s.conversation.id,s.signature);phase='消息识别';log('识别到 '+tail.length+' 条待处理消息；仅检测，未调用模型');return;}
    const key=policy.key(account,s.conversation.id,tail);
    const previous=mode==='auto'?(await chrome.storage.local.get(key))[key]:null;guard(g);
    if(previous){if(['sending','unknown'].includes(previous.state)){await handoff(s,'存在未确认发送记录，请人工核对，禁止自动重发','uncertain');return;}if(previous.state==='handoff')await handoff(s,'此问题已有人工处理记录');else observed.set(s.conversation.id,s.signature);return;}
    activeReply={snapshot:s,key,filled:false,sent:false};
    if(mode==='auto'&&daily&&reception.old(tail,Date.now(),channelPolicy.maxReplyAgeHours)) {await handoff(s,'历史待确认：消息超过当前渠道的回复时限或时间不明确，不自动补发');return;}
    if(mode==='auto')await journal(s,{state:'pending',stage:'received',ids:tail.map(m=>m.id),question:tail.map(m=>m.content||'[非文字消息]').join('\n')});
    async function defer(reason,reasonCode=''){if(mode==='auto')await chrome.storage.local.set({[key]:{state:'handoff',time:Date.now()}});guard(g);await handoff(s,reason,'handoff',reasonCode);if(mode==='auto'&&!/历史|时间|未确认|发送|草稿/.test(reason))await waitingNotice(s,g,tail,reason);}
    if(tail.some(m=>m.type!==1))return defer('收到'+[...new Set(tail.filter(m=>m.type!==1).map(m=>m.media||'非文字消息'))].join('、')+'，需要人工查看');
    const question=tail.map(m=>m.content).join('\n');if(!question||question.length>2000)return defer('消息为空或过长');
    $('question').textContent=question;
    if(mode==='auto'&&s.editorText.trim()){await preserveDraft(s,g);yieldFrom=s.conversation.id;return;}
    if(mode==='auto'&&!s.editable)return defer('当前无法发送');
    const first=s.messages.findIndex(m=>m.id===tail[0].id);
    const history=s.messages.slice(0,first).filter(m=>m.type===1&&m.content&&!m.pending&&!m.failed).slice(-10).map(({role,content})=>({role,content}));
    phase='模型生成';stats.models++;log('正在理解问题并查询已发布知识…');
    let result;const deadline=Date.now()+22000;
    try{for(let attempt=0;attempt<3;attempt++){try{result=await request('draft',{question,history,account:s.account,conversation:s.conversation.id,deadline,generation:serviceGeneration});lastModelAt=Date.now();modelFailures=['model-output','service-error'].includes(result.reasonCode)?modelFailures+1:0;break;}catch(e){modelFailures++;if(attempt===2||Date.now()+(attempt+1)*2000>=deadline)throw e;log('问答服务异常，等待后重试 '+(attempt+1)+'/2',true);await sleep((attempt+1)*2000);guard(g);const check=await snapshot();guard(g);if(!policy.same(s,check))return;}}}catch(e){
      guard(g);const fresh=await snapshot();guard(g);if(!policy.same(s,fresh))return;
      return defer('问答服务暂时不可用，请人工核实','service-error');
    }
    guard(g);
    activeReply.result=result;if(mode==='auto')await journal(s,{state:'pending',stage:'generated',ids:tail.map(m=>m.id),question,answer:result.answer,sources:result.sources||[],version:result.version});lastModelDiagnostic=result.modelDiagnostic||null;
    if(mode==='auto'&&policy.clarificationCount(c,result)>2){result={...result,action:'handoff',reasonCode:'clarification-limit',reason:'连续两轮追问仍未解决，需要人工核实'};}
    let fresh=await snapshot();guard(g);if(!policy.same(s,fresh))return;
    $('reply').textContent=result.answer||'无需回复';
    $('reply').closest('details').open=true;
    $('engine').textContent=result.engine==='deepseek'?'来源：DeepSeek 模型':result.engine==='rules'?(result.modelCalled?'来源：本地审核兜底（已调用模型，但结果未通过核验）':'来源：本地接待规则（本次未调用模型）'):'来源：本地标准问答';
    $('reason').textContent=result.reason?'判断原因：'+result.reason:'';
    if(result.modelDiagnostic?.attempts>1)$('reason').textContent+='（本次已重新生成一次）';
    const decision=globalThis.ZhidaAutoPolicy.decision(result);
    if(mode==='auto')await journal(s,{state:'pending',ids:tail.map(m=>m.id),question,answer:result.answer,sources:result.sources||[],reason:result.reason,reasonCode:result.reasonCode});
    if(mode==='draft'){
      draftRead.set(s.conversation.id,policy.handled(draftRead.get(s.conversation.id)||[],tail));
      observed.set(s.conversation.id,s.signature);phase='草稿完成';
      if(decision==='handoff')await handoff(s,result.action==='handoff'?(result.reason||'本次问题需要人工核实'):'草稿未通过发送审核，请检查回复内容','handoff',result.action==='handoff'?result.reasonCode:'answer-check');
      else {if(c.state==='active'){handoffs.delete(s.conversation.id);renderHandoffs();}log(decision==='skip'?'本次无需回复，未发送':c.state==='active'?'回复已生成，未填写输入框、未发送':'草稿已生成，当前会话仍由人工接管');}
      return;
    }
    if(decision==='handoff'||(result.answer||'').length>1000)return defer(result.action==='handoff'?(result.reason||'问题需要人工核实'):'回复未通过自动发送审核',result.action==='handoff'?result.reasonCode:'answer-check');
    if(decision==='skip'){await chrome.storage.local.set({[key]:{state:'skipped',time:Date.now()}});await saveCase(s,{handled:policy.handled(c.handled,tail)});await finishTask(s);await journal(s,{state:'skip',ids:tail.map(m=>m.id),question,answer:''});observed.set(s.conversation.id,s.signature);return;}
    return deliver(s,g,result,tail,c,key);
  }
  async function waitingNotice(s,g,tail,reason){
    const c=await loadCase(s);if(c.noticeAttempted||!s.editable||s.editorText?.trim())return;
    const fresh=await snapshot();guard(g);if(!policy.same(s,fresh))return;
    await saveCase(s,{noticeAttempted:true});
    const key='notice:'+policy.key(account,s.conversation.id,tail);if((await chrome.storage.local.get(key))[key])return;
    activeReply={snapshot:s,key,filled:false,sent:false};
    return deliver(s,g,{answer:'不好意思，请稍等',action:'clarify'},tail,c,key,reason);
  }
  async function deliver(s,g,result,tail,c,key,noticeReason=''){
    async function validKnowledge(){if(noticeReason||!result.knowledgeSignature)return true;const check=await request('validate-reply',{version:result.version,signature:result.knowledgeSignature,channelSignature:result.channelSignature,generation:serviceGeneration});guard(g);if(check.valid)return true;await handoff(s,check.reason||'生成后知识已变化或被停用，请核实后继续','handoff',check.reasonCode||'knowledge-missing');return false;}
    if(!await validKnowledge())return;
    await journal(s,{state:noticeReason?'handoff':'pending',stage:'validated',ids:tail.map(m=>m.id),question:tail.map(m=>m.content||'').join('\n'),answer:result.answer,sources:result.sources||[],version:result.version,reason:noticeReason});guard(g);
    let fresh=await snapshot();guard(g);if(!policy.same(s,fresh)||!fresh.editable)return handoff(s,'消息或输入框变化，未发送');
    if(fresh.editorText.trim()){await preserveDraft(fresh,g);yieldFrom=s.conversation.id;return;}
    if(!noticeReason&&blocked.has(s.conversation.id))return;
    phase='填写输入框';stats.filled++;const input=editor();if(document.hasFocus()&&!document.hidden)input.focus();adapter.fill(input,result.answer);activeReply.filled=true;
    await sleep(300);guard(g);fresh=await snapshot();guard(g);
    if(!policy.same(s,fresh)||!fresh.editable||fresh.editorText!==result.answer||editor()!==input)return handoff(s,'输入或消息已变化，保留当前草稿，未发送');
    await chrome.storage.local.set({[key]:{state:'sending',time:Date.now()}});guard(g);await journal(s,{state:noticeReason?'handoff':'pending',stage:'sending',ids:tail.map(m=>m.id),question:tail.map(m=>m.content||'').join('\n'),answer:result.answer,sources:result.sources||[],version:result.version,reason:noticeReason});guard(g);
    fresh=await snapshot();guard(g);
    if(!policy.same(s,fresh)||!fresh.editable||fresh.editorText!==result.answer||editor()!==input||adapter.readText(input)!==result.answer)return handoff(s,'发送前输入或消息已变化，未发送，请核对草稿');
    if(!noticeReason&&blocked.has(s.conversation.id))return;
    if(!await validKnowledge())return;
    fresh=await snapshot();guard(g);if(!policy.same(s,fresh)||!fresh.editable||fresh.editorText!==result.answer||editor()!==input)return handoff(s,'核实知识后消息或输入已变化，请核对草稿');
    // This page's InputBar handles Enter. Do not invoke private send APIs.
    phase='执行发送';stats.sent++;activeReply.sent=true;adapter.send(input);
    log('已执行发送，正在确认页面结果…');
    const before=new Set(s.messages.map(m=>m.id));
    for(let i=0;i<20;i++){
      await sleep(400);guard(g);const after=await snapshot();guard(g);
      phase='等待发送回显';
      const echo=after.messages.find(m=>m.role==='assistant'&&!before.has(m.id)&&m.content===result.answer);
      if(echo?.failed)break;
      if(echo&&!echo.pending&&!after.editorText.trim()){
        await chrome.storage.local.set({[key]:{state:'echo-confirmed',time:Date.now()}});
        seenOwn.set(s.conversation.id,echo.id);
        if(noticeReason){await saveCase(s,{noticeSent:true});}
        else if(result.followUp?.questions?.length){
          const question=result.followUp.questions.join('\n');await handoff(s,result.reason||'部分问题缺少已审核依据','handoff','knowledge-missing');
          await saveCase(s,{question,noticeAttempted:true,noticeSent:true});await journal(s,{state:'handoff',ids:tail.map(m=>m.id),question,answer:result.answer,sources:result.sources||[],reason:result.reason||'部分问题缺少已审核依据',reasonCode:'knowledge-missing'});
        }else{const clarifications=policy.clarificationCount(c,result);await saveCase(s,{handled:policy.handled(c.handled,tail),clarifications,clarifiedAt:clarifications?Date.now():null});await finishTask(s);await journal(s,{state:'answer',ids:tail.map(m=>m.id),question:tail.map(m=>m.content).join('\n'),answer:result.answer,sources:result.sources||[]});}stats.confirmed++;lastSendAt=Date.now();reportHealth();
        observed.set(s.conversation.id,s.signature);phase='确认回显';
        if(!$('continuous').checked)stop('单条发送验证完成，已停止；请核对回复结果');
        else log('页面显示已发送，继续监听');return;
      }
    }
    await chrome.storage.local.set({[key]:{state:'unknown',time:Date.now()}});await handoff(s,'发送失败或结果不明确，需人工核对','uncertain');
    const remaining=await snapshot();guard(g);if(remaining.conversation?.id===s.conversation.id&&remaining.editorText===result.answer){const input=editor();adapter.fill(input,'');}
    log('该客户发送待核对；其他顾客继续接待',true);
  }
  async function tick(){
    if(!running||busy||(!dirty&&Date.now()<checkAt))return;dirty=false;checkAt=Date.now()+5000;busy=true;activeReply=null;const g=epoch;
    try{
      guard(g);let s=await snapshot();guard(g);
      if(s.conversation)resumeChecks.delete(s.conversation.id);
      if(mode==='auto'){
        reception.account=s.account;await reception.flush((a,x)=>request(a,x));
        if(Date.now()-lastPing>30000){lastPing=Date.now();try{const service=await request('status');if(serviceGeneration&&service.generation&&service.generation!==serviceGeneration){stop('数据库已恢复，请核对业务后重新启动接待',true,true);return;}if(!service.configured)throw new Error('模型未配置');serviceHealthy=true;}catch(e){serviceHealthy=false;log('连接异常：'+e.message);try{await request('notify',{account,fault:true});}catch{}}health();}
        if(s.conversation){const id=s.conversation.id,own=s.messages.filter(m=>m.role==='assistant').at(-1)?.id,old=seenOwn.get(id);if(seenOwn.has(id)&&own&&old!==own&&!activeReply){await handoff(s,'检测到人工回复，该客户等待人工处理','manual');}seenOwn.set(id,own);}
      }
      const hasDraft=mode==='auto'&&await preserveDraft(s,g);
      if(mode==='auto'&&$('scan').checked&&await scanList(s,g))return;
      const skipped=new Set([...blocked,...(mode==='auto'?preservedDrafts.keys():[])]),tasks=mode==='auto'?await reception.tasks(s.account):[];
      const next=policy.next(s.targets,skipped,s.conversation?.id,tasks)||s.targets.find(t=>t.kind==='c2c'&&resumeChecks.has(t.id)&&t.id!==s.conversation?.id&&!skipped.has(t.id));
      if($('scan').checked&&next&&(hasDraft||blocked.has(s.conversation?.id)||yieldFrom===s.conversation?.id||!s.conversation)){yieldFrom='';await open(next,g);return;}
      if(!hasDraft&&s.conversation?.kind==='c2c'&&(mode!=='auto'||!blocked.has(s.conversation.id))&&observed.get(s.conversation.id)!==s.signature){
        const id=s.conversation.id,now=Date.now(),entry=bursts.get(id)||{first:now,last:now,signature:s.signature};if(entry.signature!==s.signature){entry.last=now;entry.signature=s.signature;}bursts.set(id,entry);
        await sleep(1200);guard(g);const settled=await snapshot();guard(g);if(mode==='auto'&&settled.editorText?.trim()){await preserveDraft(settled,g);yieldFrom=id;dirty=true;return;}if((policy.same(s,settled)&&Date.now()-entry.last>=3000)||Date.now()-entry.first>=10000){bursts.delete(id);await answer(settled,g);if(mode==='auto')yieldFrom=id;}dirty=true;return;
      }
      if(!$('scan').checked)return;
      if(next){yieldFrom='';await open(next,g);return;}
      const folder=s.targets.find(t=>t.kind==='stranger-folder'&&t.unread>0);
      if(folder&&!s.inFolder&&(!folderChecked||folderChecked.unread!==folder.unread||folderChecked.updated!==folder.updated||Date.now()-folderChecked.at>30000)){folderEntry=folder;await open(folder,g);return;}
      if(s.inFolder){
        folderChecked={...folderEntry,at:Date.now()};
        adapter.back();await sleep(500);guard(g);
      }
    }catch(e){
      if(running&&g===epoch&&e.code==='conversation-changed'){
        try{
          if(activeReply?.filled){
            const {snapshot:s,key,sent}=activeReply;
            await chrome.storage.local.set({[key]:{state:sent?'unknown':'handoff',time:Date.now()}});
            await handoff(s,sent?'发送后会话被切换，结果需人工核对，禁止重发':'输入后会话被切换，原草稿需人工核对',sent?'uncertain':'handoff');
          }else if(activeReply)resumeChecks.add(activeReply.snapshot.conversation.id);
          if(running&&g===epoch){expectedRoute=location.href;dirty=true;log('会话已切换，自动接待继续运行');}
        }catch(error){if(running&&g===epoch)stop(error.message,true,true);}
      }else if(running&&g===epoch){lastFailure={phase,mode};await pauseFault(e.message);}
    }finally{activeReply=null;busy=false;}
  }
  $('start').onclick=async()=>{
    if(busy){log('上一轮任务正在结束，请稍后再点击开始');return;}if(running)return;busy=true;
    const g=++epoch;
    try{log('正在自动识别账号和消息页面…');const s=await snapshot();if(g!==epoch)return;
      account=s.account;reception.account=account;await restoreCases(account);if(g!==epoch)return;expectedRoute=s.route;const service=await request('status');if(g!==epoch)return;serviceGeneration=service.generation||null;channelPolicy=await request('channel');if(g!==epoch)return;running=true;if(daily)await persistRunning(true);reportHealth();if(g!==epoch)return;await request('completeCase',{account}).catch(()=>{});dirty=true;folderChecked=null;log(mode==='detect'?'检测已启动，不调用模型、不发送':mode==='draft'?'草稿验证已启动，不填写或发送':$('continuous').checked?'连续自动回复已启动':'单条发送验证已启动');
    }catch(e){if(g===epoch){lastFailure={phase,mode};log(e.message,true);}}finally{busy=false;}
  };
  function changeMode(){
    stop('设置已更改，请重新启动');mode=$('mode').value;if(mode!=='auto')daily=false;
    observed.clear();draftRead.clear();$('reply').textContent='暂无';$('question').textContent='暂无';$('engine').textContent='';$('reason').textContent='';
    $('continuousLabel').hidden=mode!=='auto';
    $('start').textContent=mode==='detect'?'开始检测':mode==='draft'?'开始生成草稿':'开始发送验证';
  }
  $('mode').onchange=()=>{$('continuous').checked=false;changeMode();};
  $('scan').onchange=changeMode;$('continuous').onchange=changeMode;
  $('daily').onclick=()=>{daily=true;if(busy){log('上一轮任务正在结束，请稍后再点击开始');return;}$('mode').value='auto';$('scan').checked=true;$('continuous').checked=true;changeMode();$('tests').open=false;$('start').onclick();};
  $('takeover').onclick=async()=>{
    const id=latest?.conversation?.id,route=location.href,wasRunning=running;
    stop('正在接管当前会话',false);const g=epoch;
    while(busy&&g===epoch)await sleep(100);if(g!==epoch)return;
    busy=true;
    try{
      const s=await snapshot();if(g!==epoch)return;
      if(!id||s.conversation?.id!==id||s.route!==route)throw new Error('当前会话已变化，请重新选择');
      const c=await loadCase(s);await saveCase(s,{state:'manual',reason:'已由你手动接管',reasonCode:'manual-takeover',manualPending:policy.pending(s.messages,c.handled).map(m=>m.id)});if(g!==epoch)return;
      await reception.state(account,id,'manual');await journal(s,{state:'manual',ids:policy.pending(s.messages,c.handled).map(m=>m.id),question:policy.pending(s.messages,c.handled).map(m=>m.content||'[非文字消息]').join('\n'),reason:'已由你手动接管',reasonCode:'manual-takeover'});if(g!==epoch)return;
      if(wasRunning){running=true;expectedRoute=s.route;dirty=true;}
      log(wasRunning?'当前会话已交给人工；继续接待其他顾客':'当前会话已交给人工；启动后继续接待其他顾客');
    }catch(e){if(g===epoch)log(e.message,true);}finally{busy=false;}
  };
  $('resumeCase').onclick=()=>{if(latest?.conversation)resumeHandoff(latest.conversation.id);};
  $('stop').onclick=()=>stop('已停止自动回复');
  $('diagnose').onclick=()=>{$('diagnostic').textContent=JSON.stringify({version:'0.11.0',channel:profile.id,mode,running,phase,lastFailure,scan:$('scan').checked,continuous:$('continuous').checked,counts:stats,lastModel:lastModelDiagnostic},null,2);};
  const themeLabel=document.createElement('label');themeLabel.className='theme-control';themeLabel.textContent='界面主题';
  const themeSelect=document.createElement('select');themeSelect.id='theme';themeSelect.setAttribute('aria-label','界面主题');
  for(const [value,text] of [['day','日间 · 暖纸墨棕 B'],['night','夜间 · 墨黑冰蓝'],['auto','自动（跟随页面）']]){const option=document.createElement('option');option.value=value;option.textContent=text;themeSelect.append(option);}
  themeLabel.append(themeSelect);ui.querySelector('.header-row').after(themeLabel);
  const channelLabel=document.createElement('p');channelLabel.textContent='网页适配：'+profile.name+' · 渠道 ID：'+profile.id;ui.querySelector('.header-row').after(channelLabel);
  const systemTheme=matchMedia('(prefers-color-scheme: dark)');let themeMode='day',themeTimer=null,themeChosen=false;
  function pageIsDark(){
    let node=adapter.root();
    while(node){const values=getComputedStyle(node).backgroundColor.match(/[\d.]+/g)?.map(Number);if(values?.length>=3&&(values[3]??1)>=.95){const channels=values.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722<.4;}node=node.parentElement;}
    return systemTheme.matches;
  }
  function applyTheme(){const dark=themeMode==='night'||(themeMode==='auto'&&pageIsDark());if(host.classList.contains('day')===dark)host.classList.toggle('day',!dark);host.dataset.theme=dark?'night':'day';}
  const themeObserver=new MutationObserver(records=>{if(themeMode!=='auto'||records.every(r=>r.target===host)||themeTimer!==null)return;themeTimer=setTimeout(()=>{themeTimer=null;applyTheme();},100);});
  themeObserver.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','data-theme','data-color-mode']});
  systemTheme.addEventListener('change',applyTheme);applyTheme();
  themeSelect.onchange=async()=>{themeChosen=true;themeMode=themeSelect.value;applyTheme();try{await chrome.storage.local.set({receptionTheme:themeMode,receptionThemePalette:'warm-b'});}catch(e){if(/Extension context invalidated/i.test(e.message))showRecovery('context');else log('主题保存失败：'+e.message,true);}};
  Promise.all([chrome.storage.local.get('receptionTheme'),chrome.storage.local.get('receptionThemePalette')]).then(async([{receptionTheme:value},{receptionThemePalette:palette}])=>{if(themeChosen)return;if(palette!=='warm-b'){themeMode='day';themeSelect.value='day';applyTheme();await chrome.storage.local.set({receptionTheme:'day',receptionThemePalette:'warm-b'});}else if(['auto','day','night'].includes(value)){themeMode=value;themeSelect.value=value;applyTheme();}}).catch(()=>{});
  const timer=setInterval(tick,1000);
  const heartbeatTimer=setInterval(()=>{if(running&&mode==='auto')reportHealth();},15000);
  function finishHandoff(message,sender,respond){
    if(sender.id===chrome.runtime.id&&!sender.tab&&message.bindingId===bindingId&&message.action==='showReception'){setCompact(false);showHandoffs();respond({ok:true});return;}
    if(sender.id===chrome.runtime.id&&!sender.tab&&message.bindingId===bindingId&&message.action==='manualUpdate'){
      const snap=message.snapshot;if(snap?.account!==account||!snap.conversation||!blocked.has(snap.conversation.id))return;
      journal(snap,{state:'manual',ids:cases.get(policy.caseKey(account,snap.conversation.id))?.manualPending||[],question:cases.get(policy.caseKey(account,snap.conversation.id))?.question||'',reason:'人工处理中'}).then(()=>respond({ok:true}),()=>respond({ok:false}));return true;
    }
    if(sender.id!==chrome.runtime.id||sender.tab||message.action!=='finishHandoff'||message.bindingId!==bindingId)return;
    if(!handoffs.has(message.conversation)){respond({ok:true});return;}
    resumeHandoff(message.conversation).then(respond);return true;
  }
  chrome.runtime.onMessage.addListener(finishHandoff);
  globalThis.__zhidaAutoClose=()=>{stop('已关闭');observer.disconnect();themeObserver.disconnect();clearTimeout(themeTimer);systemTheme.removeEventListener('change',applyTheme);clearInterval(timer);clearInterval(heartbeatTimer);removeEventListener('resize',fit);chrome.runtime.onMessage.removeListener(finishHandoff);host.remove();try{chrome.runtime.sendMessage({action:'disarm',bindingId,pageUrl:location.href}).catch(()=>{});}catch{}delete globalThis.__zhidaAutoClose;};
  $('close').onclick=globalThis.__zhidaAutoClose;
  let position={},drag=null,dragged=false,enlarged=false,normalPosition=null;
  const panelWidth=()=>enlarged?'min(960px, calc(100vw - 32px))':'380px';
  function fit(){const rect=host.getBoundingClientRect();host.style.left=Math.max(0,Math.min(innerWidth-host.offsetWidth,rect.left))+'px';host.style.top=Math.max(0,Math.min(innerHeight-(enlarged&&!host.classList.contains('compact')?host.offsetHeight:64),rect.top))+'px';host.style.right='auto';}
  const maximize=document.createElement('button');maximize.id='maximize';maximize.type='button';maximize.title='放大编辑窗口';maximize.setAttribute('aria-label','放大编辑窗口');maximize.setAttribute('aria-pressed','false');maximize.innerHTML='<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1"/></svg>';
  $('close').before(maximize);
  maximize.onclick=()=>{
    if(!enlarged){const rect=host.getBoundingClientRect();normalPosition={left:rect.left,top:rect.top};}
    enlarged=!enlarged;host.classList.toggle('enlarged',enlarged);host.style.width=panelWidth();
    host.style.left=(enlarged?Math.max(16,(innerWidth-host.offsetWidth)/2):normalPosition.left)+'px';host.style.top=(enlarged?16:normalPosition.top)+'px';host.style.right='auto';
    maximize.title=enlarged?'还原窗口':'放大编辑窗口';maximize.setAttribute('aria-label',maximize.title);maximize.setAttribute('aria-pressed',String(enlarged));
    maximize.innerHTML=enlarged?'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 4h9v9"/><rect x="4" y="7" width="9" height="9" rx="1"/></svg>':'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="1"/></svg>';fit();
  };
  function setCompact(compact){dragged=false;const rect=host.getBoundingClientRect();host.classList.toggle('compact',compact);host.style.width=compact?'64px':panelWidth();if(compact){host.style.left=rect.left+rect.width/2>innerWidth/2?Math.max(0,innerWidth-80)+'px':'16px';host.style.right='auto';}fit();position={left:parseFloat(host.style.left),top:parseFloat(host.style.top)};chrome.storage.local.set({receptionPanel:{...position,compact}});}
  $('minimize').onclick=()=>setCompact(true);
  $('ball').onclick=()=>{if(dragged){dragged=false;return;}setCompact(false);};
  for(const node of [$('drag'),$('ball')]){node.onpointerdown=e=>{if(e.button!==0)return;host.classList.add('is-dragging');dragged=false;const rect=host.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};node.setPointerCapture(e.pointerId);};node.onpointermove=e=>{if(!drag)return;if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4)dragged=true;const left=Math.max(0,Math.min(innerWidth-host.offsetWidth,drag.left+e.clientX-drag.x)),top=Math.max(0,Math.min(innerHeight-64,drag.top+e.clientY-drag.y));host.style.left=left+'px';host.style.top=top+'px';host.style.right='auto';};node.onpointerup=()=>{host.classList.remove('is-dragging');if(!drag)return;drag=null;position={left:parseFloat(host.style.left),top:parseFloat(host.style.top)};chrome.storage.local.set({receptionPanel:{...position,compact:host.classList.contains('compact')}});};}
  addEventListener('resize',fit);
  chrome.storage.local.get('receptionPanel').then(({receptionPanel:p})=>{if(!p)return;position=p;if(Number.isFinite(p.left)){host.style.left=p.left+'px';host.style.right='auto';host.style.top=p.top+'px';}host.classList.toggle('compact',!!p.compact);host.style.width=p.compact?'64px':'380px';fit();});
  if(globalThis.__zhidaStartDaily){delete globalThis.__zhidaStartDaily;$('daily').click();}
})();
