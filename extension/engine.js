import {temporaryKind,instantKind} from './temporary.js';
import {defaultConfig,validateConfig,planMaintenance,canClose,blocks,duplicateUrls,sameHostname,gitProject} from './policy.js';
/** @typedef {import('./types.js').TabSnapshot} TabSnapshot */
/** @typedef {import('./types.js').PersistentState} PersistentState */
/** @typedef {import('./types.js').RecordEntry} RecordEntry */
/** Durable, serial effect executor. Configuration invalidates running work synchronously. @param {import('./types.js').BrowserPort} port @returns {import('./types.js').Engine} */
export function createEngine(port) {
 /** @type {PersistentState} */ let state={config:defaultConfig(),records:[],meta:{},session:''};
 let epoch=0,requestEpoch=0,activityAt=-Infinity,sequence=0;
 /** @type {Promise<unknown>} */ let queue=Promise.resolve();
 /** @template T @param {()=>Promise<T>} fn @returns {Promise<T>} */
 const serial=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
 /** Serialize copies to avoid later in-memory changes altering an in-flight write. @returns {Promise<void>} */
 const persist=()=>port.save(structuredClone(state));
 /** A pre-remove cancellation is known not to have removed a tab. @param {RecordEntry} record @param {string} reason @returns {Promise<void>} */
 const cancelPending=async(record,reason)=>{record.status='failed';record.error=reason;await persist();};
 /** @param {number} token @param {boolean} [manual] @returns {boolean} */
 const allowed=(token,manual=false)=>token===epoch&&state.config.spaceMappingVerified&&!state.restoreReviewRequired&&(manual||(state.config.enabled&&port.now()-activityAt>=30000));
 /** Combine reliable browser access with identity-scoped local observations. @param {TabSnapshot[]} tabs @returns {TabSnapshot[]} */
 function observe(tabs){const now=port.now();return tabs.map(t=>{let m=state.meta[String(t.id)];const restoring=!!m?.restorePending&&m.windowId===t.windowId;
 if(!m||(!restoring&&m.url!==t.url))m={url:t.url,windowId:t.windowId,lastAccessed:Number.isFinite(t.lastAccessed)&&/** @type {number} */(t.lastAccessed)<=now?/** @type {number} */(t.lastAccessed):now,openedAt:m?.windowId===t.windowId?m.openedAt:undefined,stableSince:Number.isFinite(t.stableSince)?/** @type {number} */(t.stableSince):now,cooldownUntil:t.cooldownUntil||0};
 if(restoring){if(t.url&&m.url!==t.url){m.url=t.url;m.stableSince=now;}if(t.status==='complete'&&t.url)m.restorePending=false;}
 if(Number.isFinite(t.lastAccessed)&&/** @type {number} */(t.lastAccessed)<=now)m.lastAccessed=Math.max(m.lastAccessed,/** @type {number} */(t.lastAccessed));
 state.meta[String(t.id)]=m;return {...t,...m};});}
 /** Confirm a candidate still has its original identity and protection. @param {TabSnapshot|undefined} live @param {TabSnapshot} planned @returns {boolean} */
 const unchanged=(live,planned)=>!!live&&live.url===planned.url&&live.spaceId===planned.spaceId&&live.windowId===planned.windowId&&live.groupId===planned.groupId&&live.splitId===planned.splitId;
 /** Recheck age against fresh browser access as well as concrete protections. @param {TabSnapshot} tab @param {import('./types.js').Closure} candidate @param {boolean} [manual] @returns {boolean} */
 const closable=(tab,candidate,manual=false)=>{const live=observe([tab])[0],age=port.now()-/** @type {number} */(live.lastAccessed);return canClose(live,state.config,port.now(),manual)&&(candidate.reason===instantKind(live)||candidate.reason==='duplicate'||candidate.reason==='git-project'||age>=(candidate.reason==='host-duplicate'||candidate.reason==='temporary'?86400000:state.config.days*86400000))&&(candidate.reason!=='temporary'||temporaryKind(live)!==undefined)&&(!['dormant','error','homepage','newtab'].includes(candidate.reason)||instantKind(live)===candidate.reason);};
 /** A surviving keeper must still meet the specific relationship in this 窗口. @param {import('./types.js').Closure} candidate @param {TabSnapshot} original @param {TabSnapshot|undefined} keeper @returns {boolean} */
 const retains=(candidate,original,keeper)=>!!keeper&&keeper.windowId===original.windowId&&keeper.spaceId===original.spaceId&&(candidate.reason==='git-project'?!!gitProject(original.url,state.config)&&gitProject(keeper.url,state.config)===gitProject(original.url,state.config)&&(!state.config.cleanTemporary||!instantKind(keeper)):candidate.reason==='host-duplicate'?sameHostname(keeper.url,original.url):duplicateUrls(keeper.url,original.url));
 /** @param {number} id @param {boolean} activation @param {boolean} [complete] @returns {Promise<void>} */
 const touch=(id,activation,complete=false)=>{epoch++;requestEpoch++;if(activation)activityAt=port.now();return serial(async()=>{const t=await port.get(id);if(!t)return;observe([t]);const m=state.meta[String(id)];if(activation)m.lastAccessed=port.now();else {if(t.url||!m.restorePending)m.url=t.url;m.stableSince=port.now();if(complete&&t.url)m.restorePending=false;}await persist();});};
 return {
 async initialize(){const session=await port.session(),saved=await port.load();if(saved){state.config=validateConfig(saved.config);state.records=Array.isArray(saved.records)?saved.records:[];state.meta=saved.session===session?saved.meta:{};}state.session=session;state.records=state.records.filter(r=>r.time>=port.now()-30*86400000);state.restoreReviewRequired=(saved?.restoreReviewRequired??state.records.some(r=>r.restoreAttemptAt!==undefined&&r.restoredAt===undefined))||(saved?.session!==session&&state.records.some(r=>r.restoredAt!==undefined&&port.now()-r.restoredAt<86400000));if(state.restoreReviewRequired){state.config={...state.config,enabled:false};await persist();}},
 configure(value){const config=validateConfig(value);epoch++;requestEpoch++;state.config=config;if(config.enabled)state.restoreReviewRequired=false;return serial(persist);},
 pause(){epoch++;requestEpoch++;state.config={...state.config,enabled:false};return serial(persist);},
 activity(){epoch++;requestEpoch++;activityAt=port.now();},
 invalidate(safetyOnly=false){epoch++;if(!safetyOnly)requestEpoch++;},
 activate(id){return touch(id,true);},
 created(tab,openedAt=port.now()){epoch++;requestEpoch++;activityAt=openedAt;const prior=state.meta[String(tab.id)];if(prior?.restorePending&&prior.windowId===tab.windowId)return serial(persist);state.meta[String(tab.id)]={url:tab.url,windowId:tab.windowId,lastAccessed:openedAt,openedAt,stableSince:openedAt,cooldownUntil:0};return serial(persist);},
 navigate(id,complete=false){return touch(id,false,complete);},
 snapshot(){return structuredClone(state);},
 run(preview=false,mode='all',trigger='automatic',refresh,report){const manual=trigger==='manual',requested=requestEpoch;
 /** @type {import('./types.js').RunProgress} */const progress={phase:'queued',processed:0,total:0,closed:0,moved:0,failed:0};
 /** Telemetry is detached and never allowed to abort effects. @param {Partial<import('./types.js').RunProgress>} patch @returns {void} */
 const emit=patch=>{Object.assign(progress,patch);try{report?.(structuredClone(progress));}catch{/* Observation cannot change execution. */}};
 emit({});return serial(async()=>{
 emit({phase:'checking',processed:0,total:0});
 if(manual&&refresh&&requested===requestEpoch)await refresh();
 const token=epoch,tabs=observe(await port.query()),plan=planMaintenance(tabs,state.config,port.now(),manual);emit({processed:tabs.length,total:tabs.length});
 if(manual&&requested!==requestEpoch){plan.waiting.push('本次手动整理因交互、暂停或页面状态变化已取消');return plan;}
 if(preview)return plan;
 if(mode==='sort-only')plan.closures=[];
 if(!state.config.spaceMappingVerified){plan.waiting.push('窗口 隔离尚未验证，请先完成空间隔离验证');return plan;}
 if(state.restoreReviewRequired){plan.waiting.push('恢复结果待确认，请检查恢复页面后重新启用维护');return plan;}
 if(!allowed(token,manual)){plan.waiting.push(!state.config.enabled?'自动维护已暂停':'等待交互结束满 30 秒');return plan;}
 if((!manual&&!await port.idle())||!allowed(token,manual)){plan.waiting.push('等待浏览器空闲 30 秒');return plan;}
 await persist();if(!allowed(token,manual)){plan.waiting.push('本次整理因交互、暂停或页面状态变化已停止');return plan;}
 const batch=`${port.now()}-${++sequence}`;
 emit({phase:'closing',processed:0,total:plan.closures.length});
 for(const candidate of plan.closures){
 if(!allowed(token,manual))break;
 try{
 const original=tabs.find(t=>t.id===candidate.id);if(!original)continue;
 let current=await port.get(candidate.id);if(!allowed(token,manual))break;
 if(!unchanged(current,original)||!current||!closable(current,candidate,manual))continue;
 if(candidate.keeperId!==undefined){const keeper=await port.get(candidate.keeperId);if(!allowed(token,manual))break;if(!retains(candidate,original,keeper))continue;}
 /** @type {RecordEntry} */const record={id:`${batch}-${candidate.id}`,batch,tabId:original.id,url:original.url,title:original.title,windowId:original.windowId,spaceId:original.spaceId,session:state.session,index:original.index,time:port.now(),reason:candidate.reason,status:'pending'};
 state.records=state.records.filter(r=>r.time>=port.now()-30*86400000);state.records.push(record);await persist();if(!allowed(token,manual)){await cancelPending(record,'关闭前维护状态变化');break;}
 // Recheck after durability write: pause, activation and navigation may race storage.
 current=await port.get(candidate.id);if(!allowed(token,manual)){await cancelPending(record,'关闭前维护状态变化');break;}
 if(!unchanged(current,original)||!current||!closable(current,candidate,manual)){await cancelPending(record,'关闭前页面保护或身份变化');continue;}
 if(candidate.keeperId!==undefined){const keeper=await port.get(candidate.keeperId);if(!allowed(token,manual)){await cancelPending(record,'关闭前维护状态变化');break;}if(!retains(candidate,original,keeper)){await cancelPending(record,'重复页保留对象变化');continue;}}
 if((!manual&&!await port.idle())||!allowed(token,manual)){await cancelPending(record,'关闭前浏览器不空闲或状态变化');break;}
 if(candidate.keeperId!==undefined){const keeper=await port.get(candidate.keeperId);if(!allowed(token,manual)){await cancelPending(record,'关闭前维护状态变化');break;}if(!retains(candidate,original,keeper)){await cancelPending(record,'重复页保留对象变化');continue;}}
 current=await port.get(candidate.id);if(!allowed(token,manual)){await cancelPending(record,'关闭前维护状态变化');break;}
 if(!unchanged(current,original)||!current||!closable(current,candidate,manual)){await cancelPending(record,'关闭前页面保护或身份变化');continue;}
 try {await port.remove(candidate.id);}catch(error){record.status='failed';record.error=String(error);progress.failed++;await persist();plan.waiting.push('部分页面关闭失败，请查看本机关闭记录');continue;}
 // Keep pending durable if execution terminates after successful removal.
 const vanished=await port.get(candidate.id);record.status=vanished?'failed':'closed';if(vanished){progress.failed++;record.error='删除后标签仍存在';plan.waiting.push('部分页面关闭后仍存在，请查看本机关闭记录');}else progress.closed++;delete state.meta[String(candidate.id)];await persist();if(!allowed(token,manual))break;
 }finally{emit({processed:progress.processed+1});}
 }
 if(state.config.sort&&allowed(token,manual)){
 const current=observe(await port.query());emit({phase:'sorting',processed:0,total:current.length});if(!allowed(token,manual)){plan.waiting.push('本次整理因交互、暂停或页面状态变化已停止');return plan;}
 for(const windowId of new Set(current.map(t=>t.windowId))){
 const before=tabs.filter(t=>t.windowId===windowId&&current.some(x=>x.id===t.id)),after=current.filter(t=>t.windowId===windowId);
 if(after.some(t=>t.groupId!==-1||t.splitId!==-1)){if(!plan.waiting.some(x=>x.includes(`窗口 ${windowId} 含现有分组或分屏`)))plan.waiting.push(`窗口 ${windowId} 含现有分组或分屏，已保留整个 窗口 的原顺序`);emit({processed:progress.processed+after.length});continue;}
 if(before.length!==after.length||after.some(t=>!before.some(b=>b.id===t.id&&unchanged(t,b)&&t.pinned===b.pinned))){emit({processed:progress.processed+after.length});continue;}
 const desired=plan.order.filter(id=>after.some(t=>t.id===id));let index=0;
 for(const id of desired){const block=blocks(after).find(b=>b[0].id===id);if(!block)continue;
 const ids=block.map(t=>t.id),live=await port.query();if(!allowed(token,manual))break;
 if(ids.length!==1||live.some(t=>t.windowId===windowId&&(t.groupId!==-1||t.splitId!==-1)))break;
 if(live.filter(t=>t.windowId===windowId).length!==after.length||after.some(t=>!live.some(l=>l.id===t.id&&unchanged(l,t)&&l.pinned===t.pinned)))break;
 if((!manual&&!await port.idle())||!allowed(token,manual))break;
 const finalTabs=await port.query();if(!allowed(token,manual))break;
 if(finalTabs.some(t=>t.windowId===windowId&&(t.groupId!==-1||t.splitId!==-1))||after.some(t=>!finalTabs.some(l=>l.id===t.id&&unchanged(l,t)&&l.pinned===t.pinned)))break;
 if(!ids.every((member,i)=>finalTabs.find(t=>t.id===member)?.index===index+i)){try{await port.move(ids,windowId,index);progress.moved+=ids.length;}catch{progress.failed++;plan.waiting.push('部分标签排序失败，请重试');break;}}
 index+=ids.length;emit({processed:progress.processed+ids.length});
 }
 }
 }
 if(progress.phase==='sorting'&&progress.processed<progress.total&&!plan.waiting.length)plan.waiting.push('页面结构变化，部分排序已跳过');
 if(!allowed(token,manual))plan.waiting.push('本次整理因交互、暂停或页面状态变化已停止');
 return plan;
 }).then(plan=>{emit({phase:progress.failed?'failed':plan.waiting.length?'stopped':'completed'});plan.progress=structuredClone(progress);return plan;},error=>{emit({phase:'failed',failed:progress.failed+1});throw error;});},
 restore(ids){return serial(async()=>{let restored=0,fallback=0;
 for(const id of new Set(ids)){const r=state.records.find(r=>r.id===id);if(!r||r.restoredAt!==undefined||r.status==='failed')continue;
 const exists=r.session===state.session&&await port.hasWindow(r.windowId),now=port.now(),previousAttempt=r.restoreAttemptAt,previousReview=state.restoreReviewRequired;r.restoreAttemptAt=now;state.restoreReviewRequired=true;
 try{await persist();}catch(error){r.restoreAttemptAt=previousAttempt;state.restoreReviewRequired=previousReview;throw error;}
 let t;try{t=await port.create(r.url,exists?r.windowId:undefined,r.index);}catch(error){r.restoreAttemptAt=undefined;state.restoreReviewRequired=previousReview;await persist();throw error;}
 state.meta[String(t.id)]={url:r.url,windowId:t.windowId,restoreRequestedUrl:r.url,restorePending:true,lastAccessed:now,openedAt:now,stableSince:now,cooldownUntil:now+86400000};r.restoredAt=now;delete r.restoreAttemptAt;state.restoreReviewRequired=previousReview;
 try{await persist();}catch(error){r.restoredAt=undefined;r.restoreAttemptAt=now;state.restoreReviewRequired=true;state.config={...state.config,enabled:false};throw new Error(`恢复结果待确认，请检查标签页后再重试：${String(error)}`);}
 restored++;if(!exists)fallback++;}
 return {restored,fallback};});}
 };
}
