(() => {
  'use strict';
  const KEY='foci_attribution_v2';
  const ENDPOINT='https://gyozibfurwsbdutwmgrl.supabase.co/functions/v1/marketing-attribution';
  const HOSTS=['focielemzesek.com','www.focielemzesek.com'];
  const initial=new URL(location.href);
  let auth=null, bound=false, touchPromise=null, identified=null;
  function read(){try {const x=JSON.parse(localStorage.getItem(KEY));return x&&x.expires_at>Date.now()?x:null;}catch{return null;}}
  function allowed(){return HOSTS.includes(location.hostname)&&window.FociMarketing?.hasConsent()===true;}
  function clear(){try{localStorage.removeItem(KEY);}catch{}}
  async function send(p,token){
    return fetch(ENDPOINT,{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(p),signal:AbortSignal.timeout(8000)});
  }
  async function touch(){
    if(!allowed())return null;
    let x=read();
    if(!x){
      const campaign_key=initial.searchParams.get('utm_campaign')||'';
      const channel=initial.searchParams.get('utm_source')||'';
      const content_key=initial.searchParams.get('utm_content')||'';
      if(!/^rhm_\d{4}-\d{2}-\d{2}$/.test(campaign_key)||!['facebook','instagram','tiktok'].includes(channel)||!/^[a-zA-Z0-9_-]{1,80}$/.test(content_key))return null;
      x={session_id:crypto.randomUUID(),campaign_key,channel,content_key,expires_at:Date.now()+30*86400000};
      try{localStorage.setItem(KEY,JSON.stringify(x));}catch{return null;}
    }
    const r=await send({...x,consent:true,kind:'touch'});
    return r.ok&&allowed()?x:null;
  }
  async function identify(session){
    if(!session?.access_token||!allowed()||identified===session.user?.id)return;
    try{
      const x=await(touchPromise||=touch());if(!x||!allowed())return;
      const r=await send({...x,consent:true,kind:'identify'},session.access_token);
      if(r.ok)identified=session.user.id;
    }catch{}
  }
  function bind(client){
    if(bound||!client?.auth)return;bound=true;auth=client.auth;
    auth.onAuthStateChange((_event,session)=>{setTimeout(()=>identify(session),0);});
    auth.getSession().then(r=>identify(r.data?.session)).catch(()=>{});
  }
  function boot(){
    if(allowed())touchPromise=touch().catch(()=>null);
    window.addEventListener('foci:marketing-consent',event=>{
      if(event.detail?.allowed===true){touchPromise=touch().catch(()=>null);auth?.getSession().then(r=>identify(r.data?.session)).catch(()=>{});}
      else{const x=read();clear();touchPromise=null;identified=null;if(x)send({kind:'forget',session_id:x.session_id}).catch(()=>{});}
    });
    window.FociAttribution=Object.freeze({bind});
    window.dispatchEvent(new Event('foci:attribution-ready'));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
