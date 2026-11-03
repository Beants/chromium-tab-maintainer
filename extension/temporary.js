/** @typedef {import('./types.js').TabSnapshot} TabSnapshot */
/** Exact blank entry URLs; other internal pages remain protected. @param {string} url @returns {boolean} */
export function isNewTab(url){return ['chrome://newtab/','chrome://new-tab-page/'].includes(url);}
/** Explicit disposable pages that need no age threshold. @param {TabSnapshot} tab @returns {'dormant'|'error'|'homepage'|'newtab'|undefined} */
export function instantKind(tab){
 if(isNewTab(tab.url))return 'newtab';
 let u;try{u=new URL(tab.url);}catch{return undefined;}if(!/^https?:$/.test(u.protocol))return undefined;
 if(tab.discarded===true)return 'dormant';
 const title=tab.title.trim();
 if(/^(?:HTTP(?: ERROR)?[ :]+)?[45]\d{2}$/i.test(title)||/^[45]\d{2} (?:Bad Request|Unauthorized|Payment Required|Forbidden|Not Found|Method Not Allowed|Not Acceptable|Proxy Authentication Required|Request Timeout|Conflict|Gone|Length Required|Precondition Failed|Payload Too Large|URI Too Long|Unsupported Media Type|Range Not Satisfiable|Expectation Failed|Unprocessable (?:Entity|Content)|Locked|Failed Dependency|Too Early|Upgrade Required|Precondition Required|Too Many Requests|Request Header Fields Too Large|Unavailable For Legal Reasons|Internal Server Error|Not Implemented|Bad Gateway|Service (?:Temporarily )?Unavailable|Gateway Timeout|HTTP Version Not Supported|Variant Also Negotiates|Insufficient Storage|Loop Detected|Not Extended|Network Authentication Required)$/i.test(title)||/^ERR_(?:CONNECTION_(?:REFUSED|RESET|CLOSED|TIMED_OUT)|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|NETWORK_CHANGED|EMPTY_RESPONSE|TIMED_OUT|CERT_[A-Z_]+)$/.test(title)||title==='系统仅限内网访问'||/^没有权限访问(?:\s*[-—].*)?$/.test(title))return 'error';
 if(['baidu.com','www.baidu.com'].includes(u.hostname)&&u.pathname==='/')return 'homepage';
 return undefined;
}
/** Deterministic temporary-page classification; no page text or LLM is used. @param {TabSnapshot} tab @returns {'search'|'article'|'landing'|'login'|'error'|undefined} */
export function temporaryKind(tab){
 let u;try{u=new URL(tab.url);}catch{return undefined;}if(!/^https?:$/.test(u.protocol))return undefined;
 const h=u.hostname,p=u.pathname;
 if((['google.com','www.google.com','google.com.hk','www.google.com.hk','bing.com','www.bing.com'].includes(h)&&p==='/search'&&u.searchParams.get('q')?.trim())||(['baidu.com','www.baidu.com'].includes(h)&&p==='/s'&&u.searchParams.get('wd')?.trim()))return 'search';
 if((['v2ex.com','www.v2ex.com'].includes(h)&&/^\/t\/\d+\/?$/.test(p))||(h==='multica.ai'&&/^\/changelog\/?$/.test(p)))return 'article';
 if((h==='opencode.ai'&&/^\/(?:zh\/)?go\/?$/.test(p))||(h==='lightvela.com'&&/^\/docs\/overview\/?$/.test(p))||(h==='www.deepseek.com'&&p==='/'))return 'landing';
 if(/\/(?:login|sign-in|sign_in|signin)(?:\/|$)/i.test(p))return 'login';
 if(['400 Bad Request','401 Unauthorized','403 Forbidden','404 Not Found','500 Internal Server Error','502 Bad Gateway','503 Service Temporarily Unavailable','504 Gateway Timeout','系统仅限内网访问'].includes(tab.title.trim())||/^没有权限访问(?:\s*[-—].*)?$/.test(tab.title.trim()))return 'error';
 return undefined;
}
