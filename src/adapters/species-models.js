import * as THREE from 'three';

// Authored concept proportions and colours; not measured mature botanical dimensions.
export const SPECIES_MODELS = {
  'sedum-lineare': { shape: 'succulent', colour: '#679448', flower: '#efd449', flowerShape: 'star', radius: .17, height: .16, spacing: .36, leafLength: .065 },
  'arachis-pintoi': { shape: 'oval', colour: '#39814c', flower: '#f6d239', flowerShape: 'pea', radius: .19, height: .19, spacing: .42, leafLength: .095 },
  'ophiopogon-japonicus': { shape: 'grass', colour: '#315c3b', flower: null, radius: .23, height: .32, spacing: .53, leafLength: .30 },
  'ficus-pumila': { shape: 'heart', colour: '#408151', flower: null, radius: .17, height: .18, spacing: .68, leafLength: .14 },
  'trachelospermum-jasminoides': { shape: 'lance', colour: '#2d7040', flower: '#fff8e6', flowerShape: 'star', radius: .18, height: .21, spacing: .72, leafLength: .17 },
  'parthenocissus-dalzielii': { shape: 'lobed', colour: '#588c43', flower: null, radius: .21, height: .22, spacing: .8, leafLength: .19 },
  'bougainvillea-spectabilis': { shape: 'oval', colour: '#39733f', flower: '#bd4f88', flowerShape: 'bract', radius: .26, height: .48, spacing: .86, leafLength: .16 }
};
const UP = new THREE.Vector3(0,1,0);

export function speciesLeafGeometry(shape) {
  const g = new THREE.BufferGeometry(), positions = [];
  let outline;
  if (shape === 'heart') outline = [[0,0],[-.34,.22],[-.48,.60],[-.31,.86],[0,.74],[.31,.86],[.48,.60],[.34,.22]];
  else if (shape === 'lobed') outline = [[0,0],[-.28,.19],[-.54,.48],[-.22,.43],[-.29,.76],[0,1],[.29,.76],[.22,.43],[.54,.48],[.28,.19]];
  else {
    const width = shape === 'succulent' ? .16 : shape === 'lance' ? .19 : .35;
    outline = Array.from({length:12},(_,i)=>{const t=i*Math.PI/6;return [Math.sin(t)*width,.5-Math.cos(t)*.5];});
  }
  for (let i=0;i<outline.length;i++) positions.push(0,.48,.09,...outline[i],0,...outline[(i+1)%outline.length],0);
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals(); return g;
}
export function speciesFlowerGeometry(kind = 'star') {
  const positions=[], petals=kind==='bract'?3:kind==='pea'?3:5;
  for(let p=0;p<petals;p++) {
    const angle=p*2*Math.PI/petals, length=kind==='pea'&&p===0?1.2:1;
    const point=(r,a,z)=>[Math.cos(a)*r,Math.sin(a)*r,z];
    const a=point(.18,angle-.6,.04),b=point(length,angle-.22,.12),c=point(length*.88,angle+.27,.05),d=point(.18,angle+.6,.04);
    positions.push(0,0,0,...a,...b,0,0,0,...b,...c,0,0,0,...c,...d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();return g;
}
function instances(group,geometry,colour,entries,name) {
  if(!entries.length){geometry.dispose();return;}
  const material=new THREE.MeshStandardMaterial({color:colour,roughness:.86,side:THREE.DoubleSide});
  const mesh=new THREE.InstancedMesh(geometry,material,entries.length), o=new THREE.Object3D();mesh.name=name;
  for(let i=0;i<entries.length;i++) { const entry=entries[i];o.position.copy(entry.position);o.quaternion.copy(entry.quaternion??new THREE.Quaternion());o.scale.copy(entry.scale);o.updateMatrix();mesh.setMatrixAt(i,o.matrix); }
  mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
}

/** A reusable single clump / vine segment, authored entirely in this application. */
export function createSpeciesModel(plantId) {
  const spec=SPECIES_MODELS[plantId];if(!spec)throw new Error('Unknown species model');
  const group=new THREE.Group();group.name=plantId;group.userData={plantId,modelKind:'procedural-concept',dimensionBasis:'Authored display proportions, not verified mature size'};
  const leaves=[],stems=[],flowers=[];
  const addLeaf=(position,direction,length,width=1)=>leaves.push({position,quaternion:new THREE.Quaternion().setFromUnitVectors(UP,direction.normalize()),scale:new THREE.Vector3(length*width,length,length)});
  const stem=(a,b)=>stems.push({position:a.clone().add(b).multiplyScalar(.5),quaternion:new THREE.Quaternion().setFromUnitVectors(UP,b.clone().sub(a).normalize()),scale:new THREE.Vector3(.004,a.distanceTo(b),.004)});
  if(spec.shape==='grass') {
    // Bent tapering ribbons make a grass clump instead of a generic shrub.
    const pos=[];
    for(let blade=0;blade<28;blade++) {
      const angle=blade*2.39996, length=.22+(blade%7)*.017, spread=.08+(blade%5)*.012;
      for(let j=0;j<7;j++) {
        const point=(t,side)=>{const width=.009*(1-t);return [Math.cos(angle)*spread*t*t-Math.sin(angle)*width*side,length*(t-.18*t*t),Math.sin(angle)*spread*t*t+Math.cos(angle)*width*side];};
        const a=point(j/7,-1),b=point(j/7,1),c=point((j+1)/7,1),d=point((j+1)/7,-1);pos.push(...a,...b,...c,...a,...c,...d);
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:spec.colour,side:THREE.DoubleSide,roughness:.9}));mesh.name='Mondo grass curved blades';group.add(mesh);return group;
  }
  if(['ficus-pumila','trachelospermum-jasminoides','parthenocissus-dalzielii','bougainvillea-spectabilis'].includes(plantId)) {
    for(let vine=0;vine<2;vine++) {
      let previous=new THREE.Vector3((vine-.5)*.08,0,0);
      for(let j=1;j<=12;j++) {
        const point=new THREE.Vector3((vine-.5)*.08+Math.sin(j*.75+vine)*.035,j*.065,Math.sin(j*.4)*.012);
        stem(previous,point);
        const side=j%2?1:-1;
        addLeaf(point.clone(),new THREE.Vector3(side,.35,.25),spec.leafLength);
        if(spec.flower&&j%3===0) {
          const size=spec.flowerShape==='bract'?.055:.037;
          flowers.push({position:point.clone().add(new THREE.Vector3(side*.15,.035,.085)),scale:new THREE.Vector3(size,size,size)});
        }
        previous=point;
      }
    }
    instances(group,speciesLeafGeometry(spec.shape),spec.colour,leaves,'Climber species leaves');
    instances(group,new THREE.CylinderGeometry(1,1,1,5),'#68834e',stems,'Climber species stems');
    if(spec.flower)instances(group,speciesFlowerGeometry(spec.flowerShape),spec.flower,flowers,'Species flowers / bracts');
    return group;
  }
  const clumps=spec.shape==='succulent'?8:spec.shape==='oval'&&plantId==='arachis-pintoi'?6:3;
  for(let c=0;c<clumps;c++) {
    const angle=c*2.39996, base=new THREE.Vector3(Math.cos(angle)*spec.radius*.45,0,Math.sin(angle)*spec.radius*.45), top=base.clone().add(new THREE.Vector3(Math.cos(angle)*.035,spec.height*(.7+(c%3)*.13),Math.sin(angle)*.035));
    stem(base,top);
    const count=spec.shape==='succulent'?10:6;
    for(let j=0;j<count;j++) {
      const t=.2+.72*j/count, a=j*2.4+c, position=base.clone().lerp(top,t), direction=new THREE.Vector3(Math.cos(a),.35,Math.sin(a));
      addLeaf(position,direction,spec.leafLength*(.8+(j%3)*.1),spec.shape==='succulent'?1:1.05);
      if(plantId==='arachis-pintoi') addLeaf(position.clone().add(new THREE.Vector3(.014,.004,.014)),direction.clone().multiplyScalar(-1).setY(.25),spec.leafLength*.8);
    }
    if(spec.flower&&c%2===0) flowers.push({position:top.clone().addScaledVector(UP,.01),quaternion:new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),scale:new THREE.Vector3(.022,.022,.022)});
  }
  instances(group,speciesLeafGeometry(spec.shape),spec.colour,leaves,'Species leaves');
  instances(group,new THREE.CylinderGeometry(1,1,1,5),'#68834e',stems,'Species stems');
  if(spec.flower)instances(group,speciesFlowerGeometry(spec.flowerShape),spec.flower,flowers,'Species flowers / bracts');
  return group;
}
export function disposeSpeciesModel(group) {
  const geometries=new Set(),materials=new Set();
  group.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of [].concat(o.material??[]))materials.add(m);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
}

/** Flatten an authored clump into prototypes for efficient repeated placement. */
export function speciesModelParts(plantId) {
  const model=createSpeciesModel(plantId),parts=[];model.updateMatrixWorld(true);
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const geometries=[];
    for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++) {
      const matrix=new THREE.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(i,matrix);
      matrix.premultiply(mesh.matrixWorld);
      const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();g.applyMatrix4(matrix);geometries.push(g);
    }
    const positions=[],normals=[];
    for(const g of geometries){positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);g.dispose();}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    parts.push({geometry,material:mesh.material.clone(),name:mesh.name});
  });
  disposeSpeciesModel(model);return parts;
}
