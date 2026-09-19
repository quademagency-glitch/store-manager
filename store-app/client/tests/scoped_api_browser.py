"""Production API adapter in Chromium, with a synthetic loopback auth session."""
import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page()
    page.route('**/scope-test',lambda route:route.fulfill(content_type='text/html',body='<title>Scoped API acceptance</title>'))
    page.goto('http://127.0.0.1:5190/scope-test')
    result=page.evaluate("""async()=>{
      const {supabase}=await import('/src/lib/supabase.js');const {scopedApi}=await import('/src/lib/api.js');
      const scope={businessId:'business-a',userId:'operator-a',locationId:'branch-a'};
      const checks=[],calls=[];const check=(ok,text)=>{if(!ok)throw Error(text);checks.push(text);};
      localStorage.setItem('active_location_id','branch-a');
      supabase.auth.getSession=async()=>({data:{session:{user:{id:'operator-a'},access_token:'synthetic-token-a'}}});
      window.fetch=async(url,options)=>{calls.push({url,headers:options.headers,body:options.body});return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});};
      await scopedApi(scope).post('/sales/offline-sync',{saved:true});
      check(calls.length===1&&calls[0].headers.Authorization==='Bearer synthetic-token-a'&&calls[0].headers['X-Location-Id']==='branch-a'&&calls[0].headers['X-Expected-Business-Id']==='business-a','Request freezes authenticated user, business and branch');
      localStorage.setItem('active_location_id','branch-b');let err;
      try{await scopedApi(scope).post('/sales/offline-sync',{});}catch(e){err=e;}
      check(err?.scopeChanged&&calls.length===1,'Branch switch prevents replay before any HTTP request');
      localStorage.setItem('active_location_id','branch-a');supabase.auth.getSession=async()=>({data:{session:{user:{id:'operator-b'},access_token:'synthetic-token-b'}}});err=null;
      try{await scopedApi(scope).post('/sales/offline-sync',{});}catch(e){err=e;}
      check(err?.scopeChanged&&calls.length===1,'Account switch prevents replay before any HTTP request');
      supabase.auth.getSession=async()=>({data:{session:null}});err=null;
      try{await scopedApi(scope).post('/sales/offline-sync',{});}catch(e){err=e;}
      check(err?.scopeChanged&&calls.length===1,'Signed-out session cannot replay');
      let release;supabase.auth.getSession=()=>new Promise(resolve=>{release=resolve;});
      const pending=scopedApi(scope).post('/sales/offline-sync',{}).catch(e=>e);
      localStorage.setItem('active_location_id','branch-b');release({data:{session:{user:{id:'operator-a'},access_token:'synthetic-token-a'}}});err=await pending;
      check(err?.scopeChanged&&calls.length===1,'Branch switch while awaiting session cannot replay');
      return checks;
    }""")
    print(json.dumps({'browser':'Chromium','passed':len(result),'checks':result},indent=2))
    browser.close()
