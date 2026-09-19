"""Real Chromium IndexedDB upgrade, scope and durable-request tests on loopback Vite.
Uses synthetic data and the mock-mode API adapter; no production requests.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE=os.environ.get('CHECKOUT_TEST_URL','http://127.0.0.1:5189')
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    page=browser.new_page()
    page.route('**/identity-test',lambda route:route.fulfill(content_type='text/html',body='<title>Local offline identity acceptance</title>'))
    page.goto(BASE+'/identity-test')
    result=page.evaluate("""async()=>{
      const check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};const checks=[];
      await new Promise((resolve,reject)=>{const r=indexedDB.open('StoreAppDB',1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('products',{keyPath:'id'});d.createObjectStore('customers',{keyPath:'id'});d.createObjectStore('offline_queue',{keyPath:'id',autoIncrement:true});};r.onsuccess=()=>{const d=r.result,t=d.transaction(['products','customers','offline_queue'],'readwrite');t.objectStore('products').put({id:'unowned-product'});t.objectStore('customers').put({id:'unowned-customer'});t.objectStore('offline_queue').put({payload:{private:'unowned-transaction'}});t.oncomplete=()=>{d.close();resolve();};};r.onerror=()=>reject(r.error);});
      const idb=await import('/src/lib/idb.js');
      const a={businessId:'a',userId:'user-a',locationId:'branch-a'};
      const scopes=[{...a,businessId:'b'},{...a,userId:'user-b'},{...a,locationId:'branch-b'}];
      await idb.saveProductsToIDB([{id:'owned-product'}],a);await idb.saveCustomersToIDB([{id:'customer-1'}],a);await idb.saveCustomersToIDB([{id:'customer-2'}],a);
      const queueId=await idb.addToOfflineQueue('/sales/offline-sync','POST',{stage1:{operation_id:'creation'},stage2:{settlement_id:'payment'}},a);
      for(const scope of scopes){check((await idb.getProductsFromIDB(scope)).length===0,'Products isolated: '+JSON.stringify(scope));check((await idb.getCustomersFromIDB(scope)).length===0,'Customers isolated: '+JSON.stringify(scope));check((await idb.getOfflineQueue(scope)).length===0,'Payments isolated: '+JSON.stringify(scope));}
      check((await idb.getCustomersFromIDB(a)).length===2,'Customer search caches merge');
      check(await idb.getUnscopedQueueCount()===1,'Unowned legacy payment preserved in quarantine');
      const db=await idb.getDB();check((await db.getAll('products')).length===0 && (await db.getAll('customers')).length===0,'Legacy customer and product cache discarded');
      let refused=false;try{await idb.removeFromOfflineQueue(queueId,scopes[1]);}catch{refused=true;}check(refused,'Another user cannot remove the owned payment');
      await idb.updateOfflineQueueItem(queueId,{scope:scopes[1],scopeKey:idb.scopeKey(scopes[1])},a);check((await idb.getOfflineQueue(a)).length===1,'Queue updates cannot change ownership');
      await idb.saveCheckoutDraft({request:{operation_id:'same-creation'}},a);check(await idb.getCheckoutDraft(scopes[2])===null,'Checkout draft isolated by branch');
      const {api}=await import('/src/lib/api.js'), {walletPost}=await import('/src/lib/walletOperations.js');
      const calls=[];api.post=async(endpoint,payload)=>{calls.push(structuredClone(payload));if(calls.length===1)throw Error('Lost response');return {new_balance:10};};
      try{await walletPost(a,'wallet:credit','/loyalty/store-credit',{customer_id:'c',type:'deposit',amount:10});}catch{}
      check((await idb.getWalletDrafts(a)).length===1,'Lost wallet response leaves durable retry');
      let blocked=false;try{await walletPost(a,'wallet:credit','/loyalty/store-credit',{customer_id:'c',type:'deposit',amount:20});}catch{blocked=true;}
      check(blocked&&calls.length===1,'Unconfirmed operation blocks a different new payment');
      await walletPost(a,'wallet:credit','/loyalty/store-credit',{},true);
      check(JSON.stringify(calls[0])===JSON.stringify(calls[1]),'Retry uses identical saved operation and amount');
      check((await idb.getWalletDrafts(a)).length===0,'Confirmed operation removes its saved retry');
      api.post=async()=>{throw Object.assign(Error('Denied'),{status:400});};
      try{await walletPost(a,'wallet:credit','/loyalty/store-credit',{amount:10});}catch{}
      check((await idb.getWalletDrafts(a)).length===0,'Explicit rejection does not retain an uncommitted wallet draft');
      api.post=async()=>{throw Error('Lost response');};
      try{await walletPost(a,'wallet:credit','/loyalty/store-credit',{amount:10});}catch{}
      api.post=async()=>{throw Object.assign(Error('Session expired'),{status:401});};
      try{await walletPost(a,'wallet:credit','/loyalty/store-credit',{},true);}catch{}
      check((await idb.getWalletDrafts(a)).length===1,'Expired login cannot discard a previously unconfirmed wallet payment');
      let release,entered;const ready=new Promise(r=>entered=r);
      const first=idb.withCheckoutLock(a,async()=>{entered();await new Promise(r=>release=r);});await ready;
      let lockRefused=false;try{await idb.withCheckoutLock(a,()=>{});}catch{lockRefused=true;}
      check(lockRefused,'Concurrent checkout writer cannot replace the active saved payment');release();await first;
      await idb.removeFromOfflineQueue(queueId,a);check((await idb.getOfflineQueue(a)).length===0 && await idb.getUnscopedQueueCount()===1,'Confirmed owned queue can clear without deleting legacy payments');
      return checks;
    }""")
    print(json.dumps({'browser':'Chromium','passed':len(result),'checks':result},indent=2))
    browser.close()
