// x/y anchors, radius, and a distinct phase for each edge of the composition.
// Positions use viewport-height units so the shader's forms stay circular.
const FORMS=new Float64Array([
  .04,.03,.46,.3,
  1.04,.43,.43,2.1,
  .85,1.06,.38,4.4,
  .12,1.10,.34,5.7,
]);
const MAX_DELTA=.05;
const SPRING_FREQUENCY=8;

/**
 * Four independently drifting pigment centers with damped pointer repulsion.
 * update() always returns the same [x,y,radius] Float32Array. Consumers that
 * retain a historical sample must copy it. Pointer y is normalized bottom-up.
 */
export function createFlowField() {
  const values=new Float32Array(12);
  const offsets=new Float64Array(8);
  const velocities=new Float64Array(8);

  function update(deltaSeconds,elapsedSeconds,aspect,pointerXNormalized,pointerYNormalizedBottomUp,pointerStrength) {
    const dt=Number.isFinite(deltaSeconds)?Math.max(0,Math.min(MAX_DELTA,deltaSeconds)):0;
    const time=Number.isFinite(elapsedSeconds)?elapsedSeconds:0;
    const ratio=Number.isFinite(aspect)&&aspect>0?aspect:1;
    const scale=Math.min(1,Math.max(.43,ratio/.95));
    const strength=Number.isFinite(pointerStrength)?Math.max(0,Math.min(1,pointerStrength)):0;
    const pointerX=(Number.isFinite(pointerXNormalized)?pointerXNormalized:.5)*ratio;
    const pointerY=Number.isFinite(pointerYNormalizedBottomUp)?pointerYNormalizedBottomUp:.5;
    const decay=Math.exp(-SPRING_FREQUENCY*dt);

    for(let index=0;index<4;index++) {
      const source=index*4,point=index*3,motion=index*2;
      const phase=FORMS[source+3];
      const frequency=.19+index*.033;
      const x=FORMS[source]*ratio+scale*(.064*Math.sin(time*frequency+phase)+.016*Math.sin(time*.53+phase*1.7));
      const y=FORMS[source+1]+scale*(.062*Math.cos(time*(frequency+.031)+phase)+.018*Math.sin(time*.37+phase*.6));
      const radius=FORMS[source+2]*scale*(1+.03*Math.sin(time*.29+phase));
      let targetX=0,targetY=0;

      if(strength>0) {
        let awayX=x-pointerX,awayY=y-pointerY;
        const distance=Math.hypot(awayX,awayY);
        const reach=radius*1.45+.04*scale;
        if(distance<reach) {
          // A pointer exactly at the center gets a deterministic direction.
          if(distance<.00001){awayX=Math.cos(phase);awayY=Math.sin(phase);}
          else {awayX/=distance;awayY/=distance;}
          const proximity=1-distance/reach;
          const influence=proximity*proximity*(3-2*proximity);
          const push=.22*scale*strength*influence;
          targetX=awayX*push;targetY=awayY*push;
        }
      }

      // Exact critically damped spring step. Capping dt also prevents a tab
      // returning from suspension from skipping the visible recovery motion.
      let error=offsets[motion]-targetX;
      let change=(velocities[motion]+SPRING_FREQUENCY*error)*dt;
      offsets[motion]=targetX+(error+change)*decay;
      velocities[motion]=(velocities[motion]-SPRING_FREQUENCY*change)*decay;
      error=offsets[motion+1]-targetY;
      change=(velocities[motion+1]+SPRING_FREQUENCY*error)*dt;
      offsets[motion+1]=targetY+(error+change)*decay;
      velocities[motion+1]=(velocities[motion+1]-SPRING_FREQUENCY*change)*decay;

      values[point]=x+offsets[motion];
      values[point+1]=y+offsets[motion+1];
      values[point+2]=radius;
    }
    return values;
  }

  return {update};
}
