import {validateConfig} from './policy.js';
/** @typedef {import('./types.js').Config} Config */
/** @typedef {import('./types.js').RecordEntry} RecordEntry */
/** @typedef {import('./types.js').MaintenancePlan} MaintenancePlan */
/** @typedef {import('./types.js').RunProgress} RunProgress */

/** Parse all editable fields before requesting a persistent save. @param {Record<string,unknown>} draft @returns {Config} */
export function parseDraft(draft) {
 const days=Number(draft.days);
 if(typeof draft.days!=='string'||!/^\d+$/.test(draft.days)||!Number.isInteger(days))throw new Error('天数必须为整数');
 /** @param {string} field @param {string} label @returns {unknown} */
 const json=(field,label)=>{try{return JSON.parse(String(draft[field]));}catch{throw new Error(`${label} JSON 无效`);}};
 return validateConfig({enabled:draft.enabled===true,spaceMappingVerified:draft.spaceMappingVerified===true,deduplicate:draft.deduplicate===true,consolidateHost:draft.consolidateHost===true,cleanTemporary:draft.cleanTemporary===true,expire:draft.expire===true,sort:draft.sort===true,days,
 aliases:json('aliases','别名规则'),projects:json('projects','项目规则'),whitelist:json('whitelist','白名单'),readOnlyRules:json('readOnlyRules','只读规则')});
}

/** Message commands remain small and testable outside the page. @param {(command:string,payload?:unknown)=>Promise<unknown>} request @returns {{save:(draft:Record<string,unknown>)=>Promise<unknown>,preview:(requestId?:string)=>Promise<unknown>,progress:(requestId:string)=>Promise<unknown>,pause:()=>Promise<unknown>,run:(requestId?:string)=>Promise<unknown>,snapshot:()=>Promise<unknown>,restore:(ids:string[])=>Promise<unknown>}} */
export function createOptionsController(request) {
 return {
  /** @param {Record<string,unknown>} draft */ async save(draft){return request('save',{config:parseDraft(draft)});},
  preview(requestId){return request('preview',requestId?{requestId}:undefined);},
  progress(requestId){return request('progress',{requestId});},
  pause(){return request('pause');},
  run(requestId){return request('run',requestId?{requestId}:undefined);},
  snapshot(){return request('snapshot');},
  /** @param {string[]} ids */ restore(ids){return request('restore',{ids});}
 };
}

/** Pending means the worker may have stopped after browser deletion. @param {RecordEntry[]} records @returns {(RecordEntry & {statusText:string})[]} */
export function historyRows(records) {
 return records.filter(r=>r.restoredAt===undefined&&r.status!=='failed').map(r=>({...r,statusText:r.restoreAttemptAt!==undefined?'恢复结果待确认：请先检查标签页':r.status==='pending'?'待确认：可重新打开网址':'已关闭'}));
}

/** Report blocked or failed work before showing completion. @param {MaintenancePlan} plan @returns {string} */
export function runStatus(plan){return plan.waiting.length?plan.waiting.join('；'):`本次整理已完成：关闭 ${plan.progress?.closed??0} 页，调整 ${plan.progress?.moved??0} 页；受保护页面已保留`;}

/** Convert measured stage progress into display values. @param {RunProgress} progress @param {boolean} [preview] @returns {{label:string,detail:string,fraction:string,indeterminate:boolean,hideMeter:boolean,value:number,max:number}} */
export function progressView(progress,preview=false){
 const labels={queued:'等待开始',checking:'正在检查标签页',closing:'正在清理',sorting:'正在排序',completed:preview?'预览完成':'整理完成',stopped:'已停止',failed:'执行失败',interrupted:'进度已中断，等待运行结果'};
 const total=Math.max(0,progress.total),value=Math.min(total,Math.max(0,progress.processed));
 return {label:labels[progress.phase],detail:`已关闭 ${progress.closed} 页，已调整 ${progress.moved} 页，异常 ${progress.failed} 项`,fraction:total?`${value} / ${total}`:'',indeterminate:!total&&['queued','checking'].includes(progress.phase),hideMeter:!total&&!['queued','checking'].includes(progress.phase),value,max:Math.max(1,total)};
}
/** Poll one request without overlap; late or unrelated frames cannot replace its final result. @param {Pick<ReturnType<typeof createOptionsController>,'run'|'preview'|'progress'>} controller @param {boolean} preview @param {(progress:RunProgress)=>void} onProgress @returns {Promise<MaintenancePlan>} */
export async function trackOperation(controller,preview,onProgress){
 const requestId=crypto.randomUUID();let stopped=false;
 /** @type {RunProgress} */let last={phase:'queued',processed:0,total:0,closed:0,moved:0,failed:0};
 /** @type {ReturnType<typeof setTimeout>|undefined} */let timer;
 /** @param {RunProgress} progress @returns {void} */const deliver=progress=>{last=structuredClone(progress);try{onProgress(structuredClone(last));}catch{/* Display observers cannot interrupt execution. */}};
 /** @returns {Promise<void>} */async function poll(){try{const frame=/** @type {{requestId:string,progress:RunProgress}|undefined} */(await controller.progress(requestId));if(!stopped)deliver(frame?.requestId===requestId?frame.progress:{...last,phase:'interrupted'});}catch{if(!stopped)deliver({...last,phase:'interrupted'});}finally{if(!stopped)timer=setTimeout(()=>{void poll();},500);}}
 deliver(last);
 try{timer=setTimeout(()=>{void poll();},500);const result=/** @type {MaintenancePlan} */(await (preview?controller.preview(requestId):controller.run(requestId)));if(!result.progress)throw new Error('未收到运行进度，请重新打开设置页');deliver(result.progress);return result;}
 catch(error){
 let frame;try{frame=/** @type {{requestId:string,progress:RunProgress}|undefined} */(await controller.progress(requestId));}catch{/* A lost worker has no recoverable final frame. */}
 if(frame?.requestId===requestId)deliver({...frame.progress,phase:['failed','stopped'].includes(frame.progress.phase)?frame.progress.phase:'interrupted'});
 else if(!['failed','stopped','interrupted'].includes(last.phase))deliver({...last,phase:'failed',failed:Math.max(1,last.failed)});
 throw error;
 }
 finally{stopped=true;if(timer!==undefined)clearTimeout(timer);}
}

/** @param {HTMLElement} element @param {string} value */
function setText(element,value){element.textContent=value;}
/** @param {HTMLElement} parent @param {string} tag @param {string} value @returns {HTMLElement} */
function appendText(parent,tag,value){const element=document.createElement(tag);setText(element,value);parent.append(element);return element;}
/** @param {HTMLFormElement} form @returns {Record<string,unknown>} */
function readForm(form){const entries=new FormData(form);return {enabled:entries.has('enabled'),spaceMappingVerified:entries.has('spaceMappingVerified'),deduplicate:entries.has('deduplicate'),consolidateHost:entries.has('consolidateHost'),cleanTemporary:entries.has('cleanTemporary'),expire:entries.has('expire'),sort:entries.has('sort'),days:String(entries.get('days')??''),aliases:String(entries.get('aliases')??''),projects:String(entries.get('projects')??''),whitelist:String(entries.get('whitelist')??''),readOnlyRules:String(entries.get('readOnlyRules')??'')};}
/** @param {HTMLFormElement} form @param {Config} config */
function fillForm(form,config){for(const key of ['enabled','spaceMappingVerified','deduplicate','consolidateHost','cleanTemporary','expire','sort']){const input=/** @type {HTMLInputElement} */(form.elements.namedItem(key));input.checked=Boolean(config[/** @type {keyof Config} */(key)]);}
 for(const key of ['days','aliases','projects','whitelist','readOnlyRules']){const input=/** @type {HTMLInputElement|HTMLTextAreaElement} */(form.elements.namedItem(key));input.value=key==='days'?String(config.days):JSON.stringify(config[/** @type {'aliases'|'projects'|'whitelist'|'readOnlyRules'} */(key)],null,2);}}
/** Render recovered URLs without ever parsing them as markup. @param {HTMLElement} target @param {RecordEntry[]} records @param {(ids:string[])=>Promise<unknown>} restore @returns {void} */
export function renderHistory(target,records,restore){target.replaceChildren();const rows=historyRows(records);if(!rows.length){appendText(target,'p','暂无可恢复记录');return;}
 for(const r of rows.slice().reverse()){const article=document.createElement('article');article.className='record';appendText(article,'strong',r.title||r.url);appendText(article,'span',` ${r.reason==='git-project'?'同Git项目':r.reason==='duplicate'?'重复页':r.reason==='host-duplicate'?'同域名超过1天':r.reason==='temporary'?'临时页超过1天':r.reason==='dormant'?'休眠页':r.reason==='error'?'错误页':r.reason==='homepage'?'百度首页':r.reason==='newtab'?'空白新标签':'超过期限'} · ${r.statusText} · ${new Date(r.time).toLocaleString()}`);appendText(article,'code',r.url);const button=appendText(article,'button','恢复此页');button.addEventListener('click',()=>{void restore([r.id]);});target.append(article);}
 for(const batch of new Set(rows.map(r=>r.batch))){const matching=rows.filter(r=>r.batch===batch);if(matching.length<2)continue;const button=appendText(target,'button',`恢复本批 ${matching.length} 页`);button.addEventListener('click',()=>{void restore(matching.map(r=>r.id));});}}
/** @param {HTMLElement} target @param {MaintenancePlan} plan @returns {void} */
export function renderPreview(target,plan){target.replaceChildren();const titles=plan.order.map(id=>{const tab=plan.tabs.find(t=>t.id===id);return tab?.title||tab?.url||`标签 ${id}`;});appendText(target,'p',`将关闭 ${plan.closures.length} 页；排序顺序：${titles.join(' → ')||'无'}`);for(const reason of plan.waiting)appendText(target,'p',reason);for(const item of plan.closures){const tab=plan.tabs.find(t=>t.id===item.id);if(tab)appendText(target,'p',`${item.reason==='git-project'?'同Git项目':item.reason==='duplicate'?'重复页':item.reason==='host-duplicate'?'同域名超过1天':item.reason==='temporary'?'临时页超过1天':item.reason==='dormant'?'休眠页':item.reason==='error'?'错误页':item.reason==='homepage'?'百度首页':item.reason==='newtab'?'空白新标签':'超过期限'}：${tab.title} — ${tab.url}`);}}

if(typeof document!=='undefined'){
 const form=/** @type {HTMLFormElement} */(document.getElementById('settings'));
 const status=/** @type {HTMLElement} */(document.getElementById('status'));
 const preview=/** @type {HTMLElement} */(document.getElementById('preview'));
 const history=/** @type {HTMLElement} */(document.getElementById('history'));
 /** @type {(command:string,payload?:unknown)=>Promise<unknown>} */ const request=(command,payload)=>new Promise((resolve,reject)=>{chrome.runtime.sendMessage({command,.../** @type {object} */(payload??{})},response=>{const error=chrome.runtime.lastError;if(error)reject(new Error(error.message));else if(!response?.ok)reject(new Error(String(response?.error??'请求失败')));else resolve(response.result);});});
 const controller=createOptionsController(request);
 const panel=/** @type {HTMLElement} */(document.querySelector('.operation-panel'));
 const progressPanel=/** @type {HTMLElement} */(document.getElementById('run-progress'));
 const meter=/** @type {HTMLProgressElement} */(document.getElementById('progress-meter'));
 let busy=false;
 /** @param {boolean} value @returns {void} */function setBusy(value){busy=value;panel.setAttribute('aria-busy',String(value));for(const button of document.querySelectorAll('#run-button,#preview-button,#save-button,#history button'))/** @type {HTMLButtonElement} */(button).disabled=value;for(const input of form.querySelectorAll('input,textarea,select'))/** @type {HTMLInputElement} */(input).disabled=value;}
 /** @param {RunProgress} progress @param {boolean} isPreview @returns {void} */function showProgress(progress,isPreview){const view=progressView(progress,isPreview);progressPanel.hidden=false;panel.dataset.phase=progress.phase;setText(/** @type {HTMLElement} */(document.getElementById('progress-label')),view.label);setText(/** @type {HTMLElement} */(document.getElementById('progress-count')),view.fraction);setText(/** @type {HTMLElement} */(document.getElementById('progress-detail')),view.detail);meter.max=view.max;meter.hidden=view.hideMeter;if(view.indeterminate)meter.removeAttribute('value');else meter.value=view.value;}

 /** @param {unknown} error */const fail=error=>setText(status,String(error));
 /** @returns {Promise<void>} */const refresh=async()=>{const snapshot=/** @type {import('./types.js').PersistentState} */(await controller.snapshot());fillForm(form,snapshot.config);renderHistory(history,snapshot.records,async ids=>{try{await controller.restore(ids);await refresh();setText(status,'网址已重新打开');}catch(error){fail(error);}});};
 form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;void (async()=>{try{await controller.save(readForm(form));setText(status,'设置已保存');await refresh();}catch(error){fail(error);}})();});
 document.getElementById('pause')?.addEventListener('click',()=>{setText(status,'正在暂停…');void (async()=>{try{await controller.pause();await refresh();setText(status,'维护已暂停');}catch(error){fail(error);}})();});
 /** @param {boolean} isPreview @returns {Promise<void>} */async function perform(isPreview){if(busy)return;setBusy(true);setText(status,isPreview?'正在生成预览…':'正在整理…');try{const result=await trackOperation(controller,isPreview,p=>showProgress(p,isPreview));renderPreview(preview,result);if(!isPreview)await refresh();setText(status,isPreview?(result.waiting.length?result.waiting.join('；'):'预览完成'):runStatus(result));}catch(error){fail(error);}finally{setBusy(false);}}
 document.getElementById('preview-button')?.addEventListener('click',()=>{void perform(true);});
 document.getElementById('run-button')?.addEventListener('click',()=>{void perform(false);});
 void refresh().catch(fail);
}
