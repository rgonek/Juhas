import test from 'node:test';
import assert from 'node:assert/strict';
import {typography} from '../mods/juhas/typography.js';

test('typography resolves semantic rem roles to the active user font size',()=>{
 for(const base of [12,14,20,28])for(const rem of [14,16,20]){
  const type=typography(base,rem),pixels=value=>parseFloat(value)*rem;
  assert.equal(pixels(type.body),base);
  assert.equal(type.control,type.body);assert.equal(type.code,type.body);
  assert.equal(pixels(type.caption),base*0.875);assert.equal(pixels(type.heading),base*1.125);
  assert.ok(Math.abs(type.px(29)-29*base/14)<1e-9);assert.equal(pixels(type.lineHeight),base*1.5);
 }
});
