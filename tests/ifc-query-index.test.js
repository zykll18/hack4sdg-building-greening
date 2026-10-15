import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IfcAPI, IFCPROJECT, IFCRELDEFINESBYPROPERTIES, IFCRELDEFINESBYTYPE, IFCRELASSOCIATESMATERIAL } from 'web-ifc';
import { readIfcRelationships } from '../src/adapters/ifc-query-index.js';
import { buildAgentContext, createGreeningTools } from '../src/domain/greening-agent.js';

test('component indexing resolves type properties, occurrence overrides, material layers and declared quantity units', async () => {
  const ref = value => ({ value });
  const lines = new Map([
    [1,{GlobalId:ref('wall')}],[2,{GlobalId:ref('wall-type'),HasPropertySets:[ref(3)]}],
    [3,{GlobalId:ref('type-pset'),Name:ref('Pset_WallCommon'),HasProperties:[ref(4)]}],
    [4,{Name:ref('IsExternal'),NominalValue:ref(false)}],
    [5,{GlobalId:ref('direct-pset'),Name:ref('Pset_WallCommon'),HasProperties:[ref(6)]}],
    [6,{Name:ref('IsExternal'),NominalValue:ref(true)}],
    [7,{GlobalId:ref('quantities'),Name:ref('BaseQuantities'),Quantities:[ref(8)]}],
    [8,{Name:ref('Height'),LengthValue:ref(2700)}],
    [9,{UnitsInContext:ref(10)}],[10,{Units:[ref(11)]}],[11,{UnitType:ref('LENGTHUNIT'),Name:ref('METRE'),Prefix:ref('MILLI')}],
    [12,{ForLayerSet:ref(13)}],[13,{MaterialLayers:[ref(14)]}],[14,{LayerThickness:ref(300),Material:ref(15)}],[15,{Name:ref('Concrete')}],
    [21,{RelatingType:ref(2),RelatedObjects:[ref(1)]}],
    [22,{RelatingPropertyDefinition:ref(5),RelatedObjects:[ref(1)]}],
    [23,{RelatingPropertyDefinition:ref(7),RelatedObjects:[ref(1)]}],
    [24,{RelatingMaterial:ref(12),RelatedObjects:[ref(2)]}]
  ]);
  const ids = new Map([[IFCPROJECT,[9]],[IFCRELDEFINESBYTYPE,[21]],[IFCRELDEFINESBYPROPERTIES,[22,23]],[IFCRELASSOCIATESMATERIAL,[24]]]);
  let closed = false;
  const api = { OpenModel:()=>0,GetLine:(_,id)=>lines.get(id),GetLineIDsWithType:(_,type)=>({size:()=>(ids.get(type)??[]).length,get:i=>ids.get(type)[i]}),CloseModel(){closed=true;} };
  const result = await readIfcRelationships(new Uint8Array(),{api});
  assert.equal(closed,true);
  const properties=result.elementProperties.get('wall');
  assert.equal(properties.find(p=>p.name==='Pset_WallCommon.IsExternal').value,true);
  assert.deepEqual(properties.find(p=>p.name==='BaseQuantities.Height'),{name:'BaseQuantities.Height',value:2700,unit:'MILLIMETRE'});
  assert.ok(properties.some(p=>p.name.endsWith('.Material.Name')&&p.value==='Concrete'));
  assert.ok(properties.some(p=>p.name.endsWith('.Thickness')&&p.value===300&&p.unit==='MILLIMETRE'));
  assert.ok(result.references.get('wall').propertySets.includes('type-pset'));
});

test('real KIT wall materials and engineering quantities reach the AI inspection tool', async () => {
  const api=new IfcAPI();
  await api.Init(name=>resolve('node_modules/web-ifc',name));
  try {
    const result=await readIfcRelationships(new Uint8Array(readFileSync(new URL('../public/samples/KIT-Office.ifc',import.meta.url))),{api});
    const id='2oOoWKmmfChQTLCBzuB3$b';
    const properties=result.elementProperties.get(id);
    assert.ok(properties.length>50);
    const catalog=JSON.parse(readFileSync(new URL('../src/data/plants.json',import.meta.url)));
    const context=buildAgentContext({question:'这面墙是什么材料，多厚？',modelVersion:'test',buildingName:'Public KIT Office sample',language:'zh-CN',buildingIndex:[{globalId:id,name:'Wand-010',category:'IFCWALLSTANDARDCASE',properties,relations:result.references.get(id),surfaces:[]}],selected:[],history:[],projectState:[],relationshipStatus:result.status},catalog);
    const tools=createGreeningTools(context,catalog).definitions;
    const material=await tools.inspectLocation.execute({globalId:id,propertySearch:'Material'});
    assert.ok(material.properties.some(p=>p.value==='Kalksandstein 2816491304'));
    assert.ok(material.properties.some(p=>p.name.endsWith('.Thickness')&&p.value===.3&&p.unit==='METRE'));
    const quantities=await tools.inspectLocation.execute({globalId:id,propertySearch:'BaseQuantities'});
    assert.ok(quantities.properties.some(p=>p.name==='BaseQuantities.Height'&&p.value===2.7&&p.unit==='METRE'));
    assert.ok(quantities.properties.some(p=>p.name==='BaseQuantities.NetSideArea'&&p.unit==='SQUARE_METRE'));
  } finally { api.Dispose(); }
});
