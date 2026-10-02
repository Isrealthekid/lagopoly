import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Sculpture, pieceHeading } from '../src/components/Tabletop';
describe('tabletop token silhouettes and headings',()=>{
 it('faces the clockwise path on all four edges and corners',()=>{
  for(let id=0;id<40;id++)expect(pieceHeading(id)).toBe([180,-90,0,90][Math.floor(id/10)]);
 });
 it('renders six distinct metallic silhouettes',()=>{
  const models=Array.from({length:6},(_,token)=>renderToStaticMarkup(Sculpture({token,color:'#186648',finish:'silver'})));
  expect(new Set(models.map(model=>model.replace(/model-\d/g,'model'))).size).toBe(6);
  for(const model of models)expect(model).toContain('solid-face');
 });
});
