import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Retain the last prompt during its exit, so the next phase never flashes early. */
export function PromptPresence({ visible, children, motion }: { visible:boolean; children:ReactNode; motion:boolean }) {
  const [phase,setPhase]=useState(visible?'entering':'hidden');
  const content=useRef(children);
  if(visible)content.current=children;
  useLayoutEffect(()=>{
    if(visible){setPhase('entering');const timer=setTimeout(()=>setPhase('visible'),240);return ()=>clearTimeout(timer);}
    if(!motion||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setPhase('hidden');return;}
    setPhase(previous=>previous==='hidden'?'hidden':'exiting');
    const timer=setTimeout(()=>setPhase('hidden'),180);return ()=>clearTimeout(timer);
  },[visible,motion]);
  return <div className={`prompt-presence ${motion?'':'no-prompt-motion'}`} data-presence={phase} inert={!visible} hidden={phase==='hidden'}>{phase!=='hidden'&&content.current}</div>;
}
