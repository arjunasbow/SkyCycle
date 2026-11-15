import { expect, it } from 'vitest';
import * as THREE from 'three';
import { initialFlight, createCourse, collectTargets, BIKE_HIT_HEIGHT } from './flight';
import { initialValleyCompanion, stepValleyCompanion } from './valley-companion';
import { createWorld } from './world';

it('earns a companion only after 30 active seconds and restarts the wait outside the route', () => {
  const state=initialValleyCompanion(), pose=initialFlight(), targets=createCourse();
  for(let i=0;i<1799;i++)stepValleyCompanion(state,pose,pose,targets,1/60);
  expect(state.earned).toBe(false);stepValleyCompanion(state,pose,pose,targets,1/60);expect(state.earned).toBe(true);
  const outside={...pose,y:100};stepValleyCompanion(state,pose,outside,targets,1/60);expect(state.inside).toBe(false);expect(state.streak).toBe(0);expect(state.earned).toBe(false);
  for(let i=0;i<1799;i++)stepValleyCompanion(state,pose,pose,targets,1/60);
  expect(state.earned).toBe(false);stepValleyCompanion(state,pose,pose,targets,1/60);expect(state.earned).toBe(true);
  stepValleyCompanion(state,pose,pose,targets,1/60,true,false);expect(state.earned).toBe(false);expect(state.streak).toBe(0);
});
it('interpolates the course between targets, ignores bonus balloons and notices missed rings', () => {
  const state=initialValleyCompanion(), targets=createCourse(), t=.5;
  targets.push({x:450,y:150,z:-100,radius:15,kind:'balloon',bonus:true,hit:false});
  const pose={...initialFlight(),x:targets[0].x+(targets[1].x-targets[0].x)*t,y:targets[0].y+(targets[1].y-targets[0].y)*t-BIKE_HIT_HEIGHT,z:(targets[0].z+targets[1].z)/2+1.8};
  for(let i=0;i<1800;i++)stepValleyCompanion(state,pose,pose,targets,1/60);
  expect(state.earned).toBe(true);
  const before={...initialFlight(),x:8.5,y:45-BIKE_HIT_HEIGHT,z:-47},after={...before,z:-50};
  expect(collectTargets(before,after,targets)).toBe(0);stepValleyCompanion(state,before,after,targets,1/60);
  expect(state.inside).toBe(true);expect(state.earned).toBe(false);expect(state.streak).toBe(0);
  const snapshot=JSON.stringify(targets);stepValleyCompanion(state,pose,pose,targets,1/60);expect(JSON.stringify(targets)).toBe(snapshot);
});
it('preserves a streak through a collected ring and freezes for pause and invalid steps', () => {
  const state=initialValleyCompanion(),targets=createCourse(),before={...initialFlight(),y:45-BIKE_HIT_HEIGHT,z:-47},after={...before,z:-50};state.streak=30;state.earned=true;
  expect(collectTargets(before,after,targets)).toBe(100);stepValleyCompanion(state,before,after,targets,1/60);expect(state.earned).toBe(true);
  const snapshot={...state};
  stepValleyCompanion(state,before,{...after,y:200},targets,1/60,false);
  for(const dt of [0,-1,NaN,Infinity,1])stepValleyCompanion(state,before,after,targets,dt);
  expect(state).toEqual(snapshot);
});
it('flies the ordinary bird in, flits beside the bicycle and departs without allocating objects', () => {
  const world=createWorld('low','valley'),state=initialValleyCompanion(),bird=world.scene.getObjectByName('valley-curious-bird')!;
  expect(bird.visible).toBe(false);let count=0;world.scene.traverse(()=>count++);
  state.earned=true;state.streak=30;
  for(let i=0;i<121;i++)world.updateValley!(30+i/60,state,false);
  expect(bird.visible).toBe(true);expect(bird.position.x-world.bike.position.x).toBeLessThan(7);
  const first=bird.position.clone();world.updateValley!(33,state,false);expect(bird.position).not.toEqual(first);
  world.updateValley!(33,state,false);const paused=bird.position.clone();world.updateValley!(33,state,false);expect(bird.position).toEqual(paused);
  state.earned=false;for(let i=1;i<=70;i++)world.updateValley!(33+i/60,state,false);expect(bird.visible).toBe(false);
  state.earned=true;world.updateValley!(35,state,true);const still=bird.position.clone();world.updateValley!(45,state,true);expect(bird.position).toEqual(still);
  world.resetValley!();expect(bird.visible).toBe(false);
  let after=0;world.scene.traverse(()=>after++);expect(after).toBe(count);
  expect(world.scene.getObjectByName('valley-zeppelins')!.children).toHaveLength(2);
  expect(world.scene.getObjectByName('valley-zeppelin-0')!.position.x).toBeLessThan(-250);
  const objects=world.targets.map(t=>({...t}));world.updateValley!(50,state,false);expect(world.targets).toEqual(objects);
  world.dispose();expect(world.scene.children).toHaveLength(0);
});
