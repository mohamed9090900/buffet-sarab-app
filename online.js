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
  session:null,user:null,buffetId:null,buffetName:null,role:null,permissions:{},isPrimary:false,memberships:[],deviceId:null,dataEpoch:1,periodEpoch:1,
  ready:false,suppress:false,lastState:null,lastArchive:[],legacyCandidate:null,legacyArchive:[],syncing:false,lastServerEventAt:null,
  pollTimer:null,online:navigator.onLine,queuePromise:Promise.resolve()
};
window.BUFFET_ONLINE=O;

function clone(v){return JSON.parse(JSON.stringify(v));}
function nowIso(){return new Date().toISOString();}
function uid(prefix='X'){return prefix+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateKey(v){
  if(!v)return new Date().toISOString().slice(0,10);
  let s=String(v).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[‎‏‪-‮]/g,'');
  let m=s.match(/(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{4})/);
  if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  return new Date().toISOString().slice(0,10);
}
const LEGACY_IMPORT_DONE_KEY='buffet_v9_legacy_import_done';
function dataKeyFor(bid){return `buffet_v9_online_state:${bid}`;}
function archiveKeyFor(bid){return `buffet_v9_online_archive:${bid}`;}
function epochKeyFor(bid){return `buffet_v9_data_epoch:${bid}`;}
function periodKeyFor(bid){return `buffet_v9_period_epoch:${bid}`;}
function meaningfulCount(st){return (st?.people?.length||0)+(st?.products?.length||0)+(st?.sales?.length||0)+(st?.purchases?.length||0)+(st?.payments?.length||0)+(st?.expenses?.length||0)+(st?.recipes?.length||0)+(st?.hospitality?.length||0);}
function blankState(){return window.resetFreshState?window.resetFreshState():{cash:{opening:0,movements:[]},openingDue:{},cats:[],people:[],suppliers:[''],expenseTypes:['كهرباء','مياه','صيانة','نقل','ضيافة على البوفيه','أخرى'],products:[],sales:[],payments:[],purchases:[],expenses:[],recipes:[],hospitality:[],audit:[],accountLedger:[],accountLedgerVersion:1};}
function persistBuffetCache(){
  if(!O.buffetId||!window.S)return;
  try{localStorage.setItem(dataKeyFor(O.buffetId),JSON.stringify(window.S));}catch(e){}
  try{localStorage.setItem(archiveKeyFor(O.buffetId),localStorage.getItem(window.ARCHIVE_KEY||'buffet_v9_online_archive')||'[]');}catch(e){}
}
function restoreBuffetCache(bid){
  if(!window.S||!bid)return false;
  let data=null,archive='[]';
  try{data=JSON.parse(localStorage.getItem(dataKeyFor(bid))||'null');archive=localStorage.getItem(archiveKeyFor(bid))||'[]';}catch(e){data=null;archive='[]';}
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
function rememberSelectedMembership(m){
  if(!m)return;
  O.buffetId=m.buffet_id;O.buffetName=m.buffet_name||'';O.role=m.role;O.permissions=m.permissions||{};O.isPrimary=!!m.is_primary;
  try{localStorage.setItem(CFG.memberKey,JSON.stringify(m));}catch(e){}
  O.dataEpoch=Number(localStorage.getItem(epochKeyFor(O.buffetId))||1);O.periodEpoch=Number(localStorage.getItem(periodKeyFor(O.buffetId))||1);
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

function isPrimaryAdmin(){return O.role==='admin'&&O.isPrimary===true;}
function isAdminLike(){return O.role==='admin';}
function roleLabel(){return isPrimaryAdmin()?'Admin رئيسي':(O.role==='admin'?'Admin':'User');}
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
  .oa-field{display:grid;gap:7px;margin:10px 0}.oa-field label{color:#cbd5e1;font-size:14px}.oa-field input,.oa-field select{width:100%;box-sizing:border-box;background:#0d1117;border:1px solid #39424e;color:#fff;border-radius:13px;padding:13px;font-size:16px}.oa-field input{direction:ltr;text-align:left}
  .oa-actions{display:grid;gap:9px;margin-top:14px}.oa-btn{border:0;border-radius:13px;padding:13px 15px;font-size:16px;font-weight:800;cursor:pointer}.oa-primary{background:#1f6feb;color:#fff}.oa-secondary{background:#21262d;color:#fff;border:1px solid #3a424d}.oa-msg{min-height:24px;margin-top:12px;color:#d1d5db;text-align:center;line-height:1.6}.oa-msg.err{color:#ff8b8b}.oa-msg.ok{color:#7ee787}
  #onlineStatus{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:18000;border:1px solid #3b4654;background:rgba(17,24,39,.94);color:#fff;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.3);display:none;align-items:center;gap:7px;direction:rtl;cursor:pointer;user-select:none}
  #onlineStatus.show{display:flex}.os-dot{width:8px;height:8px;border-radius:50%;background:#22c55e}.offline .os-dot{background:#f59e0b}.syncing .os-dot{background:#60a5fa}.error .os-dot{background:#ef4444}
  .public-view #onlineStatus,.public-view #onlineAuth{display:none!important}
  `;
  document.head.appendChild(style);
  const auth=document.createElement('div');auth.id='onlineAuth';auth.innerHTML=`<div class="oa-box">
    <img class="oa-logo" src="icon-192.png" alt="البوفيه"><h2>البوفيه</h2>
    <div id="oaLoginPanel">
      <div class="oa-sub">تسجيل الدخول للنسخة Online</div>
      <div class="oa-field"><label>البريد الإلكتروني</label><input id="oaEmail" type="email" autocomplete="email" placeholder="name@example.com"></div>
      <div class="oa-field"><label>كلمة المرور</label><input id="oaPass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <div class="oa-actions"><button id="oaLogin" class="oa-btn oa-primary" type="button">تسجيل الدخول</button><button id="oaSignup" class="oa-btn oa-secondary" type="button">إنشاء حساب</button><button id="oaForgot" class="oa-btn oa-secondary" type="button">نسيت كلمة المرور؟</button></div>
    </div>
    <div id="oaRecoveryPanel" style="display:none;margin-top:8px">
      <div class="oa-sub" style="margin-bottom:12px">اكتب كلمة مرور جديدة للحساب.</div>
      <div class="oa-field"><label>كلمة المرور الجديدة</label><input id="oaNewPass" type="password" autocomplete="new-password" placeholder="••••••••"></div>
      <div class="oa-field"><label>تأكيد كلمة المرور</label><input id="oaNewPass2" type="password" autocomplete="new-password" placeholder="••••••••"></div>
      <button id="oaSetPassword" class="oa-btn oa-primary" type="button" style="width:100%">حفظ كلمة المرور الجديدة</button>
    </div>
    <div id="oaBuffetChooser" style="display:none;margin-top:8px">
      <div class="oa-sub" style="margin-bottom:12px">اختار البوفيه اللي عايز تفتحه.</div>
      <div id="oaBuffetChoices" class="oa-actions"></div>
      <button id="oaAddBuffet" class="oa-btn oa-secondary" type="button" style="width:100%;margin-top:10px">إنشاء بوفيه جديد أو الانضمام بكود</button>
      <button id="oaChooserLogout" class="oa-btn oa-secondary" type="button" style="width:100%;margin-top:9px">تسجيل الخروج</button>
    </div>
    <div id="oaOnboarding" style="display:none;margin-top:8px">
      <div class="oa-sub" style="margin-bottom:12px">أنشئ بوفيه جديد أو انضم لبوفيه موجود.</div>
      <div class="oa-field"><label>اسم البوفيه الجديد</label><input id="oaBuffetName" type="text" maxlength="80" placeholder="مثال: البوفيه" style="direction:rtl;text-align:right"></div>
      <button id="oaCreateBuffet" class="oa-btn oa-primary" type="button" style="width:100%">إنشاء بوفيه جديد</button>
      <div style="height:1px;background:#30363d;margin:18px 0"></div>
      <div class="oa-field"><label>كود الانضمام</label><input id="oaInviteCode" type="text" autocomplete="off" placeholder="ADM-... أو USR-..."></div>
      <button id="oaJoinBuffet" class="oa-btn oa-secondary" type="button" style="width:100%">الانضمام لبوفيه موجود</button>
      <button id="oaBackToBuffets" class="oa-btn oa-secondary" type="button" style="width:100%;margin-top:9px;display:none">رجوع لقائمة البوفيهات</button>
      <button id="oaOnboardingLogout" class="oa-btn oa-secondary" type="button" style="width:100%;margin-top:9px">تسجيل الخروج</button>
    </div>
    <div id="oaMsg" class="oa-msg"></div>
  </div>`;
  document.body.appendChild(auth);
  const status=document.createElement('div');status.id='onlineStatus';status.innerHTML='<span class="os-dot"></span><span id="onlineStatusText">Online</span>';document.body.appendChild(status);
  document.getElementById('oaLogin').addEventListener('click',()=>authLogin(false));
  document.getElementById('oaSignup').addEventListener('click',()=>authLogin(true));
  document.getElementById('oaForgot').addEventListener('click',requestPasswordReset);
  document.getElementById('oaSetPassword').addEventListener('click',updateRecoveredPassword);
  document.getElementById('oaCreateBuffet').addEventListener('click',createBuffetOnline);
  document.getElementById('oaJoinBuffet').addEventListener('click',joinBuffetOnline);
  document.getElementById('oaOnboardingLogout').addEventListener('click',logoutOnline);
  document.getElementById('oaChooserLogout').addEventListener('click',logoutOnline);
  document.getElementById('oaAddBuffet').addEventListener('click',()=>showOnboarding(true));
  document.getElementById('oaBackToBuffets').addEventListener('click',()=>showBuffetChooser(O.memberships));
  status.addEventListener('click',()=>{if(!O.session?.access_token)return;const who=O.user?.email||'الحساب الحالي';const buffet=O.buffetName?`\n${O.buffetName}`:'';if(O.memberships.length>1){if(confirm(`${who}${buffet}\n${roleLabel()}\n\nاختيار بوفيه آخر؟`)){showAuth(true);showBuffetChooser(O.memberships);}}else if(confirm(`${who}${buffet}\n${roleLabel()}\n\nتسجيل الخروج؟`))logoutOnline();});
}
function authMsg(t,kind=''){const e=document.getElementById('oaMsg');if(e){e.textContent=t;e.className='oa-msg '+kind;}}
function showAuth(show=true){const e=document.getElementById('onlineAuth');if(e)e.classList.toggle('show',show);}
function showOnboarding(show=true){
  const o=document.getElementById('oaOnboarding'),l=document.getElementById('oaLoginPanel'),c=document.getElementById('oaBuffetChooser'),r=document.getElementById('oaRecoveryPanel'),back=document.getElementById('oaBackToBuffets');
  if(o)o.style.display=show?'block':'none';if(l)l.style.display=show?'none':'block';if(c)c.style.display='none';if(r)r.style.display='none';
  if(back)back.style.display=show&&O.memberships.length?'block':'none';
}
function showBuffetChooser(rows){
  const list=Array.isArray(rows)?rows:[];O.memberships=list;
  const o=document.getElementById('oaOnboarding'),l=document.getElementById('oaLoginPanel'),c=document.getElementById('oaBuffetChooser'),r=document.getElementById('oaRecoveryPanel'),box=document.getElementById('oaBuffetChoices');
  if(o)o.style.display='none';if(l)l.style.display='none';if(c)c.style.display='block';if(r)r.style.display='none';
  if(box){box.innerHTML=list.map(m=>`<button type="button" class="oa-btn ${m.is_primary?'oa-primary':'oa-secondary'} oa-buffet-choice" data-bid="${m.buffet_id}">${esc(m.buffet_name||'البوفيه')} · ${m.is_primary?'Admin رئيسي':(m.role==='admin'?'Admin':'User')}</button>`).join('');box.querySelectorAll('.oa-buffet-choice').forEach(b=>b.addEventListener('click',()=>activateBuffet(b.dataset.bid)));}
  authMsg('');
}
async function createBuffetOnline(){
  const name=document.getElementById('oaBuffetName')?.value.trim()||'';
  if(name.length<2)return authMsg('اكتب اسم البوفيه.','err');
  authMsg('جاري إنشاء البوفيه...');
  try{
    const bid=await api('/rest/v1/rpc/create_buffet',{method:'POST',body:JSON.stringify({p_name:name})});
    authMsg('تم إنشاء البوفيه.','ok');await afterAuth(bid);
  }catch(e){authMsg(e.message||'تعذر إنشاء البوفيه.','err');}
}
async function joinBuffetOnline(){
  const code=document.getElementById('oaInviteCode')?.value.trim()||'';
  if(!code)return authMsg('اكتب كود الانضمام.','err');
  authMsg('جاري الانضمام للبوفيه...');
  try{
    const bid=await api('/rest/v1/rpc/claim_buffet_by_code',{method:'POST',body:JSON.stringify({p_code:code})});
    authMsg('تم الانضمام للبوفيه.','ok');await afterAuth(bid);
  }catch(e){authMsg('كود الانضمام غير صحيح أو غير مفعّل.','err');}
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
async function refreshToken(){
  if(!O.session?.refresh_token)throw new Error('NO_REFRESH');
  const j=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:O.session.refresh_token});saveSession(j);return j.access_token;
}
async function accessToken(){
  if(!O.session?.access_token)return null;
  const exp=sessionExpiry(O.session);if(exp&&exp-Date.now()<90000&&navigator.onLine){try{return await refreshToken()}catch(e){}}
  return O.session.access_token;
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
  const l=document.getElementById('oaLoginPanel'),o=document.getElementById('oaOnboarding'),c=document.getElementById('oaBuffetChooser'),r=document.getElementById('oaRecoveryPanel');
  if(l)l.style.display='none';if(o)o.style.display='none';if(c)c.style.display='none';if(r)r.style.display='block';
  showAuth(true);
  authMsg('اختار كلمة مرور جديدة للحساب.','');
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
  const token=await accessToken();if(!token)throw new Error('AUTH_REQUIRED');
  const headers=Object.assign({'apikey':CFG.key,'Authorization':'Bearer '+token,'Content-Type':'application/json'},opt.headers||{});
  const r=await fetch(CFG.url+path,Object.assign({},opt,{headers}));
  if(r.status===401&&O.session?.refresh_token&&!opt._retried){await refreshToken();return api(path,Object.assign({},opt,{_retried:true}));}
  if(!r.ok){const j=await r.json().catch(()=>({}));const err=new Error(j.message||j.error||j.code||('HTTP '+r.status));err.status=r.status;throw err;}
  if(r.status===204)return null;const txt=await r.text();return txt?JSON.parse(txt):null;
}
async function loadMemberships(){
  if(!O.user?.id)return [];
  const rows=await api('/rest/v1/rpc/list_my_buffets_v2',{method:'POST',body:'{}'});
  O.memberships=Array.isArray(rows)?rows:[];
  return O.memberships;
}
function applyStateObject(data,archive=[]){
  if(!window.S)return;
  O.suppress=true;
  try{
    const src=data&&typeof data==='object'?data:blankState();
    Object.keys(window.S).forEach(k=>delete window.S[k]);Object.assign(window.S,clone(src));ensureIds(window.S);window.normalizeState?.();
    localStorage.setItem(window.DATA_KEY||'buffet_v9_online_state',JSON.stringify(window.S));
    localStorage.setItem(window.ARCHIVE_KEY||'buffet_v9_online_archive',JSON.stringify(Array.isArray(archive)?archive:[]));
    O.lastState=clone(window.S);O.lastArchive=archiveNow();window.render?.();
  }finally{O.suppress=false;}
}
async function activateBuffet(bid){
  const m=O.memberships.find(x=>x.buffet_id===bid);if(!m)return null;
  if(O.buffetId&&O.buffetId!==bid){
    clearInterval(O.pollTimer);O.pollTimer=null;
    try{await O.queuePromise;}catch(e){}
    if(navigator.onLine&&O.ready){try{await syncPending();}catch(e){}}
    persistBuffetCache();
  }
  rememberSelectedMembership(m);restoreBuffetCache(bid);showOnboarding(false);showAuth(false);O.ready=false;
  if(!navigator.onLine){O.ready=true;ensureUsersPage();applyPermissionsUI();await refreshStatus();return m;}
  const initialized=await cloudInitialized();
  if(!initialized){
    if(!isPrimaryAdmin()){showAuth(true);authMsg('البوفيه لسه ما اتجهزش. الـAdmin الرئيسي يفتحه أول مرة عشان يكمّل التهيئة.','err');return null;}
    const canImport=!localStorage.getItem(LEGACY_IMPORT_DONE_KEY)&&meaningfulCount(O.legacyCandidate)>0;
    if(canImport){applyStateObject(O.legacyCandidate,O.legacyArchive);await importLocal();localStorage.setItem(LEGACY_IMPORT_DONE_KEY,'1');}
    else{applyStateObject(blankState(),[]);await importLocal();}
  }
  await pullCloud();persistBuffetCache();O.ready=true;O.lastServerEventAt=await latestEventAt();ensureUsersPage();applyPermissionsUI();await touchDevice();await refreshStatus();scheduleSync(100);
  clearInterval(O.pollTimer);O.pollTimer=setInterval(poll,CFG.pollMs);
  return m;
}
function hasPerm(p){return isAdminLike()||O.permissions?.[p]===true;}
window.buffetHasPermission=hasPerm;

function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(CFG.dbName,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(CFG.store))db.createObjectStore(CFG.store,{keyPath:'eventId'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function qPut(op){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readwrite');tx.objectStore(CFG.store).put(op);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function qAll(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readonly'),r=tx.objectStore(CFG.store).getAll();r.onsuccess=()=>res((r.result||[]).filter(x=>x.buffetId===O.buffetId).sort((a,b)=>Number(a.order||0)-Number(b.order||0)||(a.createdAt||'').localeCompare(b.createdAt||'')));r.onerror=()=>rej(r.error);});}
async function qDel(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readwrite');tx.objectStore(CFG.store).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
async function qClear(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(CFG.store,'readwrite'),store=tx.objectStore(CFG.store),r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(!c)return;if(c.value?.buffetId===O.buffetId)c.delete();c.continue();};tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});}
let __qSeq=0;function op(kind,table,id,row,extra={}){return {eventId:uid('EVT'),buffetId:O.buffetId,kind,table,id,row,createdAt:nowIso(),order:(Date.now()*1000)+(++__qSeq%1000),epoch:Number(O.dataEpoch||1),periodEpoch:Number(O.periodEpoch||1),...extra};}
async function enqueue(x){journalAddMany([x]);await qPut(x);journalRemove(x.eventId);refreshStatus();if(navigator.onLine)scheduleSync(80);}

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
  for(const d of defs){
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
  if(!jEq(settingsPayload(prev),settingsPayload(cur)))pending.push(op('settings','buffet_settings',O.buffetId,settingsPayload(cur)));
  const aa=arrMap(prevArchive||[],x=>x._cloudId||x.id||x.month||''),bb=arrMap(curArchive||[],x=>x._cloudId||x.id||x.month||'');
  for(const [id,x] of bb)if((id&&!aa.has(id))||(id&&!jEq(aa.get(id),x)))pending.push(op('archive_upsert','month_archives',id,x));
  for(const [id] of aa)if(id&&!bb.has(id))pending.push(op('delete','month_archives',id,null));
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
async function cloudHasData(){const rows=await api('/rest/v1/products?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=id&limit=1');if(rows?.length)return true;const o=await api('/rest/v1/officers?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=id&limit=1');if(o?.length)return true;const s=await api('/rest/v1/sales?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=id&limit=1');return !!s?.length;}
async function serverEpochs(){const r=await api('/rest/v1/buffet_settings?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=data_epoch,period_epoch&limit=1');return {data:Number(r?.[0]?.data_epoch||1),period:Number(r?.[0]?.period_epoch||1)};}
async function serverDataEpoch(){return (await serverEpochs()).data;}
async function cloudInitialized(){const r=await api('/rest/v1/buffet_settings?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=cloud_initialized&limit=1');return !!r?.[0]?.cloud_initialized;}
async function fetchRecentAudit(){
  if(!isAdminLike())return null;
  return await api('/rest/v1/audit_logs?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=id,payload,action,detail,client_created_at,server_created_at&order=server_created_at.desc&limit=500');
}
async function importLocal(){
  if(!window.S)return;ensureIds(window.S);const st=window.S;
  const rows={};for(const d of defs)rows[d.table]=d.get(st).map(x=>rowFor(d.table,x));
  for(const p of rows.products||[]){const src=(st.products||[]).find(x=>x._id===p.id);p.stock_qty=Number(src?.qty||0);p.buy_price=Number(src?.buy||0);p.stock_value=Number(src?.qty||0)*Number(src?.buy||0);}
  for(const d of defs)await insertRowsIgnore(d.table,rows[d.table]||[]);
  const p=settingsPayload(st);await upsertRows('buffet_settings',[{buffet_id:O.buffetId,opening_due:p.openingDue,cash_opening:p.cashOpening,account_ledger_version:p.accountLedgerVersion,payload:p,cloud_initialized:true}],'buffet_id');
  const ar=archiveNow();for(let i=0;i<ar.length;i++){if(!ar[i]._cloudId)ar[i]._cloudId='ARC'+String(i+1)+'-'+String(ar[i].month||uid('M'));}localStorage.setItem(window.ARCHIVE_KEY||'buffet_v9_online_archive',JSON.stringify(ar));await upsertRows('month_archives',ar.map(x=>({buffet_id:O.buffetId,id:x._cloudId,month_key:String(x.month||x._cloudId),payload:x})));
  const ev=op('initial_import','sync_events','import',{});await recordEvent(ev);O.lastState=clone(st);O.lastArchive=clone(ar);persistBuffetCache();
}
async function pullCloud(){
  if(!window.S||!O.buffetId)return;
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
async function latestEventAt(){const r=await api('/rest/v1/sync_events?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&select=server_created_at&order=server_created_at.desc&limit=1');return r?.[0]?.server_created_at||null;}
async function poll(){if(!O.ready||!navigator.onLine||O.syncing)return;try{const x=await latestEventAt();if(x&&O.lastServerEventAt&&x!==O.lastServerEventAt){if((await queueCount())===0)await pullCloud();}O.lastServerEventAt=x||O.lastServerEventAt;}catch(e){}}
async function touchDevice(){try{await upsertRows('sync_devices',[{buffet_id:O.buffetId,device_id:O.deviceId,user_id:O.user?.id||null,device_name:navigator.platform||navigator.userAgent,last_seen_at:nowIso(),last_sync_at:nowIso(),pending_count:await queueCount()}],'buffet_id,device_id');}catch(e){}}


const PERMS=[
 ['sell','تسجيل البيع'],['collect','التحصيل من الضباط'],['purchase','تسجيل المشتريات'],['expense','تسجيل المصروفات'],
 ['hospitality','الضيافة'],['cash','الإيداع والسحب والدين'],['manage_catalog','إدارة المنتجات والفئات والريسبي'],['manage_officers','إدارة الضباط'],
 ['edit_sales','تعديل ومرتجع المبيعات'],['edit_payments','تعديل التحصيلات'],['edit_purchases','تعديل المشتريات'],['edit_expenses','تعديل المصروفات'],['delete_data','حذف البيانات']
];
function ensureUsersPage(){
  const existingNav=document.querySelector('#nav [data-page="onlineUsers"]'),existingPage=document.getElementById('onlineUsers');
  if(!isPrimaryAdmin()){existingNav?.remove();existingPage?.remove();return;}
  if(!existingNav){
    const b=document.createElement('button');b.type='button';b.className='nav-card';b.dataset.page='onlineUsers';b.innerHTML='<span class="nav-icon">👤</span><span class="nav-label">المستخدمون</span>';b.addEventListener('click',()=>{window.show?.('onlineUsers',b);renderUsersPage();});document.getElementById('nav')?.appendChild(b);
  }
  if(!document.getElementById('onlineUsers')){
    const sec=document.createElement('section');sec.id='onlineUsers';sec.innerHTML=`<div class="rowtitle"><h2>المستخدمون والصلاحيات</h2><button type="button" id="ouLogout" class="tab">تسجيل الخروج</button></div>
      <div class="card" style="margin-bottom:14px">
        <h3>أكواد الانضمام</h3>
        <div class="hint">الـ Admin الرئيسي فقط يقدر يولّد الأكواد. كود Admin صالح لاستخدام واحد فقط، وكود User يظل صالحًا إلى أن تغيّره.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button type="button" id="ouGenAdminCode" class="primary">توليد كود Admin لمرة واحدة</button>
          <button type="button" id="ouGenUserCode" class="tab">إنشاء / تغيير كود User</button>
        </div>
        <div id="ouCodeResult" class="hint" style="margin-top:12px"></div>
      </div>
      <div class="card" id="ouEditor" style="display:none;margin-bottom:14px">
        <h3>تعديل مستخدم</h3>
        <div id="ouEditEmail" class="hint" style="margin-bottom:8px"></div>
        <input id="ouEditUid" type="hidden">
        <div class="grid"><select id="ouRole"><option value="user">User</option><option value="admin">Admin</option></select></div>
        <div id="ouPerms" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px;margin-top:12px"></div>
        <button type="button" id="ouSave" class="primary" style="margin-top:12px">حفظ التعديل</button>
        <div id="ouMsg" class="hint" style="margin-top:8px"></div>
      </div>
      <div class="card"><h3>المستخدمون الحاليون</h3><div id="ouList"></div></div>`;
    document.querySelector('main')?.appendChild(sec);
    const box=sec.querySelector('#ouPerms');box.innerHTML=PERMS.map(([k,l])=>`<label class="pill" style="display:flex;gap:7px;align-items:center;justify-content:flex-start"><input type="checkbox" data-perm="${k}"> ${l}</label>`).join('');
    sec.querySelector('#ouRole').addEventListener('change',()=>{box.style.opacity=sec.querySelector('#ouRole').value==='admin'?'.45':'1';});
    sec.querySelector('#ouSave').addEventListener('click',saveEditedMember);
    sec.querySelector('#ouGenAdminCode').addEventListener('click',()=>generateInviteCode('admin'));
    sec.querySelector('#ouGenUserCode').addEventListener('click',()=>generateInviteCode('user'));
    sec.querySelector('#ouLogout').addEventListener('click',logoutOnline);
  }
}
async function generateInviteCode(role){
  if(!isPrimaryAdmin())return;
  const warning=role==='admin'?'توليد كود Admin جديد هيلغي أي كود Admin قديم لم يُستخدم. متابعة؟':'تغيير كود User هيوقف الكود القديم فورًا. متابعة؟';
  if(!confirm(warning))return;
  const out=document.getElementById('ouCodeResult');if(out)out.textContent='جاري إنشاء الكود...';
  try{
    const code=await api('/rest/v1/rpc/rotate_buffet_invite_code',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_role:role})});
    if(out){
      out.innerHTML=`<div style="font-weight:900;margin-bottom:5px">${role==='admin'?'كود Admin — استخدام واحد فقط':'كود User'}</div><div id="ouGeneratedCode" style="direction:ltr;text-align:center;font-size:18px;word-break:break-all;background:#0d1117;padding:10px;border-radius:10px">${esc(code||'')}</div><button type="button" id="ouCopyCode" class="tab" style="margin-top:8px">نسخ الكود</button><div style="margin-top:7px">${role==='admin'?'ابعته للشخص المقصود فقط. أول استخدام ناجح يلغيه تلقائيًا.':'الكود يظل صالحًا إلى أن تغيّره.'}</div>`;
      document.getElementById('ouCopyCode')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(String(code||''));out.querySelector('#ouCopyCode').textContent='تم النسخ';}catch(e){alert('اضغط مطولًا على الكود وانسخه يدويًا.');}});
    }
  }catch(e){if(out)out.textContent=e.message||'تعذر إنشاء الكود.';}
}
async function renderUsersPage(){
  if(!isPrimaryAdmin())return;
  ensureUsersPage();const list=document.getElementById('ouList');if(!list)return;list.innerHTML='<div class="hint">جاري التحميل...</div>';
  try{
    const members=await api('/rest/v1/rpc/list_buffet_members',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId})});
    list.innerHTML=(members||[]).map(m=>{const me=m.user_id===O.user?.id;const primary=!!m.is_primary;return `<div class="person" style="align-items:flex-start"><div><div class="name">${esc(m.email||m.display_name||m.user_id)}</div><div class="muted">${primary?'Admin رئيسي':(m.role==='admin'?'Admin':'User')} · ${m.enabled?'مفعّل':'موقوف'}${me?' · حسابك':''}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${primary?'':`<button type="button" class="tab ou-edit" data-uid="${m.user_id}">تعديل</button><button type="button" class="tab ou-toggle" data-uid="${m.user_id}" data-enabled="${m.enabled?'1':'0'}">${m.enabled?'إيقاف':'تفعيل'}</button><button type="button" class="tab ou-delete" data-uid="${m.user_id}">حذف</button>`}</div></div>`}).join('')||'<div class="hint">لا يوجد مستخدمون.</div>';
    list.querySelectorAll('.ou-edit').forEach(b=>b.addEventListener('click',()=>editMember(b.dataset.uid,members)));
    list.querySelectorAll('.ou-toggle').forEach(b=>b.addEventListener('click',()=>toggleMember(b.dataset.uid,b.dataset.enabled==='1')));
    list.querySelectorAll('.ou-delete').forEach(b=>b.addEventListener('click',()=>deleteMember(b.dataset.uid,members)));
  }catch(e){list.innerHTML='<div class="hint">تعذر تحميل المستخدمين.</div>';}
}
function editMember(uid,members){
  const m=(members||[]).find(x=>x.user_id===uid);if(!m||m.is_primary)return;
  document.getElementById('ouEditor').style.display='block';
  document.getElementById('ouEditUid').value=uid;
  document.getElementById('ouEditEmail').textContent=m.email||m.display_name||uid;
  document.getElementById('ouRole').value=m.role==='admin'?'admin':'user';
  for(const cb of document.querySelectorAll('#ouPerms [data-perm]'))cb.checked=!!m.permissions?.[cb.dataset.perm];
  document.getElementById('ouRole').dispatchEvent(new Event('change'));
}
async function saveEditedMember(){
  if(!isPrimaryAdmin())return;
  const uid=document.getElementById('ouEditUid')?.value||'',msg=document.getElementById('ouMsg');if(!uid)return;
  try{
    const role=document.getElementById('ouRole').value;const permissions={};
    for(const cb of document.querySelectorAll('#ouPerms [data-perm]'))permissions[cb.dataset.perm]=!!cb.checked;
    await api('/rest/v1/buffet_members?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&user_id=eq.'+encodeURIComponent(uid),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({role,permissions,enabled:true,updated_at:nowIso()})});
    if(msg)msg.textContent='تم حفظ التعديل.';document.getElementById('ouEditor').style.display='none';await renderUsersPage();
  }catch(e){if(msg)msg.textContent=e.message||'تعذر حفظ التعديل.';}
}
async function toggleMember(uid,enabled){
  if(!isPrimaryAdmin())return;
  try{await api('/rest/v1/buffet_members?buffet_id=eq.'+encodeURIComponent(O.buffetId)+'&user_id=eq.'+encodeURIComponent(uid),{method:'PATCH',headers:{'Prefer':'return=minimal'},body:JSON.stringify({enabled:!enabled,updated_at:nowIso()})});await renderUsersPage();}catch(e){alert(e.message||'تعذر تعديل المستخدم');}
}
async function deleteMember(uid,members){
  if(!isPrimaryAdmin())return;
  const m=(members||[]).find(x=>x.user_id===uid);if(!m||m.is_primary)return;
  if(!confirm(`حذف ${m.email||m.display_name||'المستخدم'} من البوفيه؟`))return;
  try{await api('/rest/v1/rpc/remove_buffet_member',{method:'POST',body:JSON.stringify({p_buffet_id:O.buffetId,p_user_id:uid})});await renderUsersPage();}catch(e){alert(e.message||'تعذر حذف المستخدم');}
}
async function logoutOnline(){persistBuffetCache();try{if(navigator.onLine&&O.session?.access_token)await api('/auth/v1/logout',{method:'POST'});}catch(e){}saveSession(null);O.ready=false;O.buffetId=null;O.buffetName=null;O.role=null;O.permissions={};O.isPrimary=false;O.memberships=[];showOnboarding(false);showAuth(true);authMsg('تم تسجيل الخروج.','ok');}
function applyPermissionsUI(){
  if(!O.ready)return;
  const admin=isAdminLike();
  const navPerm={paymentsPage:'collect',purchases:'purchase',expenses:'expense',products:'manage_catalog',categories:'manage_catalog',recipes:'manage_catalog',cashPage:'cash'};
  for(const [page,p] of Object.entries(navPerm)){const b=document.querySelector(`#nav [data-page="${page}"]`);if(b)b.style.display=admin||hasPerm(p)?'':'none';}
  const show=(sel,ok)=>document.querySelectorAll(sel).forEach(e=>e.style.display=ok?'':'none');
  show('[onclick*="openResetModal"],[onclick*="closeMonth"],[onclick*="newMonth"],[onclick*="setCashOpening"]',admin);
  show('[onclick*="addOfficer"]',admin||hasPerm('manage_officers'));
  const officerName=document.getElementById('newOfficerName');if(officerName)officerName.style.display=admin||hasPerm('manage_officers')?'':'none';
  show('[onclick*="editOfficer"]',admin);
  show('[onclick*="openPayModal"]',admin||hasPerm('collect'));
  show('[onclick^="editPayment"]',admin||hasPerm('edit_payments'));
  show('.sale-edit-btn,.sale-return-btn',admin||hasPerm('edit_sales'));
  show('[onclick^="editPurchase"]',admin||hasPerm('edit_purchases'));
  show('.purchase-delete-btn',admin||hasPerm('delete_data'));
  show('[onclick^="editExpense"]',admin||hasPerm('edit_expenses'));
  show('.product-edit-btn',admin||hasPerm('manage_catalog'));
  show('.product-delete-btn,.recipe-delete-btn',admin||hasPerm('delete_data'));
  show('[onclick^="setHospitalityStatus"],.hospitality-collect-btn',admin||hasPerm('hospitality'));
  show('[onclick*="openHospitality"]',admin||hasPerm('hospitality'));
  show('[onclick*="openCashSale"]',admin||hasPerm('sell'));
  document.querySelectorAll('.sale-product-card,.sale-recipe-card').forEach(e=>{if(!(admin||hasPerm('sell')||hasPerm('hospitality')))e.style.display='none';});
  show('[onclick^="adjust"]',admin||hasPerm('manage_catalog'));
}

function guardFunction(name,allowed,message){
  const orig=window[name];if(typeof orig!=='function'||orig.__onlineGuarded)return;
  const wrapped=function(){if(O.ready&&!allowed())return alert(message||'ليس لديك صلاحية لتنفيذ العملية.');return orig.apply(this,arguments);};
  wrapped.__onlineGuarded=true;window[name]=wrapped;
}
function installPermissionGuards(){
  const p=x=>()=>isAdminLike()||hasPerm(x),admin=()=>isAdminLike();
  guardFunction('openOfficer',p('sell'),'ليس لديك صلاحية تسجيل مبيعات.');
  guardFunction('personSale',p('sell'),'ليس لديك صلاحية تسجيل مبيعات.');
  guardFunction('openCashSale',p('sell'),'ليس لديك صلاحية تسجيل بيع كاش.');
  guardFunction('sellRecipe',p('sell'),'ليس لديك صلاحية تسجيل مبيعات.');
  guardFunction('openHospitality',p('hospitality'),'ليس لديك صلاحية تسجيل الضيافة.');
  guardFunction('setHospitalityStatus',p('hospitality'),'ليس لديك صلاحية تعديل الضيافة.');
  guardFunction('collectHospitality',p('hospitality'),'ليس لديك صلاحية تحصيل الضيافة.');
  guardFunction('openPayModal',p('collect'),'ليس لديك صلاحية التحصيل.');
  guardFunction('confirmPayment',p('collect'),'ليس لديك صلاحية التحصيل.');
  guardFunction('editPayment',p('edit_payments'),'ليس لديك صلاحية تعديل التحصيلات.');
  guardFunction('purchase',p('purchase'),'ليس لديك صلاحية تسجيل المشتريات.');
  guardFunction('addSupplier',p('purchase'),'ليس لديك صلاحية إدارة الموردين.');
  guardFunction('editPurchase',p('edit_purchases'),'ليس لديك صلاحية تعديل المشتريات.');
  guardFunction('deletePurchase',p('delete_data'),'ليس لديك صلاحية حذف المشتريات.');
  guardFunction('expense',p('expense'),'ليس لديك صلاحية تسجيل المصروفات.');
  guardFunction('addExpenseType',p('expense'),'ليس لديك صلاحية إدارة أنواع المصروفات.');
  guardFunction('editExpense',p('edit_expenses'),'ليس لديك صلاحية تعديل المصروفات.');
  guardFunction('addCashMove',p('cash'),'ليس لديك صلاحية الحركات المالية.');
  guardFunction('addDebt',p('cash'),'ليس لديك صلاحية تسجيل الدين.');
  guardFunction('payDebt',p('cash'),'ليس لديك صلاحية سداد الدين.');
  guardFunction('addCategory',p('manage_catalog'),'ليس لديك صلاحية إدارة الفئات.');
  guardFunction('saveRecipe',p('manage_catalog'),'ليس لديك صلاحية إدارة الريسبي.');
  guardFunction('setRecipeCategory',p('manage_catalog'),'ليس لديك صلاحية إدارة الريسبي.');
  guardFunction('saveProductEdit',p('manage_catalog'),'ليس لديك صلاحية تعديل المنتجات.');
  guardFunction('setPurchasedProductSale',p('manage_catalog'),'ليس لديك صلاحية تعديل المنتجات.');
  guardFunction('adjust',p('manage_catalog'),'ليس لديك صلاحية تعديل المخزون يدويًا.');
  guardFunction('deleteProduct',p('delete_data'),'ليس لديك صلاحية حذف البيانات.');
  guardFunction('deleteRecipe',p('delete_data'),'ليس لديك صلاحية حذف البيانات.');
  guardFunction('deleteCategory',()=>isAdminLike()||(hasPerm('manage_catalog')&&hasPerm('delete_data')),'حذف الفئة يحتاج صلاحية إدارة الفئات والحذف.');
  guardFunction('editSale',p('edit_sales'),'ليس لديك صلاحية تعديل المبيعات.');
  guardFunction('deleteSale',p('edit_sales'),'ليس لديك صلاحية تنفيذ مرتجع.');
  guardFunction('addOfficer',p('manage_officers'),'ليس لديك صلاحية إضافة الضباط.');
  guardFunction('editOfficer',admin,'تعديل اسم الضابط متاح للـ Admin فقط لأنه يغيّر السجل المرتبط به.');
  guardFunction('setCashOpening',admin,'رصيد بداية الخزنة متاح للـ Admin فقط.');
}



async function executeOnlineReset(){
  const input=document.getElementById('resetConfirmInput');if(!input||input.value.trim().toUpperCase()!=='RESET')return;
  if(!navigator.onLine)return alert('إعادة ضبط النسخة Online تحتاج اتصال بالإنترنت.');
  if(!isAdminLike())return alert('إعادة ضبط البرنامج متاحة للـ Admin فقط.');
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
  installPermissionGuards();
  if(window.executeResetAll)window.executeResetAll=executeOnlineReset;
  if(window.closeMonth){const orig=window.closeMonth;window.closeMonth=async function(){
    if(!navigator.onLine)return alert('إغلاق الشهر في النسخة Online يحتاج اتصال بالإنترنت.');
    if(!isAdminLike())return alert('إغلاق الشهر متاح للـ Admin فقط.');
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
  if(window.restore){const origRestore=window.restore;window.restore=function(e){if(!navigator.onLine){if(e?.target)e.target.value='';return alert('استرجاع Backup في النسخة Online يحتاج اتصال بالإنترنت.');}if(!isAdminLike()){if(e?.target)e.target.value='';return alert('استرجاع Backup متاح للـ Admin فقط.');}return origRestore.apply(this,arguments);};}
}

async function afterAuth(preferredBuffetId=null){
  O.user=O.session?.user||O.user;
  const rows=await loadMemberships();
  if(!rows.length){showAuth(true);showOnboarding(true);authMsg('تم تسجيل الدخول. اختار إنشاء بوفيه جديد أو الانضمام بكود.','ok');return;}
  const preferred=preferredBuffetId||null;
  const chosen=(preferred&&rows.find(x=>x.buffet_id===preferred))||(rows.length===1?rows[0]:null);
  if(!chosen){showAuth(true);showBuffetChooser(rows);return;}
  await activateBuffet(chosen.buffet_id);
}
async function init(){
  if((location.hash||'').startsWith('#account='))return;
  if(isEmailVerifyCallback()){renderEmailVerifyResult();return;}
  injectUI();installSensitiveGuards();O.dataEpoch=1;O.periodEpoch=1;
  if(window.S){ensureIds(window.S);O.lastState=clone(window.S);O.lastArchive=archiveNow();try{const legacy=JSON.parse(localStorage.getItem('buffet_sarab_v867_clean')||'null');O.legacyCandidate=legacy&&typeof legacy==='object'?clone(legacy):null;const la=JSON.parse(localStorage.getItem('buffet_archive_v867_clean')||'[]');O.legacyArchive=Array.isArray(la)?clone(la):[];}catch(e){O.legacyCandidate=null;O.legacyArchive=[];}}
  try{await recoverJournal()}catch(e){console.error('recover sync journal',e)}
  if(window.render&&!window.__onlineRenderWrapped){const __r=window.render;window.render=function(){const out=__r.apply(this,arguments);setTimeout(applyPermissionsUI,0);return out};window.__onlineRenderWrapped=true;}
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
        let m=null;try{m=JSON.parse(localStorage.getItem(CFG.memberKey)||'null')}catch(e){}
        if(m&&window.S){rememberSelectedMembership(m);restoreBuffetCache(m.buffet_id);O.memberships=[m];O.ready=true;showAuth(false);ensureUsersPage();applyPermissionsUI();await refreshStatus();}
        else showAuth(true);
      }
    }catch(e){
      console.error(e);
      if(e?.status===401){saveSession(null);O.ready=false;showAuth(true);authMsg('انتهت جلسة الدخول. سجّل الدخول مرة أخرى.','err');return;}
      let m=null;try{m=JSON.parse(localStorage.getItem(CFG.memberKey)||'null')}catch(_e){}
      if(m&&window.S){rememberSelectedMembership(m);restoreBuffetCache(m.buffet_id);O.memberships=[m];O.ready=true;showAuth(false);ensureUsersPage();applyPermissionsUI();await setStatus('error','السيرفر غير متاح · العمل محفوظ محليًا');}
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
