(function(){
'use strict';

const CFG={
  url:'https://nfdhwkegnhjgozbtezew.supabase.co',
  key:'sb_publishable_piNPaywd21AJ7j6oCy32_g_M2BYpUov',
  sessionKey:'buffet_v9_auth_session',
  deviceKey:'buffet_v9_device_id',
  memberKey:'buffet_v9_member_cache',
  epochKey:'buffet_v9_data_epoch',
  periodKey:'buffet_v9_period_epoch',
  journalKey:'buffet_v9_sync_journal',
  dbName:'buffet_v9_offline',
  store:'ops',
  pollMs:10000
};
const O={
  session:null,user:null,buffetId:null,buffetName:null,accessMode:null,deviceId:null,dataEpoch:1,periodEpoch:1,
  ready:false,suppress:false,lastState:null,lastArchive:[],syncing:false,lastServerEventAt:null,
  pollTimer:null,online:navigator.onLine,queuePromise:Promise.resolve()
};
window.BUFFET_ONLINE=O;

function clone(v){return JSON.parse(JSON.stringify(v));}
function nowIso(){return new Date().toISOString();}
function uid(prefix='X'){return prefix+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));}
function dateKey(v){
  if(!v)return new Date().toISOString().slice(0,10);
  let s=String(v).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[‎‏‪-‮]/g,'');
  let m=s.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{4})/);
  if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  return new Date().toISOString().slice(0,10);
}
function workerCacheSuffix(){return O.accessMode==='worker'?`:worker:${O.user?.id||O.session?.user?.id||'unknown'}`:'';}
function dataKeyFor(bid){return `buffet_v9_online_state:${bid}${workerCacheSuffix()}`;}
function archiveKeyFor(bid){return O.accessMode==='worker'?`buffet_v9_online_archive:${bid}${workerCacheSuffix()}`:`buffet_v9_online_archive:${bid}`;}
function epochKeyFor(bid){return `buffet_v9_data_epoch:${bid}`;}
function periodKeyFor(bid){return `buffet_v9_period_epoch:${bid}`;}
function blankState(){return window.resetFreshState?window.resetFreshState():{cash:{opening:0,movements:[]},openingDue:{},cats:[],people:[],suppliers:[''],expenseTypes:['كهرباء','مياه','صيانة','نقل','ضيافة على البوفيه','أخرى'],products:[],sales:[],payments:[],purchases:[],expenses:[],recipes:[],hospitality:[],audit:[],accountLedger:[],accountLedgerVersion:1};}
function persistBuffetCache(){
  if(!O.buffetId||!window.S)return;
  try{localStorage.setItem(dataKeyFor(O.buffetId),JSON.stringify(window.S));}catch(e){}
  if(O.accessMode!=='worker')try{localStorage.setItem(archiveKeyFor(O.buffetId),localStorage.getItem(window.ARCHIVE_KEY||'buffet_v9_online_archive')||'[]');}catch(e){}
}
function restoreBuffetCache(bid){
  if(!window.S||!bid)return false;
  let data=null,archive='[]';
  try{data=JSON.parse(localStorage.getItem(dataKeyFor(bid))||'null');archive=O.accessMode==='worker'?'[]':(localStorage.getItem(archiveKeyFor(bid))||'[]');}catch(e){data=null;archive='[]';}
  O.suppress=true;
  try{
    const src=data&&typeof data==='object'?data:blankState();
    Object.keys(window.S).forEach(k=>delete window.S[k]);Object.assign(window.S,clone(src));ensureIds(window.S);window.normalizeState?.();
    localStorage.setItem(window.DATA_KEY||'buffet_v9_online_state',JSON.stringify(window.S));
    localStorage.setItem(window.ARCHIVE_KEY||'buffet_v9_online_archive',archive);
    O.lastState=clone(window.S);O.lastArchive=archiveNow();window.render?.();
  }finally{O.suppress=false;}
  return !!data;
}
function rememberBuffetAccess(m){
  if(!m?.buffet_id)return false;
  const mode=m.access_mode==='worker'?'worker':'owner';
  const cached={...m,user_id:O.user?.id||m.user_id||null,access_mode:mode,is_primary:mode==='owner'};
  O.accessMode=mode;O.buffetId=cached.buffet_id;O.buffetName=cached.buffet_name||'البوفيه';
  try{localStorage.setItem(CFG.memberKey,JSON.stringify(cached));}catch(e){}
  O.dataEpoch=Number(localStorage.getItem(epochKeyFor(O.buffetId))||1);O.periodEpoch=Number(localStorage.getItem(periodKeyFor(O.buffetId))||1);
  return true;
}
function cachedBuffetAccess(){
  let m=null;try{m=JSON.parse(localStorage.getItem(CFG.memberKey)||'null')}catch(e){}
  if(!m?.buffet_id)return null;
  const uid=O.user?.id||O.session?.user?.id||null;
  if(m.user_id&&uid&&m.user_id!==uid)return null;
  if(uid&&!m.user_id){m.user_id=uid;try{localStorage.setItem(CFG.memberKey,JSON.stringify(m));}catch(e){}}
  m.access_mode=m.access_mode==='worker'?'worker':'owner';m.is_primary=m.access_mode==='owner';
  return m;
}
function ensureIds(st){
  if(!st||typeof st!=='object')return st;
  const assign=(arr,prefix,key='_id')=>(arr||[]).forEach(x=>{if(x&&typeof x==='object'){if(!x[key])x[key]=uid(prefix);if(!x.createdAt)x.createdAt=nowIso();}});
  const assignNamed=(arr,prefix,key='_id')=>(arr||[]).forEach(x=>{if(x&&typeof x==='object'){if(!x[key]){const n=String(x.name||'').trim().normalize('NFKC').toLowerCase();x[key]=n?`${prefix}|${n}`:uid(prefix);}if(!x.createdAt)x.createdAt=nowIso();}});
  assignNamed(st.products,'PRD');assignNamed(st.recipes,'RCP');assign(st.purchases,'PUR');assign(st.expenses,'EXP');
  assign(st.hospitality,'HSP','id');assign(st.sales,'S','id');assign(st.payments,'P','id');
  assign(st.audit,'AUD');
  if(st.cash&&Array.isArray(st.cash.movements))assign(st.cash.movements,'CSH');
  if(Array.isArray(st.accountLedger))assign(st.accountLedger,'LED','id');
  return st;
}
window.ensureOnlineIds=ensureIds;

function clearOperationalAutofill(){
  const email=String(O.user?.email||'').trim().toLowerCase();
  for(const id of ['newOfficerName','officerSearch']){
    const el=document.getElementById(id);if(!el)continue;
    el.setAttribute('name',id==='newOfficerName'?'buffet_officer_name':'buffet_officer_search');
    el.setAttribute('autocomplete','off');el.setAttribute('data-lpignore','true');el.setAttribute('data-form-type','other');
    if(email&&String(el.value||'').trim().toLowerCase()===email)el.value='';
    if(!el.dataset.onlineAutofillGuard){el.dataset.onlineAutofillGuard='1';el.addEventListener('focus',()=>{if(email&&String(el.value||'').trim().toLowerCase()===email)el.value='';});}
  }
}
function isEmailVerifyCallback(){
  try{
    const q=new URLSearchParams(location.search||'');
    const h=new URLSearchParams((location.hash||'').replace(/^#/,''));
    return q.get('type')==='signup'||h.get('type')==='signup'||q.has('error')||h.has('error')||q.has('error_code')||h.has('error_code');
  }catch(e){return false;}
}
function renderEmailVerifyResult(){
  const hash=new URLSearchParams((location.hash||'').replace(/^#/,''));
  const query=new URLSearchParams(location.search||'');
  const err=hash.get('error_description')||query.get('error_description')||hash.get('error')||query.get('error');
  const code=hash.get('error_code')||query.get('error_code')||'';
  const reused=!!err&&(/expired|invalid|already|used/i.test(String(err))||/expired|invalid/i.test(String(code)));
  try{history.replaceState(null,'',location.pathname);}catch(e){}
  document.body.innerHTML=`<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d1117;color:#fff;padding:24px;direction:rtl;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="width:min(430px,100%);text-align:center;background:#151a21;border:1px solid #30363d;border-radius:24px;padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.5)">
      <div style="width:76px;height:76px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;background:${err?'#5b1d24':'#123d2a'};font-size:42px">${err?'!':'✓'}</div>
      <h2 style="margin:0 0 10px">${err?(reused?'رابط التأكيد تم استخدامه أو انتهت صلاحيته':'تعذر تأكيد البريد الإلكتروني'):'تم تأكيد البريد الإلكتروني بنجاح'}</h2>
      <p style="margin:0;color:#b7c0cc;line-height:1.8">${err?(reused?'لو كنت أكدت البريد قبل كده، اقفل الصفحة وارجع لتطبيق البوفيه وسجل الدخول.':'ارجع لتطبيق البوفيه وحاول من جديد.'):'يمكنك إغلاق هذه الصفحة والعودة إلى تطبيق البوفيه.'}</p>
    </div>
  </div>`;
}

function injectUI(){
  if(document.getElementById('onlineAuth'))return;
  const style=document.createElement('style');
  style.textContent=`
  #onlineAuth{position:fixed;inset:0;z-index:30000;background:#0d1117;display:none;align-items:center;justify-content:center;padding:20px;direction:rtl;font-family:inherit;overflow:auto}
  #onlineAuth.show{display:flex}.oa-box{width:min(430px,100%);background:#151a21;border:1px solid #30363d;border-radius:24px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.55)}
  .oa-logo{width:92px;height:92px;display:block;margin:0 auto 12px;border-radius:22px}.oa-box h2{text-align:center;margin:4px 0 6px;color:#fff}.oa-sub{text-align:center;color:#9da7b3;margin-bottom:18px;line-height:1.7}
  .oa-field{display:grid;gap:7px;margin:10px 0}.oa-field label{color:#cbd5e1;font-size:14px}.oa-field input{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #39424e;color:#fff;border-radius:13px;padding:13px;font-size:16px;direction:ltr;text-align:left}
  .oa-actions{display:grid;gap:9px;margin-top:14px}.oa-btn{border:0;border-radius:13px;padding:13px 15px;font-size:16px;font-weight:800;cursor:pointer}.oa-primary{background:#1f6feb;color:#fff}.oa-secondary{background:#21262d;color:#fff;border:1px solid #3a424d}.oa-msg{min-height:24px;margin-top:12px;color:#d1d5db;text-align:center;line-height:1.6}.oa-msg.err{color:#ff8b8b}.oa-msg.ok{color:#7ee787}
  #onlineStatus{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:18000;border:1px solid #3b4654;background:rgba(17,24,39,.94);color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none;align-items:center;gap:7px;direction:rtl;cursor:pointer;user-select:none}
  #onlineStatus.show{display:flex}.os-dot{width:8px;height:8px;border-radius:50%;background:#22c55e}.offline .os-dot{background:#f59e0b}.syncing .os-dot{background:#60a5fa}.error .os-dot{background:#ef4444}
  #onlineLogoutBtn,#onlineWorkerBtn{display:none;align-items:center;justify-content:center;background:#111;color:#eee;border:1px solid #3a3a3a;border-radius:12px;padding:9px 12px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
  #onlineLogoutBtn:hover,#onlineWorkerBtn:hover{border-color:#5a5a5a}.header-spacer{display:flex;align-items:center;justify-content:flex-end;gap:7px}#oaForgot{width:100%;margin-top:2px}
  #workerModal{position:fixed;inset:0;z-index:32000;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:18px;direction:rtl}#workerModal.show{display:flex}
  .worker-box{width:min(500px,100%);max-height:88vh;overflow:auto;background:#151a21;border:1px solid #30363d;border-radius:22px;padding:20px;color:#fff;box-shadow:0 22px 70px rgba(0,0,0,.55)}
  .worker-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:11px 0;border-bottom:1px solid #2b313a}.worker-row:last-child{border-bottom:0}.worker-email{direction:ltr;text-align:left;overflow-wrap:anywhere}.worker-actions{display:flex;gap:7px;flex-wrap:wrap}.worker-note{color:#9da7b3;font-size:13px;line-height:1.7;margin:8px 0 14px}
  @media(max-width:520px){#onlineLogoutBtn,#onlineWorkerBtn{padding:8px 9px;font-size:11px;border-radius:10px}}
  .public-view #onlineStatus,.public-view #onlineAuth,.public-view #onlineLogoutBtn{display:none!important}
  `;
  document.head.appendChild(style);
  const auth=document.createElement('div');auth.id='onlineAuth';auth.innerHTML=`<div class="oa-box">
    <img class="oa-logo" src="icon-192.png" alt="البوفيه"><h2>البوفيه</h2>
    <div id="oaLoginPanel">
      <div class="oa-sub">سجّل الدخول للوصول إلى بوفيهك من أي جهاز</div>
      <div class="oa-field"><label>البريد الإلكتروني</label><input id="oaEmail" type="email" autocomplete="email" placeholder="name@example.com"></div>
      <div class="oa-field"><label>كلمة المرور</label><input id="oaPass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <div class="oa-actions"><button id="oaLogin" class="oa-btn oa-primary" type="button">تسجيل الدخول</button><button id="oaSignup" class="oa-btn oa-secondary" type="button">إنشاء حساب</button></div>
      <button id="oaForgot" class="oa-btn oa-secondary" type="button">نسيت كلمة المرور؟</button>
    </div>
    <div id="oaRecoveryPanel" style="display:none;margin-top:8px">
      <div class="oa-sub" style="margin-bottom:12px">اكتب كلمة مرور جديدة للحساب.</div>
      <div class="oa-field"><label>كلمة المرور الجديدة</label><input id="oaNewPass" type="password" autocomplete="new-password" placeholder="••••••••"></div>
      <div class="oa-field"><label>تأكيد كلمة المرور</label><input id="oaNewPass2" type="password" autocomplete="new-password" placeholder="••••••••"></div>
      <button id="oaSetPassword" class="oa-btn oa-primary" type="button" style="width:100%">حفظ كلمة المرور الجديدة</button>
    </div>
    <div id="oaMsg" class="oa-msg"></div>
  </div>`;
  document.body.appendChild(auth);
  const status=document.createElement('div');status.id='onlineStatus';status.innerHTML='<span class="os-dot"></span><span id="onlineStatusText">Online</span>';document.body.appendChild(status);
  const workerBtn=document.createElement('button');workerBtn.id='onlineWorkerBtn';workerBtn.type='button';workerBtn.textContent='الموظف';workerBtn.addEventListener('click',openWorkerModal);
  const logoutBtn=document.createElement('button');logoutBtn.id='onlineLogoutBtn';logoutBtn.type='button';logoutBtn.textContent='تسجيل الخروج';logoutBtn.addEventListener('click',logoutOnline);
  const headerSlot=document.querySelector('.header-spacer');if(headerSlot){headerSlot.removeAttribute('aria-hidden');headerSlot.appendChild(workerBtn);headerSlot.appendChild(logoutBtn);}else{document.body.appendChild(workerBtn);document.body.appendChild(logoutBtn);}
  const wm=document.createElement('div');wm.id='workerModal';wm.innerHTML=`<div class="worker-box"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h3 style="margin:0">موظف البوفيه</h3><button id="workerCloseBtn" class="oa-btn oa-secondary" type="button">إغلاق</button></div><div class="worker-note">سجّل بريد الموظف هنا أولًا، وبعدها الموظف ينشئ حساب أو يسجل دخول بنفس البريد. سيظهر له الضباط والتحصيلات فقط.</div><div style="display:grid;grid-template-columns:1fr auto;gap:8px"><input id="workerEmailInput" type="email" placeholder="worker@example.com" style="direction:ltr;background:#0d1117;border:1px solid #39424e;color:#fff;border-radius:12px;padding:12px"><button id="workerAddBtn" class="oa-btn oa-primary" type="button">إضافة / تفعيل</button></div><div id="workerMsg" class="oa-msg"></div><div id="workerRows"></div></div>`;document.body.appendChild(wm);
  document.getElementById('workerCloseBtn').addEventListener('click',closeWorkerModal);
  document.getElementById('workerAddBtn').addEventListener('click',addOrEnableWorker);
  wm.addEventListener('click',e=>{if(e.target===wm)closeWorkerModal();});
  document.getElementById('oaLogin').addEventListener('click',()=>authLogin(false));
  document.getElementById('oaSignup').addEventListener('click',()=>authLogin(true));
  document.getElementById('oaForgot').addEventListener('click',requestPasswordReset);
  document.getElementById('oaSetPassword').addEventListener('click',updateRecoveredPassword);
  status.addEventListener('click',()=>{if(!O.session?.access_token)return;const who=O.user?.email||'الحساب الحالي';const buffet=O.buffetName?`
${O.buffetName}`:'';if(confirm(`${who}${buffet}

تسجيل الخروج؟`))logoutOnline();});
}
function authMsg(t,kind=''){const e=document.getElementById('oaMsg');if(e){e.textContent=t;e.className='oa-msg '+kind;}}
function syncAccessButtons(){
  const b=document.getElementById('onlineLogoutBtn'),w=document.getElementById('onlineWorkerBtn');
  const auth=document.getElementById('onlineAuth'),authVisible=!!auth?.classList.contains('show'),logged=!!O.session?.access_token&&!authVisible;
  if(b)b.style.display=logged?'inline-flex':'none';
  if(w)w.style.display=logged&&O.accessMode==='owner'?'inline-flex':'none';
}
function showAuth(show=true){
  const e=document.getElementById('onlineAuth');if(e)e.classList.toggle('show',show);
  syncAccessButtons();
}
function workerMsg(t,kind=''){const e=document.getElementById('workerMsg');if(e){e.textContent=t||'';e.className='oa-msg '+kind;}}
function closeWorkerModal(){document.getElementById('workerModal')?.classList.remove('show');workerMsg('');}
async function openWorkerModal(){
  if(O.accessMode!=='owner'||!O.buffetId)return;
  document.getElementById('workerModal')?.classList.add('show');await refreshWorkerList();
}
async function refreshWorkerList(){
  const rowsEl=document.getElementById('workerRows');if(!rowsEl)return;
  workerMsg('جاري تحميل الموظفين...');
  try{
    const rows=await api('/rest/v1/rpc/list_buffet_workers_v1',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId})});
    rowsEl.innerHTML=(Array.isArray(rows)?rows:[]).map(x=>`<div class="worker-row"><div><div class="worker-email">${String(x.email||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</div><div class="worker-note" style="margin:3px 0 0">${x.enabled?(x.claimed?'مفعّل والحساب مرتبط':'مفعّل — في انتظار تسجيل الموظف'):'متوقف'}</div></div><div class="worker-actions"><button type="button" class="oa-btn ${x.enabled?'oa-secondary':'oa-primary'} worker-toggle" data-email="${encodeURIComponent(x.email||'')}" data-enable="${x.enabled?'0':'1'}">${x.enabled?'إيقاف':'تفعيل'}</button></div></div>`).join('')||'<div class="worker-note">لا يوجد موظف مضاف حتى الآن.</div>';
    rowsEl.querySelectorAll('.worker-toggle').forEach(btn=>btn.addEventListener('click',()=>setWorkerEnabled(decodeURIComponent(btn.dataset.email||''),btn.dataset.enable==='1')));
    workerMsg('');
  }catch(e){workerMsg(workerErrorText(e),'err');}
}
function workerErrorText(e){const m=String(e?.message||e||'');if(m.includes('WORKER_OWNS_BUFFET'))return 'الحساب ده عنده بوفيه مستقل بالفعل، فلا يمكن ربطه كموظف.';if(m.includes('WORKER_EMAIL_ALREADY_ASSIGNED')||m.includes('WORKER_ALREADY_ASSIGNED'))return 'البريد ده مرتبط ببوفيه آخر بالفعل.';if(m.includes('OWNER_EMAIL_NOT_ALLOWED'))return 'لا يمكن إضافة بريد صاحب البوفيه كموظف.';if(m.includes('INVALID_EMAIL'))return 'اكتب بريد إلكتروني صحيح.';return m||'تعذر تنفيذ العملية.';}
async function setWorkerEnabled(email,enabled){
  if(!email||O.accessMode!=='owner')return;
  workerMsg(enabled?'جاري التفعيل...':'جاري الإيقاف...');
  try{await api('/rest/v1/rpc/set_buffet_worker_v1',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_email:email,p_enabled:!!enabled})});await refreshWorkerList();workerMsg(enabled?'تم تفعيل الموظف.':'تم إيقاف الموظف.','ok');}catch(e){workerMsg(workerErrorText(e),'err');}
}
async function addOrEnableWorker(){
  const input=document.getElementById('workerEmailInput'),email=String(input?.value||'').trim();if(!email)return workerMsg('اكتب بريد الموظف.','err');
  await setWorkerEnabled(email,true);if(document.getElementById('workerMsg')?.classList.contains('ok')&&input)input.value='';
}
function journalRead(){try{const x=JSON.parse(localStorage.getItem(CFG.journalKey)||'[]');return Array.isArray(x)?x:[]}catch(e){return []}}
function journalWrite(rows){try{if(rows?.length)localStorage.setItem(CFG.journalKey,JSON.stringify(rows));else localStorage.removeItem(CFG.journalKey)}catch(e){console.error('sync journal',e)}}
function journalAddMany(rows){if(!rows?.length)return;const m=new Map(journalRead().map(x=>[x.eventId,x]));for(const x of rows)m.set(x.eventId,x);journalWrite([...m.values()]);}
function journalRemove(id){const a=journalRead(),b=a.filter(x=>x.eventId!==id);if(b.length!==a.length)journalWrite(b);}
async function recoverJournal(){const rows=journalRead();if(!rows.length)return;for(const x of rows)await qPut(x);journalWrite([]);}
async function queueCount(){const j=journalRead().filter(x=>x.buffetId===O.buffetId).length;try{const db=await openDB();const k=await new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readonly'),r=tx.objectStore(CFG.store).getAll();r.onsuccess=()=>res((r.result||[]).filter(x=>x.buffetId===O.buffetId).length);r.onerror=()=>rej(r.error);});return Math.max(j,k)}catch(e){return j}}
async function setStatus(mode,text){const e=document.getElementById('onlineStatus'),t=document.getElementById('onlineStatusText');if(!e||!t)return;e.className='show '+mode;t.textContent=text;}
async function refreshStatus(){const n=await queueCount();if(!navigator.onLine)return setStatus('offline',n?`بدون إنترنت · ${n} بانتظار المزامنة`:'بدون إنترنت');if(O.syncing)return setStatus('syncing',n?`مزامنة · ${n} عملية`:'جاري المزامنة');return setStatus('',n?`متصل · ${n} بانتظار المزامنة`:'متصل');}

function saveSession(s){O.session=s||null;O.user=s?.user||null;if(s)localStorage.setItem(CFG.sessionKey,JSON.stringify(s));else localStorage.removeItem(CFG.sessionKey);}
function loadSession(){try{const x=JSON.parse(localStorage.getItem(CFG.sessionKey)||'null');if(x)saveSession(x);}catch(e){}}
function sessionExpiry(s){if(!s)return 0;if(s.expires_at)return Number(s.expires_at)*1000;if(s.expires_in)return Date.now()+Number(s.expires_in)*1000;return 0;}
async function authRequest(path,body){
  const r=await fetch(CFG.url+path,{method:'POST',headers:{'Content-Type':'application/json','apikey':CFG.key},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.msg||j.message||j.error_description||j.error||'تعذر الاتصال');return j;
}
function isInvalidRefreshError(e){
  const m=String(e?.message||e||'').toLowerCase();
  return m.includes('invalid refresh token')||m.includes('refresh token not found')||m.includes('refresh_token_not_found')||m.includes('invalid refresh');
}
function expireLocalSession(message='انتهت جلسة الدخول. سجّل الدخول مرة أخرى.'){
  try{persistBuffetCache();}catch(e){}
  clearInterval(O.pollTimer);O.pollTimer=null;
  saveSession(null);O.ready=false;O.buffetId=null;O.buffetName=null;O.accessMode=null;applyAccessUI();
  showAuth(true);authMsg(message,'err');
}
async function refreshToken(){
  if(!O.session?.refresh_token){expireLocalSession();throw new Error('SESSION_EXPIRED');}
  try{const j=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:O.session.refresh_token});saveSession(j);return j.access_token;}
  catch(e){if(isInvalidRefreshError(e)){expireLocalSession();throw new Error('SESSION_EXPIRED');}throw e;}
}
async function accessToken(){
  if(!O.session?.access_token)return null;
  const exp=sessionExpiry(O.session);
  if(exp&&exp-Date.now()<90000&&navigator.onLine){try{return await refreshToken();}catch(e){if(e?.message==='SESSION_EXPIRED')return null;}}
  return O.session?.access_token||null;
}
function recoveryReturnUrl(){
  return new URL('./',location.href).href;
}
function recoverySessionFromUrl(){
  try{
    const h=new URLSearchParams((location.hash||'').replace(/^#/,''));
    if(h.get('type')!=='recovery'||!h.get('access_token'))return null;
    const expiresIn=Number(h.get('expires_in')||3600);
    const session={
      access_token:h.get('access_token'),
      refresh_token:h.get('refresh_token')||'',
      token_type:h.get('token_type')||'bearer',
      expires_in:expiresIn,
      expires_at:Math.floor(Date.now()/1000)+expiresIn,
      user:null
    };
    history.replaceState(null,'',location.pathname+'?recovery=1');
    return session;
  }catch(e){return null;}
}
function isRecoveryPage(){
  try{return new URLSearchParams(location.search||'').get('recovery')==='1';}catch(e){return false;}
}
function showRecoveryPanel(){
  const l=document.getElementById('oaLoginPanel'),r=document.getElementById('oaRecoveryPanel');
  if(l)l.style.display='none';if(r)r.style.display='block';
  showAuth(true);authMsg('اختار كلمة مرور جديدة للحساب.','');
}
async function requestPasswordReset(){
  const email=document.getElementById('oaEmail')?.value.trim()||'';
  if(!email)return authMsg('اكتب البريد الإلكتروني الأول، وبعدها اضغط نسيت كلمة المرور.','err');
  authMsg('جاري إرسال رابط استعادة كلمة المرور...');
  try{
    const r=await fetch(CFG.url+'/auth/v1/recover?redirect_to='+encodeURIComponent(recoveryReturnUrl()),{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':CFG.key},
      body:JSON.stringify({email})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.msg||j.message||j.error_description||j.error||'تعذر إرسال رسالة الاستعادة');
    authMsg('تم إرسال رابط استعادة كلمة المرور إلى بريدك. افتحه من المتصفح واختار كلمة مرور جديدة.','ok');
  }catch(e){authMsg(e.message||'تعذر إرسال رسالة الاستعادة.','err');}
}
async function updateRecoveredPassword(){
  const p1=document.getElementById('oaNewPass')?.value||'',p2=document.getElementById('oaNewPass2')?.value||'';
  if(p1.length<6)return authMsg('كلمة المرور لازم تكون 6 حروف على الأقل.','err');
  if(p1!==p2)return authMsg('كلمتا المرور غير متطابقتين.','err');
  if(!O.session?.access_token)return authMsg('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابط جديد.','err');
  authMsg('جاري حفظ كلمة المرور الجديدة...');
  try{
    const r=await fetch(CFG.url+'/auth/v1/user',{
      method:'PUT',
      headers:{'Content-Type':'application/json','apikey':CFG.key,'Authorization':'Bearer '+O.session.access_token},
      body:JSON.stringify({password:p1})
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.msg||j.message||j.error_description||j.error||'تعذر تغيير كلمة المرور');
    O.user=j;O.session.user=j;saveSession(O.session);
    try{history.replaceState(null,'',location.pathname);}catch(e){}
    const rp=document.getElementById('oaRecoveryPanel');if(rp)rp.style.display='none';
    authMsg('تم تغيير كلمة المرور بنجاح.','ok');
    await afterAuth();
  }catch(e){authMsg(e.message||'تعذر تغيير كلمة المرور.','err');}
}
async function authLogin(signup){
  const email=document.getElementById('oaEmail')?.value.trim(),password=document.getElementById('oaPass')?.value||'';
  if(!email||password.length<6)return authMsg('اكتب البريد وكلمة مرور لا تقل عن 6 حروف.','err');
  authMsg(signup?'جاري إنشاء الحساب...':'جاري تسجيل الدخول...');
  try{
    let j;
    if(signup){
      j=await authRequest('/auth/v1/signup',{email,password});
      if(!j.access_token){
        authMsg('تم إنشاء الحساب، لكن تأكيد البريد ما زال مفعّلًا في Supabase. عطّل Confirm email ثم جرّب بحساب جديد.','err');
        return;
      }
    }else j=await authRequest('/auth/v1/token?grant_type=password',{email,password});
    saveSession(j);
    if(signup)authMsg('تم إنشاء الحساب وتسجيل الدخول.','ok');
    await afterAuth();
  }catch(e){authMsg(e.message||'تعذر تسجيل الدخول','err');}
}
async function api(path,opt={}){
  const token=await accessToken();if(!token){const err=new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');err.status=401;throw err;}
  const headers=Object.assign({'apikey':CFG.key,'Authorization':'Bearer '+token,'Content-Type':'application/json'},opt.headers||{});const r=await fetch(CFG.url+path,Object.assign({},opt,{headers}));
  if(r.status===401&&!opt._retried){
    if(O.session?.refresh_token){
      try{await refreshToken();return api(path,Object.assign({},opt,{_retried:true}));}
      catch(e){if(e?.message!=='SESSION_EXPIRED')throw e;}
    }else expireLocalSession();
    const err=new Error('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.');err.status=401;throw err;
  }
  if(!r.ok){const j=await r.json().catch(()=>({}));const err=new Error(j.message||j.error||j.code||('HTTP '+r.status));err.status=r.status;throw err;}if(r.status===204)return null;const txt=await r.text();return txt?JSON.parse(txt):null;
}
function installAccessGuards(){
  if(window.__buffetWorkerAccessGuards)return;window.__buffetWorkerAccessGuards=true;
  if(window.show){const orig=window.show;window.__ownerShow=orig;window.show=function(id,b){
    if(O.accessMode==='worker'&&!new Set(['officers','paymentsPage','sale','officerDetail']).has(String(id||'')))return orig('officers',document.querySelector('#nav button[data-page="officers"]'));
    return orig.apply(this,arguments);
  };}
  if(window.closeMonth){const orig=window.closeMonth;window.closeMonth=function(){if(O.accessMode==='worker')return alert('إغلاق الشهر متاح لصاحب البوفيه فقط.');return orig.apply(this,arguments);};}
  if(window.newMonth){const orig=window.newMonth;window.newMonth=function(){if(O.accessMode==='worker')return alert('بدء شهر جديد متاح لصاحب البوفيه فقط.');return orig.apply(this,arguments);};}
  if(window.editOfficer){const orig=window.editOfficer;window.editOfficer=async function(oldName){
    if(O.accessMode!=='worker')return orig.apply(this,arguments);
    const newName=prompt('تعديل اسم الضابط',oldName);if(newName===null)return;const n=String(newName||'').trim();
    if(!n)return alert('اكتب اسم الضابط');if(n===oldName)return;if((window.S?.people||[]).includes(n))return alert('الاسم موجود بالفعل');
    if(!navigator.onLine)return alert('تعديل اسم الضابط للموظف يحتاج اتصال بالإنترنت.');
    try{
      await O.queuePromise;await syncPending();if((await queueCount())>0)return alert('انتظر اكتمال المزامنة ثم جرّب تعديل الاسم مرة أخرى.');
      await api('/rest/v1/rpc/worker_rename_officer_v1',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_old_name:oldName,p_new_name:n,p_device_id:O.deviceId})});
      await pullCloud();alert('تم تعديل اسم الضابط.');
    }catch(e){const m=String(e?.message||e||'');if(m.includes('OFFICER_ALREADY_EXISTS'))return alert('الاسم موجود بالفعل');alert('تعذر تعديل الاسم: '+m);}
  };}
}
function applyAccessUI(){
  installAccessGuards();const worker=O.accessMode==='worker';
  document.querySelectorAll('#nav button[data-page]').forEach(btn=>{const page=btn.dataset.page;btn.style.display=!worker||page==='officers'||page==='paymentsPage'?'flex':'none';});
  document.querySelectorAll('button[onclick]').forEach(btn=>{const a=String(btn.getAttribute('onclick')||'');if(a.includes('newMonth()'))btn.style.display=worker?'none':'';});
  if(worker){
    const active=document.querySelector('main section.active')?.id;if(active&&!new Set(['officers','paymentsPage','sale','officerDetail']).has(active))window.show?.('officers');
  }
  syncAccessButtons();
}

async function loadBuffetAccess(){
  if(!O.user?.id)return null;
  try{
    const rows=await api('/rest/v1/rpc/resolve_my_buffet_access_v1',{method:'POST',body:'{}'});
    const m=(Array.isArray(rows)?rows[0]:rows)||null;
    return m?.buffet_id?{...m,user_id:O.user.id,access_mode:m.access_mode==='worker'?'worker':'owner',is_primary:m.access_mode!=='worker'}:null;
  }catch(e){
    // Backward-compatible owner fallback while deploying V9.3 database changes.
    const rows=await api('/rest/v1/rpc/list_my_buffets_v2',{method:'POST',body:'{}'});
    const m=(Array.isArray(rows)?rows:[]).find(x=>x.is_primary===true)||null;
    if(m)return {...m,user_id:O.user.id,access_mode:'owner',is_primary:true};
    if(String(e?.message||'').includes('Could not find the function'))return null;
    throw e;
  }
}
async function activateBuffetAccess(m){
  if(!rememberBuffetAccess(m))return null;
  restoreBuffetCache(O.buffetId);showAuth(false);applyAccessUI();O.ready=false;
  if(!navigator.onLine){O.ready=true;clearOperationalAutofill();await refreshStatus();return m;}
  await pullCloud();persistBuffetCache();O.ready=true;O.lastServerEventAt=await latestEventAt();clearOperationalAutofill();await touchDevice();await refreshStatus();scheduleSync(100);
  clearInterval(O.pollTimer);O.pollTimer=setInterval(poll,CFG.pollMs);
  return m;
}

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(CFG.dbName,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(CFG.store))db.createObjectStore(CFG.store,{keyPath:'eventId'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function qPut(op){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readwrite');tx.objectStore(CFG.store).put(op);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function qAll(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readonly'),r=tx.objectStore(CFG.store).getAll();r.onsuccess=()=>res((r.result||[]).filter(x=>x.buffetId===O.buffetId).sort((a,b)=>Number(a.order||0)-Number(b.order||0)||(a.createdAt||'').localeCompare(b.createdAt||'')));r.onerror=()=>rej(r.error);});}
async function qDel(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readwrite');tx.objectStore(CFG.store).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function qClear(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readwrite'),store=tx.objectStore(CFG.store),r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;if(c.value?.buffetId===O.buffetId)c.delete();c.continue();};tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
let __qSeq=0;function op(kind,table,id,row,extra={}){return {eventId:uid('EVT'),buffetId:O.buffetId,kind,table,id,row,createdAt:nowIso(),order:(Date.now()*1000)+(++__qSeq%1000),epoch:Number(O.dataEpoch||1),periodEpoch:Number(O.periodEpoch||1),...extra};}
function jEq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function arrMap(arr,idf){const m=new Map();for(const x of arr||[]){const id=idf(x);if(id!=null)m.set(String(id),x);}return m;}
function productMeta(p){const x=clone(p||{});delete x.qty;delete x.buy;return x;}
function archiveNow(){try{const key=window.ARCHIVE_KEY||'buffet_v9_online_archive',a=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(a))return [];let changed=false;for(const x of a){if(x&&typeof x==='object'&&!x._cloudId){x._cloudId=uid('ARC');changed=true;}}if(changed)localStorage.setItem(key,JSON.stringify(a));return a}catch(e){return []}}
function rowFor(table,x){
  const b=O.buffetId,raw=clone(x);
  if(table==='officers')return {buffet_id:b,id:String(x),name:String(x),payload:{name:String(x)}};
  if(table==='categories')return {buffet_id:b,id:String(x),name:String(x),payload:{name:String(x)}};
  if(table==='suppliers')return {buffet_id:b,id:String(x),name:String(x),payload:{name:String(x)}};
  if(table==='expense_types')return {buffet_id:b,id:String(x),name:String(x),payload:{name:String(x)}};
  if(table==='products')return {buffet_id:b,id:x._id,name:x.name||'',category_name:x.cat||null,unit:x.unit||'قطعة',sell_price:Number(x.sell||0),min_qty:Number(x.min||0),payload:productMeta(raw)};
  if(table==='recipes')return {buffet_id:b,id:x._id,name:x.name||'',category_name:x.cat||null,sell_price:Number(x.price||0),cached_cost:Number(x.cost||0),ingredients:x.ins||[],payload:raw};
  if(table==='sales')return {buffet_id:b,id:x.id,officer_name:x.who||null,product_name:x.product||'',qty:Number(x.qty||1),total:Number(x.total||0),cost:Number(x.cost||0),sale_type:x.type||'بيع',is_cash:!!x.cash,recipe_ingredients:x.recipeIns||null,is_returned:!!x.returned,business_date:dateKey(x.date),client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='payments')return {buffet_id:b,id:x.id,officer_name:x.who||'',amount:Number(x.amount||0),business_date:dateKey(x.date),client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='purchases')return {buffet_id:b,id:x._id,supplier:x.sup||null,product_name:x.p||'',qty:Number(x.q||0),unit:x.unit||null,total:Number(x.total||0),unit_price:Number(x.unitPrice||0),business_date:dateKey(x.date),client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='expenses')return {buffet_id:b,id:x._id,expense_type:x.t||'عام',note:x.n||null,amount:Number(x.a||0),non_cash:!!x.nonCash,source:x.source||null,source_ref:x.ref||null,hospitality_id:x.hospitalityId||null,business_date:dateKey(x.date),client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='hospitality')return {buffet_id:b,id:x.id,period:x.period||null,items:x.items||[],total:Number(x.total||0),cost:Number(x.cost||0),status:x.status||'pending',status_at:x.statusDate||null,business_date:dateKey(x.date),client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='cash_movements')return {buffet_id:b,id:x._id,movement_type:x.type||'',amount:Number(x.amount||0),note:x.note||null,ref:x.ref||null,client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='audit_logs')return {buffet_id:b,id:x._id,action:x.action||'',detail:x.detail||null,client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  if(table==='account_ledger_entries')return {buffet_id:b,id:x.id,entry_type:x.type||'',officer_name:x.who||'',amount:Number(x.amount||0),product_name:x.product||null,qty:x.qty==null?null:Number(x.qty),date_text:x.date||null,sale_id:x.saleId||null,payment_id:x.paymentId||null,returned:!!x.returned,client_seq:x.seq==null?null:Number(x.seq),client_created_at:x.createdAt||null,device_id:O.deviceId,payload:raw};
  return null;
}
const defs=[
  {key:'people',table:'officers',get:s=>s.people||[],id:x=>String(x),cmp:x=>x},
  {key:'cats',table:'categories',get:s=>s.cats||[],id:x=>String(x),cmp:x=>x},
  {key:'suppliers',table:'suppliers',get:s=>(s.suppliers||[]).filter(x=>String(x||'').trim()),id:x=>String(x),cmp:x=>x},
  {key:'expenseTypes',table:'expense_types',get:s=>s.expenseTypes||[],id:x=>String(x),cmp:x=>x},
  {key:'products',table:'products',get:s=>s.products||[],id:x=>x._id,cmp:productMeta},
  {key:'recipes',table:'recipes',get:s=>s.recipes||[],id:x=>x._id,cmp:x=>x},
  {key:'sales',table:'sales',get:s=>s.sales||[],id:x=>x.id,cmp:x=>x},
  {key:'payments',table:'payments',get:s=>s.payments||[],id:x=>x.id,cmp:x=>x},
  {key:'purchases',table:'purchases',get:s=>s.purchases||[],id:x=>x._id,cmp:x=>x},
  {key:'expenses',table:'expenses',get:s=>s.expenses||[],id:x=>x._id,cmp:x=>x},
  {key:'hospitality',table:'hospitality',get:s=>s.hospitality||[],id:x=>x.id,cmp:x=>x},
  {key:'cash',table:'cash_movements',get:s=>s.cash?.movements||[],id:x=>x._id,cmp:x=>x},
  {key:'audit',table:'audit_logs',get:s=>s.audit||[],id:x=>x._id,cmp:x=>x,appendOnly:true},
  {key:'ledger',table:'account_ledger_entries',get:s=>s.accountLedger||[],id:x=>x.id,cmp:x=>x}
];
function settingsPayload(s){return {openingDue:clone(s.openingDue||{}),cashOpening:Number(s.cash?.opening||0),accountLedgerVersion:Number(s.accountLedgerVersion||1)};}
async function diffAndQueue(prev,cur,prevArchive,curArchive){
  ensureIds(cur);ensureIds(prev);
  const pending=[];
  const activeDefs=O.accessMode==='worker'?defs.filter(d=>['people','sales','payments','hospitality','audit','ledger'].includes(d.key)):defs;
  for(const d of activeDefs){
    const a=arrMap(d.get(prev),d.id),b=arrMap(d.get(cur),d.id);
    for(const [id,x] of b){
      const old=a.get(id);
      if(!old)pending.push(op('insert',d.table,id,rowFor(d.table,x)));
      else if(!d.appendOnly&&!jEq(d.cmp(old),d.cmp(x)))pending.push(op('update',d.table,id,rowFor(d.table,x)));
    }
    if(!d.appendOnly)for(const [id] of a)if(!b.has(id))pending.push(op('delete',d.table,id,null));
  }
  const ap=arrMap(prev.products||[],x=>x._id),bp=arrMap(cur.products||[],x=>x._id);
  for(const [id,p] of bp){const old=ap.get(id);const oldQty=Number(old?.qty||0),newQty=Number(p.qty||0),delta=newQty-oldQty;const oldValue=oldQty*Number(old?.buy||0),newValue=newQty*Number(p.buy||0),valueDelta=newValue-oldValue;if(Math.abs(delta)>1e-9||Math.abs(valueDelta)>1e-7)pending.push(op('inventory_delta_v2','products',id,null,{delta,valueDelta}));}
  if(O.accessMode!=='worker'){
    if(!jEq(settingsPayload(prev),settingsPayload(cur)))pending.push(op('settings','buffet_settings',O.buffetId,settingsPayload(cur)));
    const aa=arrMap(prevArchive||[],x=>x._cloudId||x.id||x.month||''),bb=arrMap(curArchive||[],x=>x._cloudId||x.id||x.month||'');
    for(const [id,x] of bb)if((id&&!aa.has(id))||(id&&!jEq(aa.get(id),x)))pending.push(op('archive_upsert','month_archives',id,x));
    for(const [id] of aa)if(id&&!bb.has(id))pending.push(op('delete','month_archives',id,null));
  }
  if(!pending.length)return;
  journalAddMany(pending);
  for(const x of pending){await qPut(x);journalRemove(x.eventId);}
  refreshStatus();if(navigator.onLine)scheduleSync(80);
}
window.onlineAfterLocalSave=function(state){
  try{ensureIds(state);localStorage.setItem(window.DATA_KEY||'buffet_v9_online_state',JSON.stringify(state));if(O.buffetId){localStorage.setItem(dataKeyFor(O.buffetId),JSON.stringify(state));persistBuffetCache();}}catch(e){}
  if(!O.ready||O.suppress){O.lastState=clone(state);O.lastArchive=archiveNow();return;}
  const prev=O.lastState?clone(O.lastState):clone(state),cur=clone(state),prevArchive=clone(O.lastArchive||[]),curArchive=archiveNow();O.lastState=clone(cur);O.lastArchive=clone(curArchive);
  O.queuePromise=O.queuePromise.then(()=>diffAndQueue(prev,cur,prevArchive,curArchive)).catch(e=>{console.error('queue diff',e);setStatus('error','تعذر تجهيز المزامنة · البيانات محفوظة محليًا');});
};

async function upsertRows(table,rows,onConflict='buffet_id,id'){
  if(!rows.length)return;
  for(let i=0;i<rows.length;i+=150){const chunk=rows.slice(i,i+150);await api('/rest/v1/'+table+'?on_conflict='+encodeURIComponent(onConflict),{method:'POST',headers:{'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(chunk)});}
}
async function insertRowsIgnore(table,rows,onConflict='buffet_id,id'){
  if(!rows.length)return;
  for(let i=0;i<rows.length;i+=150){const chunk=rows.slice(i,i+150);await api('/rest/v1/'+table+'?on_conflict='+encodeURIComponent(onConflict),{method:'POST',headers:{'Prefer':'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(chunk)});}
}
async function updateRow(table,id,row){
  const patch=clone(row||{});delete patch.buffet_id;delete patch.id;
  await api('/rest/v1/'+table+'?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify(patch)});
}
async function recordEvent(x){
  const row={buffet_id:O.buffetId,client_event_id:x.eventId,device_id:O.deviceId,event_type:x.kind,entity_type:x.table,entity_id:x.id,payload:{},client_created_at:x.createdAt};
  await api('/rest/v1/sync_events?on_conflict=buffet_id,client_event_id',{method:'POST',headers:{'Prefer':'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(row)});
}
async function processOp(x){
  if(!x||!O.buffetId||x.buffetId!==O.buffetId)throw new Error('TENANT_QUEUE_MISMATCH');
  if(x.kind==='inventory_delta_v2'){
    await api('/rest/v1/rpc/apply_inventory_delta_v2',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_event_id:x.eventId,p_device_id:O.deviceId,p_product_id:x.id,p_qty_delta:Number(x.delta||0),p_value_delta:Number(x.valueDelta||0),p_client_created_at:x.createdAt})});return;
  }
  if(x.kind==='settings'){
    const p=x.row||{};const row={buffet_id:O.buffetId,opening_due:p.openingDue||{},cash_opening:Number(p.cashOpening||0),account_ledger_version:Number(p.accountLedgerVersion||1),payload:p};
    await upsertRows('buffet_settings',[row],'buffet_id');await recordEvent(x);return;
  }
  if(x.kind==='archive_upsert'){
    const raw=clone(x.row);if(!raw._cloudId)raw._cloudId=x.id;const row={buffet_id:O.buffetId,id:String(x.id),month_key:String(raw.month||x.id),payload:raw};await upsertRows('month_archives',[row]);await recordEvent(x);return;
  }
  if(x.kind==='insert'){await insertRowsIgnore(x.table,[x.row]);await recordEvent(x);return;}
  if(x.kind==='update'){await updateRow(x.table,x.id,x.row);await recordEvent(x);return;}
  if(x.kind==='upsert'){await upsertRows(x.table,[x.row]);await recordEvent(x);return;}
  if(x.kind==='delete'){
    const key=x.table==='buffet_settings'?'buffet_id':'id';let path='/rest/v1/'+x.table+'?buffet_id=eq.'+encodeURIComponent(O.buffetId);if(key==='id')path+='&id=eq.'+encodeURIComponent(x.id);await api(path,{method:'DELETE',headers:{'Prefer':'return=minimal'}});await recordEvent(x);return;
  }
}
let syncTimer=null;function scheduleSync(ms=400){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncPending().catch(console.error),ms);}
async function syncPending(){
  if(O.syncing||!O.ready||!navigator.onLine||!O.session||!O.buffetId)return;
  O.syncing=true;await refreshStatus();
  try{
    const epochs=await serverEpochs(),serverEpoch=epochs.data,serverPeriod=epochs.period;
    if(Number(serverEpoch)!==Number(O.dataEpoch||1)){
      await qClear();O.dataEpoch=serverEpoch;O.periodEpoch=serverPeriod;localStorage.setItem(epochKeyFor(O.buffetId),String(serverEpoch));localStorage.setItem(periodKeyFor(O.buffetId),String(serverPeriod));await pullCloud();await setStatus('','تم تحديث البيانات بعد إعادة الضبط');return;
    }
    const ops=await qAll();
    if(Number(serverPeriod)!==Number(O.periodEpoch||1)){
      if(ops.length){await setStatus('error',`في ${ops.length} عملية من فترة مقفولة تحتاج مراجعة`);return;}
      O.periodEpoch=serverPeriod;localStorage.setItem(periodKeyFor(O.buffetId),String(serverPeriod));await pullCloud();return;
    }
    for(const x of ops){if(Number(x.epoch||1)!==Number(serverEpoch)){await qDel(x.eventId);continue;}if(Number(x.periodEpoch||1)!==Number(serverPeriod)){await setStatus('error','في عمليات من فترة مقفولة تحتاج مراجعة');return;}await processOp(x);await qDel(x.eventId);}await touchDevice();await pullCloud();
  }catch(e){console.error('sync',e);if(e?.status===401){O.ready=false;showAuth(true);authMsg('انتهت جلسة الدخول. سجّل الدخول مرة أخرى، والعمليات المعلقة محفوظة.','err');}setStatus('error','تعذر المزامنة · البيانات محفوظة على الجهاز');}
  finally{O.syncing=false;await refreshStatus();}
}

async function fetchAll(table,select='*'){
  const out=[];for(let from=0;;from+=1000){const to=from+999;const rows=await api('/rest/v1/'+table+'?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select='+encodeURIComponent(select),{headers:{'Range':`${from}-${to}`,'Range-Unit':'items'}});if(Array.isArray(rows))out.push(...rows);if(!rows||rows.length<1000)break;}return out;
}
async function serverEpochs(){
  if(O.accessMode==='worker'){
    const r=await api('/rest/v1/rpc/worker_epochs_v1',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId})});
    const x=Array.isArray(r)?r[0]:r;return {data:Number(x?.data||1),period:Number(x?.period||1)};
  }
  const r=await api('/rest/v1/buffet_settings?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=data_epoch,period_epoch&limit=1');return {data:Number(r?.[0]?.data_epoch||1),period:Number(r?.[0]?.period_epoch||1)};
}
async function fetchRecentAudit(){
  return await api('/rest/v1/audit_logs?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=id,payload,action,detail,client_created_at,server_created_at&order=server_created_at.desc&limit=500');
}
async function pullWorkerCloud(){
  if(!window.S||!O.buffetId)return;
  const r=await api('/rest/v1/rpc/worker_state_v1',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId})});
  const x=(Array.isArray(r)?r[0]:r)||{};
  O.dataEpoch=Number(x.dataEpoch||1);O.periodEpoch=Number(x.periodEpoch||1);localStorage.setItem(epochKeyFor(O.buffetId),String(O.dataEpoch));localStorage.setItem(periodKeyFor(O.buffetId),String(O.periodEpoch));
  const fresh={
    cash:{opening:0,movements:[]},openingDue:clone(x.openingDue||{}),cats:Array.isArray(x.cats)?x.cats:[],people:Array.isArray(x.people)?x.people:[],suppliers:[''],expenseTypes:[],
    products:Array.isArray(x.products)?x.products:[],recipes:Array.isArray(x.recipes)?x.recipes:[],sales:Array.isArray(x.sales)?x.sales:[],payments:Array.isArray(x.payments)?x.payments:[],
    purchases:[],expenses:[],hospitality:[],audit:[],accountLedger:Array.isArray(x.accountLedger)?x.accountLedger:[],accountLedgerVersion:Number(x.accountLedgerVersion||1)
  };
  ensureIds(fresh);
  O.suppress=true;try{
    Object.keys(window.S).forEach(k=>delete window.S[k]);Object.assign(window.S,fresh);window.normalizeState?.();
    localStorage.setItem(window.DATA_KEY||'buffet_v9_online_state',JSON.stringify(window.S));localStorage.setItem(window.ARCHIVE_KEY||'buffet_v9_online_archive','[]');
    O.lastState=clone(window.S);O.lastArchive=[];persistBuffetCache();window.render?.();applyAccessUI();
  }finally{O.suppress=false;}
}
async function pullCloud(){
  if(!window.S||!O.buffetId)return;
  if(O.accessMode==='worker')return pullWorkerCloud();
  const [off,cats,sups,etypes,prods,recs,sales,pays,purs,exps,hosp,cash,ledger,settings,archives,audits]=await Promise.all([
    fetchAll('officers','name,payload'),fetchAll('categories','name,payload'),fetchAll('suppliers','name,payload'),fetchAll('expense_types','name,payload'),fetchAll('products','id,name,category_name,unit,buy_price,sell_price,min_qty,stock_qty,stock_value,payload'),fetchAll('recipes','id,payload'),fetchAll('sales','id,payload'),fetchAll('payments','id,payload'),fetchAll('purchases','id,payload'),fetchAll('expenses','id,payload'),fetchAll('hospitality','id,payload'),fetchAll('cash_movements','id,payload'),fetchAll('account_ledger_entries','id,client_seq,client_created_at,server_created_at,payload'),fetchAll('buffet_settings','opening_due,cash_opening,suppliers,expense_types,account_ledger_version,data_epoch,period_epoch,payload'),fetchAll('month_archives','id,month_key,payload'),fetchRecentAudit()
  ]);
  const set=settings[0]||{};O.dataEpoch=Number(set.data_epoch||O.dataEpoch||1);O.periodEpoch=Number(set.period_epoch||O.periodEpoch||1);localStorage.setItem(epochKeyFor(O.buffetId),String(O.dataEpoch));localStorage.setItem(periodKeyFor(O.buffetId),String(O.periodEpoch));
  const fresh={
    cash:{opening:Number(set.cash_opening??set.payload?.cashOpening??0),movements:cash.map(r=>Object.assign({},r.payload||{},{_id:r.id}))},
    openingDue:clone(set.opening_due||set.payload?.openingDue||{}),
    cats:cats.map(r=>r.name),people:off.map(r=>r.name),suppliers:sups.length?sups.map(r=>r.name):[''],
    expenseTypes:etypes.length?etypes.map(r=>r.name):['كهرباء','مياه','صيانة','نقل','ضيافة على البوفيه','أخرى'],
    products:prods.map(r=>Object.assign({},r.payload||{},{_id:r.id,name:r.name,cat:r.category_name||r.payload?.cat||'',unit:r.unit||r.payload?.unit||'قطعة',buy:Number(r.buy_price||0),sell:Number(r.sell_price||0),min:Number(r.min_qty||0),qty:Number(r.stock_qty||0)})),
    recipes:recs.map(r=>Object.assign({},r.payload||{},{_id:r.id})),sales:sales.map(r=>Object.assign({},r.payload||{},{id:r.id})),payments:pays.map(r=>Object.assign({},r.payload||{},{id:r.id})),purchases:purs.map(r=>Object.assign({},r.payload||{},{_id:r.id})),expenses:exps.map(r=>Object.assign({},r.payload||{},{_id:r.id})),hospitality:hosp.map(r=>Object.assign({},r.payload||{},{id:r.id})),audit:Array.isArray(audits)?audits.slice().reverse().map(r=>Object.assign({},r.payload||{},{_id:r.id,action:r.action,detail:r.detail,createdAt:r.client_created_at||r.server_created_at})):clone(window.S.audit||[]),
    accountLedger:ledger.sort((a,b)=>String(a.client_created_at||a.server_created_at||'').localeCompare(String(b.client_created_at||b.server_created_at||''))||Number(a.client_seq||0)-Number(b.client_seq||0)).map(r=>Object.assign({},r.payload||{},{id:r.id})),accountLedgerVersion:Number(set.account_ledger_version||1)
  };
  ensureIds(fresh);
  O.suppress=true;try{Object.keys(window.S).forEach(k=>delete window.S[k]);Object.assign(window.S,fresh);window.normalizeState?.();localStorage.setItem(window.DATA_KEY||'buffet_v9_online_state',JSON.stringify(window.S));const ar=archives.map(r=>Object.assign({},r.payload||{},{_cloudId:r.id}));localStorage.setItem(window.ARCHIVE_KEY||'buffet_v9_online_archive',JSON.stringify(ar));O.lastState=clone(window.S);O.lastArchive=clone(ar);persistBuffetCache();window.render?.();}finally{O.suppress=false;}
}
async function latestEventAt(){
  if(O.accessMode==='worker'){
    const r=await api('/rest/v1/rpc/worker_latest_event_v1',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId})});return Array.isArray(r)?(r[0]||null):(r||null);
  }
  const r=await api('/rest/v1/sync_events?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=server_created_at&order=server_created_at.desc&limit=1');return r?.[0]?.server_created_at||null;
}
async function poll(){if(!O.ready||!navigator.onLine||O.syncing)return;try{const x=await latestEventAt();if(x&&O.lastServerEventAt&&x!==O.lastServerEventAt){if((await queueCount())===0)await pullCloud();}O.lastServerEventAt=x||O.lastServerEventAt;}catch(e){}}
async function touchDevice(){try{await upsertRows('sync_devices',[{buffet_id:O.buffetId,device_id:O.deviceId,user_id:O.user?.id||null,device_name:navigator.platform||navigator.userAgent,last_seen_at:nowIso(),last_sync_at:nowIso(),pending_count:await queueCount()}],'buffet_id,device_id');}catch(e){}}


async function logoutOnline(){
  persistBuffetCache();
  try{if(navigator.onLine&&O.session?.access_token)await api('/auth/v1/logout',{method:'POST'});}catch(e){}
  saveSession(null);O.ready=false;O.buffetId=null;O.buffetName=null;O.accessMode=null;applyAccessUI();showAuth(true);authMsg('تم تسجيل الخروج.','ok');
}

async function executeOnlineReset(){
  if(!navigator.onLine)return alert('إعادة ضبط النسخة Online تحتاج اتصال بالإنترنت.');
  const btn=document.getElementById('resetExecuteBtn');if(btn)btn.disabled=true;
  try{
    await api('/rest/v1/rpc/reset_buffet_data',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_device_id:O.deviceId})});
    await qClear();
    O.suppress=true;
    try{
      const fresh=window.resetFreshState?window.resetFreshState():{cash:{opening:0,movements:[]},openingDue:{},cats:[],people:[],suppliers:[''],expenseTypes:['كهرباء','مياه','صيانة','نقل','ضيافة على البوفيه','أخرى'],products:[],sales:[],payments:[],purchases:[],expenses:[],recipes:[],hospitality:[],audit:[],accountLedger:[],accountLedgerVersion:1};
      Object.keys(window.S||{}).forEach(k=>delete window.S[k]);Object.assign(window.S,fresh);localStorage.removeItem(window.ARCHIVE_KEY||'buffet_v9_online_archive');localStorage.setItem(window.DATA_KEY||'buffet_v9_online_state',JSON.stringify(window.S));O.lastState=clone(window.S);O.lastArchive=[];window.closeResetModal?.();window.render?.();
    }finally{O.suppress=false;}
    await pullCloud();alert('تمت إعادة ضبط بيانات البوفيه Online.');
  }catch(e){alert('تعذر تنفيذ إعادة الضبط: '+(e.message||e));}
  finally{if(btn)btn.disabled=false;refreshStatus();}
}
function installSensitiveGuards(){
  if(window.__onlineSensitiveWrapped)return;window.__onlineSensitiveWrapped=true;
  if(window.executeResetAll)window.executeResetAll=executeOnlineReset;
  if(window.closeMonth){const orig=window.closeMonth;window.closeMonth=async function(){
    if(!navigator.onLine)return alert('إغلاق الشهر في النسخة Online يحتاج اتصال بالإنترنت.');
    try{
      await O.queuePromise;await syncPending();
      if((await queueCount())>0)return alert('يوجد عمليات لم تتم مزامنتها بعد. انتظر المزامنة ثم أعد إغلاق الشهر.');
      await pullCloud();const before=archiveNow().length;orig.apply(this,arguments);await O.queuePromise;
      if(archiveNow().length>before){
        await syncPending();
        if((await queueCount())>0)return alert('تم إنشاء إغلاق الشهر محليًا لكن لم تكتمل المزامنة. لا تبدأ شهرًا جديدًا على جهاز آخر قبل اكتمالها.');
        const r=await api('/rest/v1/rpc/advance_buffet_period',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_device_id:O.deviceId})});
        O.periodEpoch=Number(r||O.periodEpoch+1);localStorage.setItem(periodKeyFor(O.buffetId),String(O.periodEpoch));await pullCloud();
      }
    }catch(e){console.error(e);alert('تعذر إغلاق الشهر Online: '+(e.message||e));}
  };}
  if(window.restore)window.restore=function(){alert('استرجاع النسخة الاحتياطية متوقف مؤقتًا في النسخة Online لحين اعتماده بشكل آمن.');};
}

async function afterAuth(){
  O.user=O.session?.user||O.user;clearOperationalAutofill();setTimeout(clearOperationalAutofill,300);setTimeout(clearOperationalAutofill,1200);
  let chosen=await loadBuffetAccess();
  if(!chosen){
    if(!navigator.onLine){showAuth(true);authMsg('أول تشغيل للحساب يحتاج اتصال بالإنترنت.','err');return;}
    authMsg('جاري تجهيز البوفيه لأول مرة...');
    await api('/rest/v1/rpc/create_buffet',{method:'POST',body:JSON.stringify({p_name:'البوفيه'})});
    chosen=await loadBuffetAccess();
  }
  if(!chosen){showAuth(true);authMsg('تعذر تجهيز البوفيه للحساب. حاول تسجيل الدخول مرة أخرى.','err');return;}
  await activateBuffetAccess(chosen);
}
async function init(){
  if((location.hash||'').startsWith('#account='))return;
  if(isEmailVerifyCallback()){renderEmailVerifyResult();return;}
  injectUI();installSensitiveGuards();O.dataEpoch=1;O.periodEpoch=1;
  if(window.S){ensureIds(window.S);O.lastState=clone(window.S);O.lastArchive=archiveNow();}
  try{await recoverJournal()}catch(e){console.error('recover sync journal',e)}
  O.deviceId=localStorage.getItem(CFG.deviceKey)||uid('DEV');localStorage.setItem(CFG.deviceKey,O.deviceId);loadSession();
  const recoverySession=recoverySessionFromUrl();
  if(recoverySession)saveSession(recoverySession);
  if(isRecoveryPage()){
    if(O.session?.access_token){showRecoveryPanel();return;}
    showAuth(true);authMsg('رابط استعادة كلمة المرور غير صالح أو انتهت صلاحيته. اطلب رابط جديد من شاشة الدخول.','err');return;
  }
  if(O.session?.access_token){
    try{
      if(navigator.onLine){await accessToken();const u=await api('/auth/v1/user',{method:'GET'});O.user=u;O.session.user=u;saveSession(O.session);await afterAuth();}
      else{
        const m=cachedBuffetAccess();
        if(m&&window.S){rememberBuffetAccess(m);restoreBuffetCache(m.buffet_id);O.ready=true;showAuth(false);applyAccessUI();clearOperationalAutofill();await refreshStatus();}
        else{showAuth(true);authMsg('أول تشغيل Offline يحتاج فتح الحساب مرة واحدة بالإنترنت.','err');}
      }
    }catch(e){
      console.error(e);
      if(e?.status===401){saveSession(null);O.ready=false;showAuth(true);authMsg('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.','err');return;}
      const m=cachedBuffetAccess();
      if(m&&window.S){rememberBuffetAccess(m);restoreBuffetCache(m.buffet_id);O.ready=true;showAuth(false);applyAccessUI();clearOperationalAutofill();await setStatus('error','السيرفر غير متاح · العمل محفوظ محليًا');}
      else{showAuth(true);authMsg('تعذر الوصول للسيرفر. جرّب مرة أخرى عند رجوع الإنترنت.','err');}
    }
  }else showAuth(true);
}
window.onlineInit=init;
window.addEventListener('online',()=>{O.online=true;refreshStatus();if(O.ready)scheduleSync(100);});
window.addEventListener('offline',()=>{O.online=false;refreshStatus();});
window.addEventListener('focus',()=>{if(O.ready&&navigator.onLine){scheduleSync(100);poll();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&O.ready&&navigator.onLine){scheduleSync(100);poll();}});
document.addEventListener('DOMContentLoaded',()=>setTimeout(init,50));
})();
