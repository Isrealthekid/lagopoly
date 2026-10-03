import { afterEach, expect, it, vi } from 'vitest';
import { secureDie } from '../src/game/random';
afterEach(()=>vi.unstubAllGlobals());
it('rejects overflow samples and allows repeated rolls',()=>{
  const samples=[0xffffffff,0xfffffffc,0,0,1,2,3,4,5];
  const next=vi.fn((array:Uint32Array)=>{array[0]=samples.shift()!;return array;});
  vi.stubGlobal('crypto',{getRandomValues:next});
  expect(Array.from({length:7},secureDie)).toEqual([1,1,2,3,4,5,6]);
  expect(next).toHaveBeenCalledTimes(9);
});
