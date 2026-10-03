// Supabase Edge Function "cbs-pet". Deploy with: supabase functions deploy cbs-pet --no-verify-jwt
import {createClient} from 'npm:@supabase/supabase-js@2'
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const STAFF=Deno.env.get('STAFF_KEY')||''
const H={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type,x-staff-key,apikey,authorization','Content-Type':'application/json'}
const J=(o:any,s=200)=>new Response(JSON.stringify(o),{status:s,headers:H})
const uid=()=>crypto.randomUUID().slice(0,7)
const today=()=>new Date().toISOString().slice(0,10)
const code=()=>String(1000+crypto.getRandomValues(new Uint32Array(1))[0]%9000)
const okDate=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>=today()
const load=async()=>(await db.from('cbs_pet').select('data,ts').eq('id','main').maybeSingle()).data
const slots=(D:any,date:string):[string,boolean][]=>{const cap=D.staff.filter((u:any)=>u.role==='care').length||1;return [...Array(8)].map((_,i)=>{const t=String(9+i).padStart(2,'0')+':00';return [t,D.appt.filter((a:any)=>a.date===date&&a.time===t&&a.st!=='cancelled').length<cap]})}
const view=(D:any,c:any)=>({name:c.name,pet:c.pet,species:c.species,breed:c.breed,vacc:c.vacc,
 appts:D.appt.filter((a:any)=>a.cid===c.id).map((a:any)=>({id:a.id,date:a.date,time:a.time,st:a.st,svc:(D.svc.find((s:any)=>s.id===a.sid)||{}).name})),
 inv:D.inv.filter((i:any)=>i.cid===c.id).map((i:any)=>({d:i.d,desc:i.desc,amt:i.amt,st:i.st}))})
// 5 wrong codes per email = 15 minute lockout
function auth(D:any,email:string,pin:string){email=(email||'').trim().toLowerCase();D._f=D._f||{};const f=D._f[email]||{n:0,t:0}
 if(f.n>=5&&Date.now()-f.t<9e5)return {err:'Too many attempts. Try again in 15 minutes.'}
 const c=D.cust.find((x:any)=>x.email&&x.email.toLowerCase()===email&&x.code===String(pin))
 if(!c){D._f[email]={n:f.n+1,t:Date.now()};return {err:'Email or code not recognised'}}
 delete D._f[email];return {c}}
async function mutate(fn:(D:any)=>any){for(let i=0;i<4;i++){const row=await load();if(!row)return {error:'Not set up yet. Open the staff app and connect sync first.'}
 const out=fn(row.data);if(out.nochange)return out
 const {data}=await db.from('cbs_pet').update({data:row.data,ts:Date.now()}).eq('id','main').eq('ts',row.ts).select('ts');if(data?.length)return out}
 return {error:'Busy, please retry'}}
function handle(A:string,b:any,D:any):any{
 if(A==='book'){const s=D.svc.find((x:any)=>x.id===b.sid),date=String(b.date),time=String(b.time)
  const name=String(b.name||'').trim().slice(0,80),email=String(b.email||'').trim().slice(0,120),phone=String(b.phone||'').trim().slice(0,30)
  if(!s||!name||!(email||phone)||!okDate(date))return {error:'Please complete all fields',nochange:true}
  if(!slots(D,date).find(x=>x[0]===time&&x[1]))return {error:'That slot was just taken',nochange:true}
  let c=email&&D.cust.find((x:any)=>x.email&&x.email.toLowerCase()===email.toLowerCase());const isNew=!c
  if(!c){c={id:uid(),name,phone,email,pet:String(b.pet||'').slice(0,60),species:String(b.species||'Dog').slice(0,20),breed:'',vacc:'',notes:'Online booking',code:code()};D.cust.push(c)}
  const care=D.staff.filter((u:any)=>u.role==='care'),free=care.find((u:any)=>!D.appt.some((a:any)=>a.uid===u.id&&a.date===date&&a.time===time&&a.st!=='cancelled'))||care[0]
  D.appt.push({id:uid(),cid:c.id,sid:s.id,uid:free?.id,date,time,st:'booked'})
  const text=`Booking confirmed: ${s.name} on ${date} at ${time}.`+(isNew?` Your My Pets portal code: ${c.code}`:'')
  D.msg.push({id:uid(),cid:c.id,dir:'out',text,d:today(),ch:'SMS/Email'})
  return {ok:true,code:isNew?c.code:null,_n:{phone:c.phone,email:c.email,text,h:D.set.hooks||{},biz:D.set.name}}}
 const a=auth(D,b.email,b.code);if(a.err)return {error:a.err};const c=a.c
 if(A==='login')return {...view(D,c),nochange:true}
 const ap=D.appt.find((x:any)=>x.id===b.id&&x.cid===c.id)
 if(A==='cancel'){if(!ap||ap.st!=='booked')return {error:'Not found',nochange:true};ap.st='cancelled';return {ok:true}}
 if(A==='move'){const date=String(b.date),time=String(b.time);if(!ap||ap.st!=='booked'||!okDate(date)||!slots(D,date).find(x=>x[0]===time&&x[1]))return {error:'Slot unavailable',nochange:true};ap.date=date;ap.time=time;return {ok:true}}
 if(A==='review'){D.rev.push({id:uid(),cid:c.id,r:Math.min(5,Math.max(1,+b.r||5)),t:String(b.t||'').slice(0,500),d:today()});return {ok:true}}
 if(A==='message'){D.msg.push({id:uid(),cid:c.id,dir:'in',text:String(b.text||'').slice(0,500),d:today(),ch:'Portal'});return {ok:true}}
 return {error:'Unknown action',nochange:true}}
async function notify(n:any){const post=(u:string,p:any)=>fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({business:n.biz,text:n.text,...p})})
 await Promise.allSettled([n.h.sms&&n.phone&&post(n.h.sms,{type:'sms',to:n.phone}),n.h.email&&n.email&&post(n.h.email,{type:'email',to:n.email,subject:n.biz})].filter(Boolean) as Promise<any>[])}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H})
 try{const b=await req.json(),A=b.action
  if(A==='pull'||A==='push'){ // staff app only
   if(!STAFF||req.headers.get('x-staff-key')!==STAFF)return J({error:'forbidden'},403)
   const row=await load();if(A==='pull')return J(row||{})
   const ts=Date.now()
   if(!row){await db.from('cbs_pet').insert({id:'main',data:b.data,ts});return J({ts})}
   const {data}=await db.from('cbs_pet').update({data:b.data,ts}).eq('id','main').eq('ts',b.baseTs).select('ts')
   return data?.length?J({ts}):J(row,409)}
  const row=await load();if(!row)return J({error:'Not set up yet'},503);const D=row.data
  if(A==='info')return J({name:D.set.name,tag:D.set.tag,ac:D.set.ac,cur:D.set.cur,svc:D.svc.map((s:any)=>({id:s.id,name:s.name,mins:s.mins,price:s.price*(1-(s.promo||0)/100)}))})
  if(A==='slots')return J({slots:slots(D,String(b.date))})
  const r=await mutate(d=>handle(A,b,d));if(r._n){const n=r._n;delete r._n;await notify(n)}
  delete r.nochange;return J(r,r.error?400:200)
 }catch(e){return J({error:'Bad request'},400)}})
