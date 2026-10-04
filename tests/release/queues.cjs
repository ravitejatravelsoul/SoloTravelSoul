const fs=require('fs'),vm=require('vm');
const root=require('path').resolve(__dirname,'../..');
const ts=require(root+'/node_modules/typescript');
function load(file,deps,source){
const m={exports:{}};source=source||ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(source,{module:m,exports:m.exports,require:n=>{if(n in deps)return deps[n];throw Error('Unexpected '+n)},console:{error(){}},process:{env:{}},Date,Math},{filename:file});return m.exports;
}
(async()=>{
const out=[];
const data=new Map();let apply=async()=>{};
const storage={getItem:async k=>data.get(k)||null,setItem:async(k,v)=>data.set(k,v)};
const lock=load('apps/mobile/utils/queueLock.ts',{});
const q=load('apps/mobile/utils/syncQueue.ts',{'./queueLock':lock,'@react-native-async-storage/async-storage':{default:storage},'@solotravelsoul/firebase':{upsertChecklistItem:(...a)=>apply(...a),deleteChecklistItem:async()=>{},upsertItineraryDay:async()=>{}}});
const day={id:'day-2026-10-02',date:new Date('2026-10-02'),places:[],journalEntries:[]};
await q.enqueueOp('u',{type:'itinerary.day',tripId:'A',dayId:day.id,day});
await q.enqueueOp('u',{type:'itinerary.day',tripId:'B',dayId:day.id,day});
out.push({name:'Cross-trip offline edits',expected:2,actual:await q.getQueueSize('u')});
data.clear();const op=id=>({type:'checklist.upsert',tripId:'A',item:{id,createdAt:new Date()}});
await Promise.all([q.enqueueOp('u',op('a')),q.enqueueOp('u',op('b'))]);
out.push({name:'Concurrent offline enqueue',expected:2,actual:await q.getQueueSize('u')});
data.clear();await q.enqueueOp('u',op('a'));let release,started;
const begin=new Promise(r=>started=r);apply=()=>{started();return new Promise(r=>release=r)};
const pending=q.processQueue('u');await begin;await q.enqueueOp('u',op('b'));release();await pending;
out.push({name:'Enqueue during queue drain',expected:1,actual:await q.getQueueSize('u')});

// Chat queue uses the same concurrency contract, including in-flight enqueues.
data.clear(); let send = async()=>{};
const cq = load('apps/mobile/utils/chatQueue.ts', {'./queueLock':lock,
 '@react-native-async-storage/async-storage':{default:storage},
 '@solotravelsoul/firebase':{sendDirectMessage:(...args)=>send(...args),sendGroupMessage:async()=>{}}});
const dm=id=>({type:'dm.send',chatId:'chat',senderId:'u',text:'hello',clientId:id,otherUids:['v']});
await Promise.all([cq.enqueueChatOp('u',dm('a')),cq.enqueueChatOp('u',dm('b')),cq.enqueueChatOp('u',dm('a'))]);
out.push({name:'Concurrent chat enqueue with retry deduplication',expected:2,actual:await cq.getChatQueueSize('u')});
data.clear();await cq.enqueueChatOp('u',dm('a'));let unlock,ready;
const entered=new Promise(r=>ready=r);let calls=0;
send=()=>{calls++;ready();return new Promise(r=>unlock=r)};
const first=cq.processChatQueue('u');const second=cq.processChatQueue('u');await entered;
await cq.enqueueChatOp('u',dm('b'));unlock();await Promise.all([first,second]);
out.push({name:'Chat single flight',expected:1,actual:calls});
out.push({name:'Chat enqueue during drain',expected:1,actual:await cq.getChatQueueSize('u')});
send=async()=>{throw Object.assign(new Error('denied'),{code:'permission-denied'})};
for(let i=0;i<6;i++)await cq.processChatQueue('u');
out.push({name:'Failed messages retained for recovery',expected:1,actual:await cq.getChatQueueSize('u')});
const originalSet=storage.setItem;storage.setItem=async()=>{throw Error('disk full')};let rejected=false;
try{await cq.enqueueChatOp('u',dm('c'))}catch{rejected=true}finally{storage.setItem=originalSet}
out.push({name:'Storage failures reported to caller',expected:true,actual:rejected});

let drains=0,releaseDrain;const drain=new Promise(r=>releaseDrain=r);
let displayedCount=0;
const state={pendingOpsCount:0,syncStatus:{},setSyncStatus(){},setPendingOpsCount(n){displayedCount=n}};
const hook=load('apps/mobile/hooks/useSyncEngine.ts',{
'react':{useEffect(){},useRef:v=>({current:v}),useCallback:f=>f},
'react-native':{AppState:{}},'zustand/react/shallow':{useShallow:f=>f},
'./useNetworkState':{useNetworkState:()=>({isConnected:true})},
'@/stores/tripStore':{useTripStore:f=>f(state)},
'@/utils/syncQueue':{getQueueSize:async()=>0,processQueue:async()=>{drains++;await drain;return{succeeded:0,failed:0}}},
'@/stores/authStore':{useAuthStore:{getState:()=>({user:{uid:'u'}})}},
'@/utils/chatQueue':{getChatQueueSize:async()=>2,processChatQueue:async()=>({succeeded:0,failed:0})},
'@/utils/offlineCache':{getLatestSyncTime:async()=>null,setLastSync:async()=>{}}
});
const one=hook.useSyncEngine('u'),two=hook.useSyncEngine('u');
const sync=one.sync();await two.sync();releaseDrain();await sync;
out.push({name:'Shared hook lock',expected:1,actual:drains});
out.push({name:'Pending badge includes chat work',expected:2,actual:displayedCount});

const tripStore=load('apps/mobile/stores/tripStore.ts',{'zustand':require(root+'/node_modules/zustand')}).useTripStore;
tripStore.setState({trips:[{id:'old'}],activeTrip:{id:'old'},itinerary:[{id:'old-day'}],currentItineraryTripId:'old',checklist:[{id:'old-item'}],checklistTripId:'old',pendingOpsCount:9});
tripStore.getState().reset();
const reset=tripStore.getState();
out.push({name:'Account switch clears trip data and badges',expected:true,actual:reset.trips.length===0&&reset.itinerary.length===0&&reset.checklist.length===0&&reset.activeTrip===null&&reset.currentItineraryTripId===null&&reset.checklistTripId===null&&reset.pendingOpsCount===0});
let authUid='u',writes=0,resolveCache;
const authHook=selector=>selector({user:{uid:authUid}});authHook.getState=()=>({user:{uid:authUid}});
const checklistState={checklist:[],checklistTripId:'A',setChecklist(){writes++},addChecklistItem(){},patchChecklistItem(){},removeChecklistItem(){}};
const checklistHook=load('apps/mobile/hooks/useChecklist.ts',{
 'react':{useState:v=>[v,()=>{}],useCallback:f=>f,useMemo:f=>f()},
 'zustand/react/shallow':{useShallow:f=>f},
 '@solotravelsoul/firebase':{getChecklist:async()=>[{id:'network'}],upsertChecklistItem:async()=>{},deleteChecklistItem:async()=>{}},
 '@/stores/authStore':{useAuthStore:authHook},'@/stores/tripStore':{useTripStore:selector=>selector(checklistState)},
 '@/stores/uiStore':{useUIStore:selector=>selector({addToast(){}})},
 './useHaptics':{useHaptics:()=>({})},'./useNetworkState':{useNetworkState:()=>({isConnected:true})},
 '@/utils/offlineCache':{getCachedChecklist:()=>new Promise(r=>resolveCache=r),cacheChecklist:async()=>{},setLastSync:async()=>{}},
 '@/utils/syncQueue':{enqueueOp:async()=>{},getQueueSize:async()=>0},'@/utils/chatQueue':{getChatQueueSize:async()=>0}
});
const checklist=checklistHook.useChecklist('A');const loading=checklist.load();authUid='different';resolveCache([{id:'cached-old'}]);await loading;
out.push({name:'Old account asynchronous checklist cannot restore stale data',expected:0,actual:writes});

const babel=require(root+'/node_modules/@babel/core'),plugin=require(root+'/node_modules/babel-preset-expo/build/inline-env-vars').expoInlineEnvVars;
for(const k of ['API_KEY','AUTH_DOMAIN','PROJECT_ID','STORAGE_BUCKET','MESSAGING_SENDER_ID','APP_ID'])process.env['EXPO_PUBLIC_FIREBASE_'+k]='review-dummy-'+k;
const compiled=ts.transpileModule(fs.readFileSync(root+'/packages/firebase/src/config.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const transformed=babel.transformSync(compiled,{configFile:false,babelrc:false,plugins:[plugin],caller:{name:'metro',isDev:false},filename:root+'/packages/firebase/src/config.ts'}).code;
let values;const config=load('packages/firebase/src/config.ts',{'firebase/app':{getApps:()=>[],getApp:()=>({}),initializeApp:c=>{values=c;return{}}}},transformed);
out.push({name:'Production Firebase config validation',expected:true,actual:config.isFirebaseConfigured,allSixValuesInlined:Object.values(values).every(v=>v.startsWith('review-dummy-'))});
console.log(JSON.stringify(out,null,2));if(out.some(x=>x.actual!==x.expected))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
