import {createEngine} from './engine.js';
/** @typedef {import('./types.js').TabSnapshot} TabSnapshot */
/** @typedef {import('./types.js').PageState} PageState */
/** Bind a full Chrome API to the conservative engine; 窗口 mapping remains gated in config. @param {typeof chrome} browser @param {()=>number} [now] @returns {{ready:Promise<void>,engine:import('./types.js').Engine,states:Map<number,PageState & {url:string}>,errors:string[],message:(value:unknown,sender:chrome.runtime.MessageSender)=>Promise<unknown>}} */
export function createRuntime(browser,now=Date.now) {
 /** @type {Map<number,PageState & {url:string}>} */const states=new Map();
 /** @type {string[]} */const errors=[];
 /** @type {{requestId:string,progress:import('./types.js').RunProgress}|undefined} */let job;
 let jobBusy=false;
 /** @type {Map<number,number>} */const expectedRemovals=new Map();
 /** @type {Map<number,{windowId:number,index:number,until:number}>} */const expectedMoves=new Map();
 /** @param {unknown} error @returns {void} */const log=error=>{errors.push(String(error));if(errors.length>20)errors.shift();};
 /** @param {chrome.tabs.Tab} t @returns {TabSnapshot} */
 const convert=t=>{const s=states.get(t.id??-1);return {id:t.id??-1,url:t.url||'',pendingUrl:t.pendingUrl,discarded:t.discarded,status:t.status,title:t.title||'',windowId:t.windowId,spaceId:String(t.windowId),index:t.index,active:t.active,pinned:t.pinned,audible:!!t.audible,captured:t.mutedInfo?.reason==='capture',groupId:t.groupId,splitId:t.splitViewId??-1,lastAccessed:t.lastAccessed,stableSince:undefined,cooldownUntil:0,state:s?.url===t.url?s:undefined};};
 /** @returns {Promise<void>} */async function permissions(){if(!await browser.permissions.contains({permissions:['tabs','storage','alarms','idle','scripting'],origins:['http://*/*','https://*/*']}))throw new Error('维护权限不足，已跳过');}
 const engine=createEngine({now,
 async session(){const s=await browser.storage.session.get('session');if(typeof s.session==='string')return s.session;const session=crypto.randomUUID();await browser.storage.session.set({session});return session;},
 async load(){const saved=await browser.storage.local.get('state');return /** @type {import('./types.js').PersistentState|undefined} */(saved.state);},
 async save(state){await browser.storage.local.set({state});},
 async query(){await permissions();const tabs=await browser.tabs.query({});return tabs.map(convert);},
 async get(id){try {const t=await browser.tabs.get(id);return convert(t);}catch{return undefined;}},
 async remove(id){expectedRemovals.set(id,now()+5000);try{await browser.tabs.remove(id);}catch(error){expectedRemovals.delete(id);throw error;}},
 async move(ids,windowId,index){if(ids.length!==1)throw new Error('已有分组或分屏时不移动标签块');expectedMoves.set(ids[0],{windowId,index,until:now()+5000});try{await browser.tabs.move(ids[0],{windowId,index});}catch(error){expectedMoves.delete(ids[0]);throw error;}},
 async create(url,windowId,index){const t=await browser.tabs.create({url,active:false,...(windowId===undefined?{}:{windowId,index})});return convert(t);},
 async hasWindow(id){try{await browser.windows.get(id);return true;}catch{return false;}},
 async idle(){try{return await browser.idle.queryState(30)!=='active';}catch{return false;}}
 });
 /** @returns {Promise<void>} */async function reconcile(){await browser.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});const alarm=await browser.alarms.get('maintenance');if(alarm?.periodInMinutes!==60)await browser.alarms.create('maintenance',{when:now()+30000,periodInMinutes:60});const tabs=await browser.tabs.query({});for(const t of tabs){if(t.id!==undefined&&!t.discarded&&t.status!=='unloaded'&&/^https?:/.test(t.url||'')){try{await browser.scripting.executeScript({target:{tabId:t.id},files:['page-state.js']});}catch{/* Unreachable pages remain unknown and protected. */}}}}
 const ready=engine.initialize().then(reconcile);
 // Attach rejection handler immediately, including startup initialization failures.
 void ready.catch(log);
 /** @param {()=>Promise<unknown>} task @returns {void} */const handle=task=>{void ready.then(task).catch(log);};
 /** Reset the one-shot alarm instead of creating a busy retry loop. @returns {Promise<void>} */const settle=async()=>{await browser.alarms.create('settle',{when:now()+30000});};
 /** Refresh observed safety before an hourly close check; unreachable pages remain unknown. @returns {Promise<void>} */async function sampleSafety(){await permissions();const tabs=await browser.tabs.query({});await Promise.all(tabs.filter(t=>t.id!==undefined&&/^https?:/.test(t.url||'')).map(async t=>{if(t.status==='unloaded'||t.discarded)return;const id=/** @type {number} */(t.id),previous=states.get(id);if(previous&&previous.url===t.url&&(previous.dirty||previous.media||previous.captured))states.set(id,{...previous,known:false});else states.delete(id);try{await browser.scripting.executeScript({target:{tabId:/** @type {number} */(t.id)},files:['page-state.js']});}catch{/* Failed reports cannot authorize closing. */}}));}
 browser.runtime.onStartup.addListener(()=>handle(reconcile));browser.runtime.onInstalled.addListener(()=>handle(reconcile));
 browser.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='maintenance')handle(async()=>{await sampleSafety();await engine.run();});else if(alarm.name==='settle')handle(()=>engine.run(false,'sort-only'));});
 browser.tabs.onCreated.addListener(tab=>{const openedAt=now();engine.invalidate();handle(async()=>{await engine.created(convert(tab),openedAt);await settle();});});
 browser.tabs.onActivated.addListener(info=>{engine.activity();handle(async()=>{await engine.activate(info.tabId);await settle();});});
 browser.tabs.onUpdated.addListener((id,change)=>{
  if(change.url||change.status==='loading'||change.status==='complete'){if(change.url||change.status==='loading')states.delete(id);handle(async()=>{await engine.navigate(id,change.status==='complete');await settle();});}
  else if(['pinned','audible','mutedInfo','groupId','splitViewId','discarded'].some(key=>key in change)){engine.invalidate();handle(settle);}
 });
 browser.tabs.onRemoved.addListener(id=>{states.delete(id);const own=(expectedRemovals.get(id)??-1)>=now();expectedRemovals.delete(id);if(!own){engine.activity();handle(settle);}});
 browser.tabs.onMoved.addListener((id,info)=>{const expected=expectedMoves.get(id);expectedMoves.delete(id);if(expected&&expected.until>=now()&&expected.windowId===info.windowId&&expected.index===info.toIndex)return;engine.activity();handle(settle);});
 for(const event of [browser.tabs.onAttached,browser.tabs.onDetached])event.addListener(()=>{engine.activity();handle(settle);});
 /** Track one trusted manual action without putting progress reads behind its effects. @param {boolean} preview @param {unknown} requestedId @returns {Promise<import('./types.js').MaintenancePlan>} */
 async function runManual(preview,requestedId){
 if(jobBusy)throw new Error('已有整理或预览正在进行，请等待完成或点击暂停');
 if(requestedId!==undefined&&(typeof requestedId!=='string'||!requestedId.length||requestedId.length>128))throw new Error('进度请求标识无效');
 const requestId=typeof requestedId==='string'?requestedId:crypto.randomUUID();jobBusy=true;
 try{return await engine.run(preview,'all','manual',sampleSafety,progress=>{job={requestId,progress};});}finally{jobBusy=false;}
 }
 /** Handle page safety or extension-owned controls only. @param {unknown} value @param {chrome.runtime.MessageSender} sender @returns {Promise<unknown>} */
 async function message(value,sender){
 if(!value||typeof value!=='object'||sender.id!==browser.runtime.id)return;
 const m=/** @type {Record<string,unknown>} */(value);
 if(m.egoTabSafety===true){
 const id=sender.tab?.id;if(id===undefined||sender.frameId!==0||!sender.tab?.url)return;
 for(const name of ['known','dirty','media','captured','activity'])if(typeof m[name]!=='boolean')return;
 if(typeof m.checkedAt!=='number'||!Number.isFinite(m.checkedAt)||m.checkedAt>now()||now()-m.checkedAt>120000)return;
 const state=/** @type {PageState} */(/** @type {unknown} */(m)),previous=states.get(id);
 states.set(id,{known:state.known,dirty:state.dirty,media:state.media,captured:state.captured,checkedAt:state.checkedAt,url:sender.tab.url});
 if(m.activity===true){engine.activity();handle(settle);}
 else if(!previous||previous.url!==sender.tab.url||previous.known!==state.known||previous.dirty!==state.dirty||previous.media!==state.media||previous.captured!==state.captured){engine.invalidate(true);handle(settle);}return;
 }
 const optionsUrl=`chrome-extension://${browser.runtime.id}/options.html`;
 if(sender.url!==optionsUrl||(sender.frameId??0)!==0||(sender.tab&&sender.tab.url!==optionsUrl))return;
 await ready;
 switch(m.command){case 'snapshot':return {...engine.snapshot(),errors:[...errors]};case 'progress':return job?.requestId===m.requestId?structuredClone(job):undefined;case 'preview':return runManual(true,m.requestId);case 'run':return runManual(false,m.requestId);case 'save':await engine.configure(m.config);return engine.snapshot();case 'pause':await engine.pause();return engine.snapshot();case 'restore':if(!Array.isArray(m.ids)||!m.ids.every(id=>typeof id==='string'))throw new Error('恢复记录无效');return engine.restore(m.ids);default:return;}
 }
 browser.runtime.onMessage.addListener((value,sender,reply)=>{void message(value,sender).then(result=>reply({ok:true,result}),error=>{log(error);reply({ok:false,error:String(error)});});return true;});
 return {ready,engine,states,errors,message};
}
