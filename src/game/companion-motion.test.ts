import { expect,it } from 'vitest';
import * as THREE from 'three';
import { companionOffset } from './companion-motion';
import { createWorld } from './world';
import { initialValleyCompanion } from './valley-companion';
import { initialFlow } from './kaleidoscope';
it('brings companions from the bottom right and sends them back along that same side',()=>{
  const outside=companionOffset(new THREE.Vector3(),0,30,false),settled=companionOffset(new THREE.Vector3(),1,30,false);
  expect(outside.x).toBeGreaterThan(settled.x+20);expect(outside.y).toBeLessThan(settled.y-20);expect(outside.z).toBeGreaterThan(settled.z);
  for(const environment of ['valley','kaleidoscope'] as const){
    const world=createWorld('low',environment),flow=initialFlow(),state=initialValleyCompanion();flow.streak=30;state.earned=true;
    const update=(time:number)=>environment==='valley'?world.updateValley!(time,state,false):world.updateTunnel!(time,flow,false);
    const bird=world.scene.getObjectByName(environment==='valley'?'valley-curious-bird':'kaleidoscope-paradise-bird')!;
    update(30);const arrival=bird.position.clone();for(let i=1;i<150;i++)update(30+i/60);
    expect(arrival.x).toBeGreaterThan(bird.position.x);expect(arrival.y).toBeLessThan(bird.position.y);
    const settledPosition=bird.position.clone();state.earned=false;flow.inside=false;update(32.6);
    expect(bird.position.x).toBeGreaterThan(settledPosition.x);expect(bird.position.y).toBeLessThan(settledPosition.y);
    world.dispose();
  }
});
