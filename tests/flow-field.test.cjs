const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const moduleReady=import(pathToFileURL(path.resolve(__dirname,'../scripts/culture/flow-field.mjs')).href);

test('flow fields start deterministically and reuse their twelve-value buffer',async()=>{
  const {createFlowField}=await moduleReady;
  const field=createFlowField();
  const first=field.update(0,0,1.6,.5,.5,0);
  assert.ok(first instanceof Float32Array);
  assert.equal(first.length,12);
  assert.deepEqual(first,createFlowField().update(0,0,1.6,.5,.5,0));
  assert.strictEqual(field.update(1/60,1,1.6,.2,.2,1),first);
});

test('forms drift independently without pointer input and preserve a cream center',async()=>{
  const {createFlowField}=await moduleReady;
  const field=createFlowField();
  const aspect=1.6;
  const before=field.update(0,0,aspect,.5,.5,0).slice();
  const after=field.update(1/60,4,aspect,.5,.5,0);
  const directions=[];
  for(let index=0;index<4;index++) {
    const offset=index*3;
    const dx=after[offset]-before[offset],dy=after[offset+1]-before[offset+1];
    assert.ok(Math.hypot(dx,dy)>.012,`form ${index} moves on its own`);
    assert.ok(Math.hypot(dx,dy)<.23,`form ${index} stays within a gentle drift`);
    directions.push(Math.atan2(dy,dx));
    assert.ok(Math.hypot(after[offset]-aspect*.5,after[offset+1]-.5)>after[offset+2],`form ${index} leaves the center open`);
  }
  assert.ok(new Set(directions.map(angle=>angle.toFixed(1))).size>=3,'forms have independent phases, not a shared translation');
});

test('pointer repulsion moves a form away from the same-time baseline and then recovers',async()=>{
  const {createFlowField}=await moduleReady;
  const active=createFlowField(),baseline=createFlowField();
  const dt=1/60,aspect=1.6;
  let time=0,result,original;
  for(let frame=0;frame<90;frame++) {
    time+=dt;
    original=baseline.update(dt,time,aspect,.5,.5,0);
    // Keep the pointer just inside the lower-left form, on its right side.
    result=active.update(dt,time,aspect,(original[0]+.08)/aspect,original[1],1);
  }
  const displaced=Math.hypot(result[0]-original[0],result[1]-original[1]);
  assert.ok(result[0]<original[0]-.1,'the nearby form moves away from the pointer');
  assert.ok(displaced>.1 && displaced<.25,'repulsion is visible and bounded');
  for(let frame=0;frame<180;frame++) {
    time+=dt;
    original=baseline.update(dt,time,aspect,.5,.5,0);
    result=active.update(dt,time,aspect,.5,.5,0);
  }
  assert.ok(Math.hypot(result[0]-original[0],result[1]-original[1])<.0001,'removing pointer strength returns to the drifting baseline');
});

test('typical phone through ultrawide aspects stay finite and proportionally scaled',async()=>{
  const {createFlowField}=await moduleReady;
  for(const aspect of [.36,.43,.75,1,1.6,2.84,4]) {
    const field=createFlowField();
    for(let frame=0;frame<1200;frame++) {
      const time=frame/60;
      const values=field.update(1/60,time,aspect,.5+.45*Math.sin(time),.5+.45*Math.cos(time*.7),1);
      for(let index=0;index<4;index++) {
        const offset=index*3;
        assert.ok(Number.isFinite(values[offset]) && Number.isFinite(values[offset+1]) && Number.isFinite(values[offset+2]));
        assert.ok(values[offset]>-.5 && values[offset]<aspect+.6,'x stays near the composition');
        assert.ok(values[offset+1]>-.5 && values[offset+1]<1.6,'y stays near the composition');
        assert.ok(values[offset+2]>.13 && values[offset+2]<.48,'radius stays positive and bounded');
      }
    }
  }
  const desktop=createFlowField().update(0,0,1.6,.5,.5,0);
  const mobile=createFlowField().update(0,0,.36,.5,.5,0);
  assert.ok(Math.abs(mobile[2]/desktop[2]-.43)<.00001,'small phones use the minimum radius scale');
});

test('a long frame cannot overshoot or poison the spring state',async()=>{
  const {createFlowField}=await moduleReady;
  const longFrame=createFlowField(),boundedFrame=createFlowField();
  const baseline=createFlowField().update(0,0,1.6,.5,.5,0);
  const pointerX=(baseline[0]+.03)/1.6,pointerY=baseline[1];
  const actual=longFrame.update(3600,0,1.6,pointerX,pointerY,1);
  const expected=boundedFrame.update(.05,0,1.6,pointerX,pointerY,1);
  assert.deepEqual(actual,expected,'a suspended tab receives one bounded spring step');
  assert.ok(Math.hypot(actual[0]-baseline[0],actual[1]-baseline[1])<.03,'the first resumed frame does not jump across the page');
  const atCenter=createFlowField();
  const exact=atCenter.update(0,0,1.6,.5,.5,0).slice();
  const result=atCenter.update(.05,0,1.6,exact[0]/1.6,exact[1],1);
  assert.ok([...result].every(Number.isFinite),'a pointer at the center never divides by zero');
});
