(() => {
  'use strict';
  const KEY='foci_attribution_v2',PENDING='foci_attribution_forget_pending';
  const ENDPOINT='https://gyozibfurwsbdutwmgrl.supabase.co/functions/v1/marketing-attribution';
  const HOSTS=['focielemzesek.com','www.focielemzesek.com'];
  const initial=new URL(location.href);
  let auth=null,bound=false,identified=null;
  function read(){try{const x=JSON.parse(localStorage.getItem(KEY));return x&&x.expires_at>Date.now()?x:null;}catch{return null;}}
  function allowed(){return HOSTS.includes(location.hostname)&&window.FociMarketing?.hasConsent()===true;}
  function clear(){try{localStorage.removeItem(KEY);}catch{}}
  function pending(){try{const x=JSON.parse(localStorage.getItem(PENDING));return Array.isArray(x)?x.filter(v=>v.expires_at>Date.now()).slice(-10):[];}catch{return[];}}
  async function send(p,token){
    if(!token)throw Error('JWT_REQUIRED');
    return fetch(ENDPOINT,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(p),signal:AbortSignal.timeout(8000)});
  }
  function context(){
    if(!allowed())return null;
    let x=read();
    if(!x){
      const campaign_key=initial.searchParams.get('utm_campaign')||'',channel=initial.searchParams.get('utm_source')||'',content_key=initial.searchParams.get('utm_content')||'';
      if(!/^rhm_\d{4}-\d{2}-\d{2}$/.test(campaign_key)||!['facebook','instagram','tiktok'].includes(channel)||!/^[a-zA-Z0-9_-]{1,80}$/.test(content_key))return null;
      x={session_id:crypto.randomUUID(),campaign_key,channel,content_key,captured_at:new Date().toISOString(),expires_at:Date.now()+30*86400000};
      try{localStorage.setItem(KEY,JSON.stringify(x));}catch{return null;}
    }
    return x;
  }
  async function forgetPending(session){
    if(!session?.access_token)return;
    const remaining=[];
    for(const x of pending())try{const r=await send({kind:'forget',session_id:x.session_id},session.access_token);if(!r.ok)remaining.push(x);}catch{remaining.push(x);}
    try{if(remaining.length)localStorage.setItem(PENDING,JSON.stringify(remaining));else localStorage.removeItem(PENDING);}catch{}
  }
  async function identify(session){
    if(!session?.access_token)return;
    await forgetPending(session);
    if(!allowed()||identified===session.user?.id)return;
    try{const x=context();if(!x)return;const r=await send({...x,consent:true,kind:'identify'},session.access_token);if(r.ok)identified=session.user.id;}catch{}
  }
  function bind(client){
    if(bound||!client?.auth)return;bound=true;auth=client.auth;
    auth.onAuthStateChange((_event,session)=>{setTimeout(()=>identify(session),0);});
    auth.getSession().then(r=>identify(r.data?.session)).catch(()=>{});
  }
  function boot(){
    if(allowed())context();
    window.addEventListener('foci:marketing-consent',event=>{
      if(event.detail?.allowed===true){context();auth?.getSession().then(r=>identify(r.data?.session)).catch(()=>{});}
      else{const x=read();clear();identified=null;if(x)try{localStorage.setItem(PENDING,JSON.stringify([...pending(),{session_id:x.session_id,expires_at:x.expires_at}]));}catch{};auth?.getSession().then(r=>forgetPending(r.data?.session)).catch(()=>{});}
    });
    window.FociAttribution=Object.freeze({bind,signupContext:()=>{const x=context();return x?{...x,consent:true}:null;}});
    window.dispatchEvent(new Event('foci:attribution-ready'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
