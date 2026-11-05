/* Six hours of genuine foreground user inactivity. Metadata only; Supabase owns tokens. */
(function(root){
  'use strict';
  const IDLE_MS=6*60*60*1000;
  const enabled=o=>['https://auditera.net','https://www.auditera.net','https://testing.auditera.net','https://auditera-testing.azden-kumar.workers.dev'].includes(o)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  function sessionId(token){try{let p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');while(p.length%4)p+='=';const c=JSON.parse(root.atob?root.atob(p):Buffer.from(p,'base64').toString());return typeof c.session_id==='string'?c.session_id:null;}catch{return null;}}
  function create({client,storage=root.localStorage,target=root,now=Date.now,onLock=()=>{},onChange=()=>{},verifyIdentity=true}){
    if(!client?.auth)throw new Error('An existing Supabase client is required.');
    let key=null,user=null,current=null,checking=null,locked=false,timer=null,disposed=false;
    const PREFIX='auditera.activity.v1:';
    function read(){if(!key)return null;try{const r=JSON.parse(storage.getItem(key)||'null');return r&&Number.isFinite(r.last)&&r.last<=now()+60000?r:null;}catch{return null;}}
    function expired(r){return !r||r.loggedOut===true||now()-r.last>=IDLE_MS;}
    function schedule(){clearTimeout(timer);if(disposed||!key)return;const r=read();if(expired(r)){void lock('Your session ended after six hours without activity. Sign in again.');return;}timer=setTimeout(()=>void enforce(),Math.min(60000,Math.max(1,r.last+IDLE_MS-now())));timer?.unref?.();}
    async function lock(reason){if(locked)return;locked=true;current=null;try{if(key)storage.setItem(key,JSON.stringify({last:0,loggedOut:true}));}catch{}onLock(reason);onChange(null);try{await client.auth.signOut({scope:'local'});}catch{}clearTimeout(timer);}
    async function enforce(){if(disposed)return false;if(key&&expired(read())){await lock('Your session ended after six hours without activity. Sign in again.');return false;}schedule();return !locked;}
    async function runCheck(){
      if(disposed||locked)return null;
      if(key&&!await enforce())return null;
      const {data,error}=await client.auth.getSession();const s=data?.session;
      if(error||!s?.access_token||!s.user?.id){if(key)await lock('Please sign in again.');return null;}
      const sid=sessionId(s.access_token);if(!sid)throw new Error('The session identity could not be verified. Reopen the dashboard.');
      const next=PREFIX+JSON.stringify([s.user.id,sid]);
      // Existing tombstones/idle records are checked BEFORE refresh/user lookup can revive UI.
      if(next!==key){key=next;locked=false;let r=read();if(!r){try{storage.setItem(key,JSON.stringify({last:now(),loggedOut:false}));}catch{throw new Error('Session activity storage is unavailable. Sign in with browser storage enabled.');}}}
      if(!await enforce())return null;
      // Tools verify this token through their existing server-side audit gate.
      const verified=verifyIdentity ? await client.auth.getUser(s.access_token) : {data:{user:s.user}};
      if(verified.error){if([400,401,403].includes(verified.error.status)){await lock('Your sign-in could not be verified. Sign in again.');return null;}throw new Error('Sign-in verification is unavailable. Reconnect and try again.');}
      if(verified.data?.user?.id!==s.user.id){await lock('Your sign-in could not be verified. Sign in again.');return null;}
      if(!await enforce())return null;
      user=verified.data.user;current={user,accessToken:s.access_token};onChange(current);schedule();return current;
    }
    async function check(){if(checking)return checking;checking=runCheck().finally(()=>checking=null);return checking;}
    function activity(event){
      if(!current||locked||disposed||!event?.isTrusted)return false;
      if(target.document&&(target.document.visibilityState!=='visible'||(typeof target.document.hasFocus==='function'&&!target.document.hasFocus())))return false;
      const r=read();if(expired(r)){void lock('Your session ended after six hours without activity. Sign in again.');return false;}
      try{storage.setItem(key,JSON.stringify({last:now(),loggedOut:false}));}catch{void lock('Session activity could not be saved. Sign in again.');return false;}schedule();return true;
    }
    function crossTab(event){if(event.key===key)void enforce();}
    function resume(){void check().catch(()=>onLock('Sign-in could not be checked. Reconnect and try again.'));}
    for(const name of ['pointerdown','keydown','touchstart','wheel'])target.addEventListener?.(name,activity,{passive:true,capture:true});
    target.addEventListener?.('storage',crossTab);target.addEventListener?.('pageshow',resume);
    target.document?.addEventListener?.('visibilitychange',()=>{if(target.document.visibilityState==='visible')resume();});
    const subscription=client.auth.onAuthStateChange?.((event)=>{
      // Never await another Supabase auth method inside its callback/lock.
      if(event==='SIGNED_OUT'){locked=true;current=null;try{if(key)storage.setItem(key,JSON.stringify({last:0,loggedOut:true}));}catch{}onLock('You are signed out. Sign in to view saved reports.');onChange(null);}
      else if(['SIGNED_IN','TOKEN_REFRESHED'].includes(event))queueMicrotask(()=>{if(!disposed&&!locked)resume();});
    });
    return {check,token:async()=>(await check())?.accessToken||null,activity,enforce,lock,
      async signedIn(){locked=false;key=null;return check();},
      state:()=>({userId:user?.id||null,locked,lastActivity:read()?.last||null,idleMs:IDLE_MS}),
      dispose(){disposed=true;clearTimeout(timer);subscription?.data?.subscription?.unsubscribe?.();for(const name of ['pointerdown','keydown','touchstart','wheel'])target.removeEventListener?.(name,activity,{capture:true});target.removeEventListener?.('storage',crossTab);target.removeEventListener?.('pageshow',resume);}};
  }
  const api={IDLE_MS,enabled,sessionId,create};if(typeof module==='object'&&module.exports)module.exports=api;else root.AuditSession=api;
})(typeof globalThis!=='undefined'?globalThis:this);
