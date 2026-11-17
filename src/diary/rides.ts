import type { BikeState } from '../bike/types';
export type RideWorld = 'valley' | 'space' | 'road' | 'kaleidoscope';
export interface Ride {
  id:string; startedAt:string; updatedAt:string; world:RideWorld; mode:'arcade'|'scenic'; simulated:boolean;
  seconds:number; activeSeconds:number; powerSeconds:number; cadenceSeconds:number; wattSeconds:number; cadenceTotal:number;
  maxWatts:number; maxCadence:number; metres:number; score:number; rings:number; balloons:number; tunnelSeconds:number; bestStreak:number;
  position:number; status:'autosaved'|'saved'|'completed';
}
export const RIDES_KEY='skycycle.rides.v1';
export const CALORIE_EFFICIENCY=.22;
export const calories=(ride:Ride)=>ride.powerSeconds>0?ride.wattSeconds/(4184*CALORIE_EFFICIENCY):null;
export const worlds:Record<RideWorld,string>={valley:'Valley',space:'Space',road:'Road race',kaleidoscope:'Kaleidoscope'};
const numbers=['seconds','activeSeconds','powerSeconds','cadenceSeconds','wattSeconds','cadenceTotal','maxWatts','maxCadence','metres','score','rings','balloons','tunnelSeconds','bestStreak','position'] as const;
export function validateRides(value:unknown):Ride[]{
  if(!value||typeof value!=='object'||(value as {version?:unknown}).version!==1||!Array.isArray((value as {rides?:unknown}).rides))throw new Error('This is not a SkyCycle riding-diary backup.');
  const rows=(value as {rides:unknown[]}).rides;if(rows.length>10000)throw new Error('This backup has too many rides.');
  return rows.map(row=>{
    if(!row||typeof row!=='object')throw new Error('The backup contains an invalid ride.');
    const r=row as Record<string,unknown>;
    if(typeof r.id!=='string'||r.id.length>100||!r.id||typeof r.world!=='string'||!Object.hasOwn(worlds,r.world)||!['arcade','scenic'].includes(r.mode as string)||typeof r.simulated!=='boolean'||!['autosaved','saved','completed'].includes(r.status as string))throw new Error('The backup contains an invalid ride.');
    for(const key of ['startedAt','updatedAt'])if(typeof r[key]!=='string'||!Number.isFinite(Date.parse(r[key] as string)))throw new Error('The backup contains an invalid date.');
    for(const key of numbers)if(typeof r[key]!=='number'||!Number.isFinite(r[key])||(r[key] as number)<0||(r[key] as number)>1e12)throw new Error('The backup contains invalid measurements.');
    if((r.activeSeconds as number)>(r.seconds as number)+.1||(r.powerSeconds as number)>(r.activeSeconds as number)+.1||(r.cadenceSeconds as number)>(r.activeSeconds as number)+.1||(r.position as number)>6)throw new Error('The backup contains inconsistent measurements.');
    return Object.fromEntries(['id','startedAt','updatedAt','world','mode','simulated','status',...numbers].map(key=>[key,r[key]])) as unknown as Ride;
  });
}
const merge=(a:Ride[],b:Ride[])=>{const map=new Map(a.map(r=>[r.id,r]));for(const r of b){const old=map.get(r.id);if(!old||Date.parse(r.updatedAt)>=Date.parse(old.updatedAt))map.set(r.id,{...r});}return [...map.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt));};
export class RideStore {
  private cache:Ride[]=[];private hydrated=false;private blocked=false;warning='';private listeners=new Set<()=>void>();private removed=new Set<string>();
  constructor(private storage:()=>Pick<Storage,'getItem'|'setItem'>=()=>localStorage){}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private notify(){for(const listener of this.listeners)listener();}
  records(){if(!this.hydrated){this.hydrated=true;try{const raw=this.storage().getItem(RIDES_KEY);if(raw)this.cache=merge([],validateRides(JSON.parse(raw)));}catch{this.blocked=true;this.warning='The existing diary could not be read. New rides stay in memory here; export a backup before clearing website data.';}}return this.cache.map(r=>({...r}));}
  private commit(){if(this.blocked){this.notify();return;}try{this.storage().setItem(RIDES_KEY,JSON.stringify({version:1,rides:this.cache}));this.warning='';}catch{this.warning='Browser storage could not save your diary. Keep this page open and export a backup; your current records are still available here.';}this.notify();}
  put(ride:Ride){if(this.removed.has(ride.id))return;this.records();this.cache=merge(this.cache,[ride]);this.commit();}
  export(){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),calorieEfficiency:CALORIE_EFFICIENCY,rides:this.records()},null,2);}
  import(text:string){if(text.length>5_000_000)throw new Error('This backup is too large.');const incoming=validateRides(JSON.parse(text));this.records();this.cache=merge(this.cache,incoming);this.commit();return incoming.length;}
  remove(id:string){this.removed.add(id);this.records();this.cache=this.cache.filter(r=>r.id!==id);this.commit();}
}
export const rideStore=new RideStore();
export interface RideResults { score:number;metres:number;rings:number;balloons:number;inside:boolean;streak:number;position:number; }
const blankResults=():RideResults=>({score:0,metres:0,rings:0,balloons:0,inside:false,streak:0,position:0});
/** Consume simulation steps, not wall time: pause, background tabs and lag cannot add exercise. */
export class RideRecorder {
  private current:Ride|null=null;private baseline=blankResults();private previous=blankResults();private sinceSave=0;private saved=false;
  constructor(private store:RideStore=rideStore){}
  tick(world:RideWorld,mode:'arcade'|'scenic',state:BikeState,now:number,dt:number,result:RideResults){
    if(!Number.isFinite(dt)||dt<=0||dt>.1)return;
    const simulated=state.status==='simulated';
    if(this.current&&(this.current.world!==world||this.current.mode!==mode||this.current.simulated!==simulated||now-Date.parse(this.current.updatedAt)>30*60*1000))this.finish();
    if(!this.current){
      this.saved=false;const date=new Date(now).toISOString();this.baseline={...this.previous};
      this.current={id:globalThis.crypto?.randomUUID?.()??`${now}-${Math.random().toString(36).slice(2)}`,startedAt:date,updatedAt:date,world,mode,simulated,seconds:0,activeSeconds:0,powerSeconds:0,cadenceSeconds:0,wattSeconds:0,cadenceTotal:0,maxWatts:0,maxCadence:0,metres:0,score:0,rings:0,balloons:0,tunnelSeconds:0,bestStreak:0,position:0,status:'autosaved'};
    }
    const r=this.current,s=state.sample,connected=state.status==='connected'||simulated;
    const fresh=(at:number)=>Number.isFinite(at)&&now>=at&&now-at<3000;
    const cadence=connected&&s.cadence!==undefined&&Number.isFinite(s.cadence)&&fresh(s.cadenceAt??s.timestamp)?Math.max(0,s.cadence):null;
    const power=connected&&s.watts!==undefined&&Number.isFinite(s.watts)&&s.watts>=0&&fresh(s.wattsAt??s.timestamp)?Math.max(0,s.watts):null;
    // A reported cadence is a freshness/stop gate, matching the flight input adapter.
    const active=s.cadence!==undefined?cadence!==null&&cadence>=3:power!==null&&power>0;
    r.seconds+=dt;
    if(active){r.activeSeconds+=dt;if(power!==null){r.powerSeconds+=dt;r.wattSeconds+=power*dt;r.maxWatts=Math.max(r.maxWatts,power);}if(cadence!==null){r.cadenceSeconds+=dt;r.cadenceTotal+=cadence*dt;r.maxCadence=Math.max(r.maxCadence,cadence);}if(world==='kaleidoscope'&&result.inside)r.tunnelSeconds+=dt;}
    r.score=Math.max(0,result.score-this.baseline.score);r.metres=world==='road'?Math.max(0,result.metres-this.baseline.metres):0;r.rings=Math.max(0,result.rings-this.baseline.rings);r.balloons=Math.max(0,result.balloons-this.baseline.balloons);r.bestStreak=Math.max(r.bestStreak,result.streak);r.position=world==='road'?result.position:0;r.updatedAt=new Date(now).toISOString();
    this.previous={...result};this.sinceSave+=dt;if(this.sinceSave>=10||!this.saved&&r.activeSeconds>=1){this.checkpoint();}
  }
  checkpoint(){if(this.current&&this.current.activeSeconds>=1){this.current.status='autosaved';this.store.put(this.current);this.saved=true;}this.sinceSave=0;}
  finish(completed=false){if(this.current){this.current.status=completed?'completed':'saved';if(this.current.activeSeconds>=1)this.store.put(this.current);}this.current=null;this.sinceSave=0;}
  reset(){this.finish();this.previous=blankResults();this.baseline=blankResults();}
}
export function diaryTotals(rides:Ride[],now=new Date()){
  const week=new Date(now.getFullYear(),now.getMonth(),now.getDate());week.setDate(week.getDate()-(week.getDay()+6)%7);
  const month=new Date(now.getFullYear(),now.getMonth(),1);
  const total=(since:number)=>rides.filter(r=>!r.simulated&&Date.parse(r.startedAt)>=since&&Date.parse(r.startedAt)<=now.getTime()).reduce((s,r)=>({rides:s.rides+1,seconds:s.seconds+r.activeSeconds,kcal:s.kcal+(calories(r)??0),powerSeconds:s.powerSeconds+r.powerSeconds}),{rides:0,seconds:0,kcal:0,powerSeconds:0});
  return {week:total(week.getTime()),month:total(month.getTime()),all:total(0)};
}
