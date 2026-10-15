import test from 'node:test';
import assert from 'node:assert/strict';
import {createInspectionSelection} from '../src/domain/planting-selection.js';

test('click selection toggles independently, keeps other locations and returns newest first',()=>{
 const selections=createInspectionSelection();
 const a={globalId:'a',localId:1,modelVersion:'v1'},b={globalId:'b',localId:2,modelVersion:'v1'};
 const planted={globalId:'a',planting:{plantId:'ficus-pumila',coverageFraction:.4}};
 const before=JSON.stringify(planted);
 assert.equal(selections.toggle(a,'v1'),true);assert.equal(selections.toggle(b,'v1'),true);
 assert.deepEqual(selections.items().map(x=>x.globalId),['b','a']);
 assert.equal(selections.toggle(a,'v1'),false);assert.deepEqual(selections.items(),[b]);
 assert.equal(JSON.stringify(planted),before);
 assert.equal(selections.toggle(a,'v1'),true);assert.deepEqual(selections.items().map(x=>x.globalId),['a','b']);
 selections.remove('b');assert.deepEqual(selections.items(),[a]);
 assert.equal(selections.toggle({...b,modelVersion:'old'},'v1'),false);assert.deepEqual(selections.items(),[a]);
 selections.clear();assert.deepEqual(selections.items(),[]);
});
