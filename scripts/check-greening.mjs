import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { IfcImporter, SingleThreadedFragmentsModel } from '@thatopen/fragments';
import { extractGreeningSurface, groundSurface, coveredSurface, cropGreeningSurface } from '../src/adapters/greening-geometry.js';
import { calculatePlan, PLANS } from '../src/domain/greening-plan.js';
const root=resolve(import.meta.dirname,'..');
const input=process.argv[2] ?? resolve(root,'public/samples/KIT-Office.ifc');
const bytes=new Uint8Array(await readFile(input));
const version='offline-source-check';
const importer=new IfcImporter();importer.wasm={path:resolve(root,'node_modules/web-ifc')+'/',absolute:true};
const model=new SingleThreadedFragmentsModel(version,await importer.process({bytes}));
try {
 const ids=model.getItemsIdsWithGeometry();
 const categories=model.getItemsOfCategories([/^(IFCSLAB|IFCROOF|IFCWALL|IFCWALLSTANDARDCASE)$/]);
 const box=new THREE.Box3();
 const meshes=new Map();
 for(const id of ids){const parts=model.getItemsGeometry([id])[0]??[];meshes.set(id,parts);for(const part of parts){if(!part.positions)continue;const p=new THREE.Vector3();for(let i=0;i<part.positions.length;i+=3)box.expandByPoint(p.fromArray(part.positions,i).applyMatrix4(part.transform));}}
 const center=box.getCenter(new THREE.Vector3());
 const regions=[], checks=[];
 for(const type of ['roof','facade','terrace','ground']){
  let surface,selectedId=null;
  if(type==='ground')surface=groundSurface({x:center.x,y:box.min.y+.04,z:box.max.z+4,width:10,depth:6});
  else {
   const candidates=type==='facade'?[...(categories.IFCWALL??[]),...(categories.IFCWALLSTANDARDCASE??[])]:[...(categories.IFCROOF??[]),...(categories.IFCSLAB??[])];
   if(type==='roof')candidates.sort((a,b)=>Number(/roof|dach/i.test(model.getItemsData([b])[0]?.Name?.value??''))-Number(/roof|dach/i.test(model.getItemsData([a])[0]?.Name?.value??'')));
   for(const id of candidates){if(regions.some(r=>r.localId===id))continue;try{surface=extractGreeningSurface(meshes.get(id)??[],new THREE.Matrix4(),type,center);if(type==='terrace')surface=cropGreeningSurface(surface,{side:'front',depth:2});selectedId=id;break;}catch{}}
   if(!surface)throw new Error(`No geometry found for ${type}`);
  }
  const guid=selectedId===null?null:model.getGuidsByLocalIds([selectedId])[0];
  const id=`check-${type}`,area=surface.surfaceAreaM2;
  regions.push({id,projectId:'geometry-check',modelVersion:version,type,localId:selectedId,globalId:guid,name:id,geometrySource:type==='ground'?'user-defined rectangle':'original IFC triangles',usableArea:{value:area,unit:'m2',provenance:'user-confirmed',source:'Synthetic confirmation for data-path testing only; not a real user or engineering approval'}});
  for(const plan of PLANS){const positions=coveredSurface(surface,plan.profiles[type].coverageFraction);let renderedArea=0;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();for(let i=0;i<positions.length;i+=9){a.fromArray(positions,i);b.fromArray(positions,i+3);c.fromArray(positions,i+6);renderedArea+=b.sub(a).cross(c.sub(a)).length()/2;}if(Math.abs(renderedArea-area*plan.profiles[type].coverageFraction)>Math.max(.02,area*.0002))throw new Error('Overlay area differs from calculation coverage');}
  checks.push({type,localId:selectedId,globalId:guid,surfaceAreaM2:area});
 }
 const results=PLANS.map(plan=>calculatePlan({regions,plan,years:20}));
 if(results.some(result=>result.items.length!==4))throw new Error('A region was lost in the plan output');
 console.log(JSON.stringify({input,displayComponents:ids.length,geometryChecks:checks,plans:results.map(({planId,coverageM2,totalCostHkd})=>({planId,coverageM2,totalCostHkd})),note:'Data-path test only; terrace/roof use assigned synthetically. Not browser, spatial suitability or engineering acceptance.'},null,2));
}finally{model.dispose();}
