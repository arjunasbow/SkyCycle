import { describe,expect,it } from 'vitest';
import { RideRecorder,RideStore,RIDES_KEY,calories,diaryTotals,validateRides,type RideResults } from './rides';
import type { BikeState } from '../bike/types';
const memory=()=>{const map=new Map<string,string>();return {map,getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};};
const results=(score=0):RideResults=>({score,metres:1000,rings:2,balloons:1,inside:true,streak:20,position:2});
const sample=(now:number,values:Partial<BikeState['sample']>={},simulated=false):BikeState=>({status:simulated?'simulated':'connected',sample:{timestamp:now,cadence:80,watts:100,...values}});
const start=Date.parse('2026-11-17T12:00:00Z');
function ride(store:RideStore,world:'road'|'valley'|'kaleidoscope'='road',simulated=false){const recorder=new RideRecorder(store);for(let i=0;i<100;i++)recorder.tick(world,'arcade',sample(start+i*100,{},simulated),start+i*100,.1,results());recorder.finish(true);return store.records()[0];}
describe('personal riding diary',()=>{
 it('integrates fresh real measurements, estimates calories, and survives a new browser session',()=>{
  const disk=memory(),store=new RideStore(()=>disk),r=ride(store);
  expect(r.seconds).toBeCloseTo(10);expect(r.activeSeconds).toBeCloseTo(10);expect(r.wattSeconds).toBeCloseTo(1000);expect(r.cadenceTotal/r.cadenceSeconds).toBeCloseTo(80);expect(calories(r)).toBeCloseTo(1000/(4184*.22));expect(r.maxWatts).toBe(100);expect(r.metres).toBe(1000);expect(r.position).toBe(2);expect(r.status).toBe('completed');
  expect(new RideStore(()=>disk).records()).toEqual([r]);
 });
 it('keeps running time separate from pedalling, rejects stale power/cadence, and never invents power from RPM',()=>{
  const store=new RideStore(()=>memory()),recorder=new RideRecorder(store);
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start+i*100,{watts:undefined}),start+i*100,.1,results());
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start+i*100,{cadence:0}),start+i*100,.1,results());
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start,{watts:300,cadenceAt:start-4000}),start+i*100,.1,results());
  recorder.finish();const r=store.records()[0];expect(r.seconds).toBeCloseTo(6);expect(r.activeSeconds).toBeCloseTo(2);expect(calories(r)).toBeNull();expect(r.powerSeconds).toBe(0);expect(r.metres).toBe(0);
 });
 it('handles power-only input and excludes missing power periods from partial estimates',()=>{
  const store=new RideStore(()=>memory()),recorder=new RideRecorder(store);
  for(let i=0;i<20;i++)recorder.tick('space','arcade',sample(start,{cadence:undefined}),start+i*100,.1,results());
  for(let i=0;i<20;i++)recorder.tick('space','arcade',sample(start+i*100,{watts:undefined}),start+i*100,.1,results());
  recorder.finish();const r=store.records()[0];expect(r.activeSeconds).toBeCloseTo(4);expect(r.powerSeconds).toBeCloseTo(2);expect(r.wattSeconds).toBeCloseTo(200);expect(r.cadenceSeconds).toBeCloseTo(2);
 });
 it('checkpoints one record without duplicates, counts no paused or invalid time, and saves before reset',()=>{
  const store=new RideStore(()=>memory()),recorder=new RideRecorder(store);
  for(let i=0;i<20;i++)recorder.tick('kaleidoscope','scenic',sample(start),start,.1,results());
  recorder.checkpoint();recorder.checkpoint();const first=store.records()[0];
  for(const dt of [0,-1,Infinity,NaN,1])recorder.tick('kaleidoscope','scenic',sample(start),start,dt,results());
  recorder.checkpoint();expect(store.records()).toEqual([first]);
  recorder.reset();expect(store.records()).toHaveLength(1);expect(store.records()[0].status).toBe('saved');expect(store.records()[0].tunnelSeconds).toBeCloseTo(2);expect(store.records()[0].bestStreak).toBe(20);
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start+1000),start+1000,.1,results());recorder.finish();expect(store.records()).toHaveLength(2);expect(store.records()[0].rings).toBe(2);
 });
 it('autosaves during a long ride and splits simulated and real telemetry without counting simulation in totals',()=>{
  const disk=memory(),store=new RideStore(()=>disk),recorder=new RideRecorder(store);
  for(let i=0;i<110;i++)recorder.tick('road','arcade',sample(start+i*100,{},true),start+i*100,.1,results(i));
  expect(disk.getItem(RIDES_KEY)).not.toBeNull();expect(store.records()).toHaveLength(1);
  for(let i=0;i<20;i++)recorder.tick('road','arcade',sample(start+12000+i*100),start+12000+i*100,.1,results(120+i));recorder.finish();
  expect(store.records()).toHaveLength(2);expect(diaryTotals(store.records(),new Date(start+20000)).all.rides).toBe(1);expect(diaryTotals(store.records(),new Date(start+20000)).all.seconds).toBeCloseTo(2);expect(store.records().find(r=>!r.simulated)!.score).toBe(30);
 });
 it('starts a new session after a long paused gap and ignores empty non-pedalling sessions',()=>{
  const store=new RideStore(()=>memory()),recorder=new RideRecorder(store);
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start,{cadence:0}),start,.1,results());recorder.finish();expect(store.records()).toHaveLength(0);
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start),start,.1,results());recorder.checkpoint();
  for(let i=0;i<20;i++)recorder.tick('valley','scenic',sample(start+3600000),start+3600000,.1,results());recorder.finish();expect(store.records()).toHaveLength(2);
 });
 it('round trips and merges backups without duplicate rides or accepting corrupted data',()=>{
  const store=new RideStore(()=>memory());ride(store);const backup=store.export(),restored=new RideStore(()=>memory());
  expect(restored.import(backup)).toBe(1);restored.import(backup);expect(restored.records()).toEqual(store.records());
  const bad=JSON.parse(backup);bad.rides[0].activeSeconds=-1;expect(()=>restored.import(JSON.stringify(bad))).toThrow();expect(restored.records()).toEqual(store.records());
  bad.rides[0].activeSeconds=999;expect(()=>validateRides(bad)).toThrow();expect(()=>restored.import('{')).toThrow();
 });
 it('keeps unsaved rides exportable after quota failure and protects unreadable existing data',()=>{
  const disk=memory(),store=new RideStore(()=>({getItem:disk.getItem,setItem:()=>{throw new Error('quota');}}));ride(store);expect(store.warning).toContain('could not save');expect(JSON.parse(store.export()).rides).toHaveLength(1);
  disk.map.set(RIDES_KEY,'corrupt original');const blocked=new RideStore(()=>disk);ride(blocked);expect(disk.getItem(RIDES_KEY)).toBe('corrupt original');expect(blocked.warning).toContain('could not be read');expect(JSON.parse(blocked.export()).rides).toHaveLength(1);
 });
 it('deletes a ride without letting a late checkpoint recreate it',()=>{
  const store=new RideStore(()=>memory()),r=ride(store);store.remove(r.id);store.put(r);expect(store.records()).toHaveLength(0);
 });
 it('uses local Monday and calendar-month totals and leaves simulated records out',()=>{
  const store=new RideStore(()=>memory()),r=ride(store),now=new Date(2026,10,17,12),monday=new Date(2026,10,16,12),sunday=new Date(2026,10,15,12);
  const all=[{...r,id:'monday',startedAt:monday.toISOString()},{...r,id:'sunday',startedAt:sunday.toISOString()},{...r,id:'sim',startedAt:monday.toISOString(),simulated:true}];
  expect(diaryTotals(all,now).week.rides).toBe(1);expect(diaryTotals(all,now).month.rides).toBe(2);
 });
});
