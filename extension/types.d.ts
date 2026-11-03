/** User-editable host aliases. Hosts are exact lower-case hostnames. */
export interface Alias {key:string;label:string;hosts:string[]}
/** User-editable project matches. Patterns are literal URL substrings. */
export interface Project {key:string;label:string;patterns:string[]}
/** Complete atomic settings document; disabled and unverified by default. Days are integer 1–365. */
export interface Config {enabled:boolean;spaceMappingVerified:boolean;deduplicate:boolean;consolidateHost:boolean;cleanTemporary:boolean;expire:boolean;sort:boolean;days:number;aliases:Alias[];projects:Project[];whitelist:string[];readOnlyRules:{host:string;pathPrefix:string}[]}
/** Boolean-only page protection signal; checkedAt is Unix epoch milliseconds. */
export interface PageState {known:boolean;dirty:boolean;media:boolean;captured:boolean;checkedAt:number}
/** Browser tab as observed within one 窗口. Unknown page state prevents closing. */
export interface TabSnapshot {id:number;url:string;pendingUrl?:string;discarded?:boolean;status?:'loading'|'complete'|'unloaded';title:string;windowId:number;spaceId:string;index:number;active:boolean;pinned:boolean;audible:boolean;captured:boolean;groupId:number;splitId:number;lastAccessed?:number;openedAt?:number;stableSince?:number;cooldownUntil:number;state?:PageState}
/** Stable sort category; project is the secondary key within an alias. */
export interface Category {key:string;label:string;project:string}
/** Candidate reason; a duplicate keeper must still exist at removal time. */
export interface Closure {id:number;keeperId?:number;reason:'git-project'|'duplicate'|'host-duplicate'|'temporary'|'expired'|'dormant'|'error'|'homepage'|'newtab'}
/** Ephemeral per-stage progress. Counts include confirmed browser effects only; no browsing content. */
export interface RunProgress {phase:'queued'|'checking'|'closing'|'sorting'|'completed'|'stopped'|'failed'|'interrupted';processed:number;total:number;closed:number;moved:number;failed:number}
/** Read-only desired order and closures; waiting contains skipped-work explanations. */
export interface MaintenancePlan {closures:Closure[];order:number[];tabs:TabSnapshot[];waiting:string[];progress?:RunProgress}
/** Durable local close history. Pending closure or restore attempt may have completed in Chrome. Times are Unix epoch milliseconds. */
export interface RecordEntry {id:string;batch:string;tabId:number;url:string;title:string;windowId:number;spaceId:string;/** Browser session in which windowId was observed; absent in legacy records. */session?:string;index:number;time:number;reason:string;status:'pending'|'closed'|'failed';error?:string;restoredAt?:number;restoreAttemptAt?:number}
/** Identity-scoped access observation and restore cooldown, all times in Unix epoch milliseconds. */
export interface Meta {url:string;windowId?:number;lastAccessed:number;openedAt?:number;stableSince:number;cooldownUntil:number;restoreRequestedUrl?:string;restorePending?:boolean}
/** Persisted local state. Session marker prevents tab-ID metadata reuse after browser restart. */
export interface PersistentState {config:Config;records:RecordEntry[];meta:Record<string,Meta>;session:string;/** Durable safety hold; explicit enable acknowledges review. */restoreReviewRequired?:boolean}
/** Browser effect boundary; rejected promises must not be reported as successful effects. */
export interface BrowserPort {
 /** Current Unix epoch time in milliseconds. */
 now():number;
 /** Load the last durable snapshot; undefined means first installation. */
 load():Promise<PersistentState|undefined>;
 /** Atomically replace local state or reject before any dependent browser effect. */
 save(state:PersistentState):Promise<void>;
 /** Return tabs from every 窗口; membership/indices reflect current browser state. */
 query():Promise<TabSnapshot[]>;
 /** Return a fresh tab or undefined if it vanished or cannot be read. */
 get(id:number):Promise<TabSnapshot|undefined>;
 /** Remove one tab or reject; browser removal events may fire during this promise. */
 remove(id:number):Promise<void>;
 /** Move one ungrouped, unsplit tab in its existing window; grouped blocks are unsupported. */
 move(ids:number[],windowId:number,index:number):Promise<void>;
 /** Open a new tab; the returned committed url may be empty while pendingUrl holds the request. */
 create(url:string,windowId:number|undefined,index:number):Promise<TabSnapshot>;
 /** Check whether the requested original 窗口/window still exists. */
 hasWindow(id:number):Promise<boolean>;
 /** True only after the browser reports an idle state; errors return false. */
 idle():Promise<boolean>;
 /** Stable within a browser session and changed after a browser restart. */
 session():Promise<string>;
}
/** Serialized planner and effect controller. Pause/config invalidation occurs before queued writes. */
export interface Engine {
 /** Restore durable state and pause when a prior restore attempt is uncertain. */
 initialize():Promise<void>;
 /** Validate and apply complete settings immediately; persist through the queue. */
 configure(value:unknown):Promise<void>;
 /** Disable maintenance synchronously, then persist through the queue. */
 pause():Promise<void>;
 /** Manual bypasses automation waits only; capture cancellation before queued safety refresh. Preview never applies effects. */
 run(preview?:boolean,mode?:'all'|'sort-only',trigger?:'automatic'|'manual',refresh?:()=>Promise<void>,report?:(progress:RunProgress)=>void):Promise<MaintenancePlan>;
 /** Explicitly reopen selected history URLs; errors may leave a visible uncertain attempt. */
 restore(ids:string[]):Promise<{restored:number;fallback:number}>;
 /** Record user activation as a fresh visit and cancel pending effects. */
 activate(id:number):Promise<void>;
 /** Persist a reliable browser creation time; absent for tabs already open before observation. */
 created(tab:TabSnapshot,openedAt?:number):Promise<void>;
 /** Reset navigation stability; complete finalizes initial restore redirects. */
 navigate(id:number,complete?:boolean):Promise<void>;
 /** Return a detached copy of current local state. */
 snapshot():PersistentState;
 /** Cancel pending effects and start a 30-second user-quiet period. */
 activity():void;
 /** Cancel effects; sampled safety alone can be refreshed before a manual request begins. */
 invalidate(safetyOnly?:boolean):void;
}
