"""Exercise the production auth hook in Chromium using synthetic auth events.
The fixture server on 5190 must use VITE_USE_MOCKS=false and loopback Supabase.
No hosted account, credential or database write is involved.
"""
import json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page()
    page.route('**/auth-test',lambda route:route.fulfill(content_type='text/html',body='<div id="auth-probe"></div>'))
    page.goto('http://127.0.0.1:5190/auth-test')
    checks=page.evaluate("""async()=>{
      const reactModule=await import('/node_modules/.vite/deps/react.js');const React=reactModule.default||reactModule;
      const domModule=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=domModule.default||domModule;
      const {supabase}=await import('/src/lib/supabase.js');
      const {useAuth}=await import('/src/hooks/useAuth.real.js');
      let callback,root,state;const checks=[];
      const wait=async(predicate)=>{for(let i=0;i<250;i++){if(predicate())return;await new Promise(r=>setTimeout(r,20));}throw Error('Auth state did not settle');};
      const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
      const rows={a:{business_id:'business-a',status:'active',businesses:{status:'active'},roles:{name:'Business Admin',permissions:[]},user_locations:[]},b:{business_id:'business-b',status:'active',businesses:{status:'active'},roles:{name:'Business Admin',permissions:[]},user_locations:[]}};
      supabase.auth.onAuthStateChange=fn=>{callback=fn;return {data:{subscription:{unsubscribe(){callback=null;}}}};};
      supabase.from=()=>({select(){return {eq(_column,id){return {single:async()=>({data:rows[id]})};}};}});
      function Probe(){state=useAuth();return React.createElement('span',null,state.businessId||'signed-out');}
      const mount=async()=>{root=createRoot(document.getElementById('auth-probe'));root.render(React.createElement(Probe));await wait(()=>callback);};
      const emit=id=>callback('INITIAL_SESSION',{user:{id},access_token:'synthetic-'+id});
      localStorage.setItem('active_location:business-a:a','branch-a2');
      await mount();emit('a');await wait(()=>state.businessId==='business-a'&&!state.loading);
      check(state.activeLocationId==='branch-a2'&&localStorage.getItem('active_location_id')==='branch-a2','Initial real auth restores only the matching user and business branch');
      state.switchLocation('branch-a3',{silent:true});await wait(()=>state.activeLocationId==='branch-a3');
      root.unmount();await mount();emit('a');await wait(()=>state.businessId==='business-a'&&!state.loading);
      check(state.activeLocationId==='branch-a3','A branch selection survives auth reinitialization after reload');
      emit('b');await wait(()=>state.businessId==='business-b'&&!state.loading);
      check(state.activeLocationId===null&&localStorage.getItem('active_location_id')===null,'A different account cannot inherit the previous branch');
      state.switchLocation('branch-b1',{silent:true});await wait(()=>state.activeLocationId==='branch-b1');
      emit('a');await wait(()=>state.businessId==='business-a'&&!state.loading);
      check(state.activeLocationId==='branch-a3','Returning to the original account restores its own branch');
      root.unmount();rows.a.business_id='business-c';await mount();emit('a');await wait(()=>state.businessId==='business-c'&&!state.loading);
      check(state.activeLocationId===null,'A business reassignment does not inherit the old business branch');
      root.unmount();rows.a.roles.name='Cashier';rows.a.user_locations=[{location_id:'allowed-branch'}];localStorage.setItem('active_location:business-c:a','removed-branch');
      await mount();emit('a');await wait(()=>state.businessId==='business-c'&&!state.loading);
      check(state.activeLocationId==='allowed-branch','A staff member cannot restore a branch removed from their assignments');
      root.unmount();return checks;
    }""")
    print(json.dumps({'browser':'Chromium','passed':len(checks),'checks':checks},indent=2))
    browser.close()
