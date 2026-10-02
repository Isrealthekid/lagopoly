import { useEffect, useRef, useState } from 'react';

export function piecePoint(id:number) {
  const centers=[5.435,...Array.from({length:9},(_,i)=>(1.25+i+.5)/11.5*100),94.565];
  if(id<=10)return {x:centers[10-id],y:centers[10]};
  if(id<=20)return {x:centers[0],y:centers[20-id]};
  if(id<=30)return {x:centers[id-20],y:centers[0]};
  return {x:centers[10],y:centers[id-30]};
}
function Solid({x=0,y=0,z=0,w=12,d=8,h=8,color='body',round=false}:{x?:number;y?:number;z?:number;w?:number;d?:number;h?:number;color?:string;round?:boolean}) {
 return <span className={`model-part ${color} ${round?'round':''}`} style={{'--w':`${w}px`,'--d':`${d}px`,'--h':`${h}px`,transform:`translate3d(${x}px,${y}px,${z+h/2}px)`} as React.CSSProperties}>{['front','back','left','right','top','bottom'].map(face=><i key={face} className={`solid-face ${face}`}/>)}</span>;
}
export function Sculpture({token,color,finish}:{token:number;color:string;finish:'silver'|'gold'}) {
 return <span className={`sculpture finish-${finish} model-${token}`} style={{'--model-color':color} as React.CSSProperties} aria-hidden="true">
   <Solid w={28} d={20} h={3} color="base" round/>
   {token===0&&<><Solid w={28} d={13} h={8} z={6}/><Solid w={14} d={12} h={8} z={14} color="glass"/>{[-9,9].flatMap(x=>[-7,7].map(y=><Solid key={`${x}-${y}`} x={x} y={y} z={3} w={6} d={3} h={7} color="rubber" round/>))}<Solid x={13} z={10} w={2} d={11} h={3} color="chrome"/></>}
   {token===1&&<><Solid w={28} d={12} h={7} z={4}/><Solid w={2} d={2} h={30} z={10} color="chrome"/><span className="model-sail"/><Solid w={21} d={14} h={2} z={10} color="chrome"/></>}
   {token===2&&<>{[-10,10].map(x=><Solid key={x} x={x} w={11} d={3} h={12} z={5} color="rubber" round/>)}<Solid w={22} d={4} h={3} z={12}/><Solid w={3} d={3} h={13} z={11}/><Solid x={9} w={2} d={10} h={2} z={23} color="chrome"/><Solid x={-3} w={8} d={6} h={2} z={24} color="rubber"/></>}
   {token===3&&<><Solid w={31} d={6} h={6} z={11}/><Solid w={12} d={30} h={2} z={13} color="chrome"/><Solid x={-11} w={7} d={17} h={2} z={14}/><Solid x={-12} w={6} d={2} h={8} z={16}/><Solid w={7} d={4} h={3} z={17} color="glass"/></>}
   {token===4&&<><Solid w={4} d={4} h={29} z={5} color="chrome"/><Solid w={21} d={4} h={4} z={21}/><Solid w={25} d={5} h={4} z={7}/><Solid x={-11} w={4} d={5} h={9} z={7}/><Solid x={11} w={4} d={5} h={9} z={7}/><Solid w={8} d={5} h={5} z={33} color="chrome" round/></>}
   {token===5&&<><Solid w={21} d={18} h={19} z={4}/><Solid w={25} d={22} h={5} z={23} color="roof"/><Solid w={17} d={22} h={4} z={28} color="roof"/><Solid w={8} d={22} h={4} z={32} color="roof"/><Solid x={4} y={-10} w={7} d={1} h={8} z={10} color="glass"/></>}
 </span>;
}
const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function adjacent(value:number){const other=[1,2,3,4,5,6].filter(n=>n!==value&&n!==7-value);return [other[0],other.find(n=>n!==other[0]&&n!==7-other[0])!];}
function Face({value,name}:{value:number;name:string}){return <span className={`die-face face-${name}`}>{Array.from({length:9},(_,i)=><i key={i} className={dots[value].includes(i)?'pip':''}/>)}</span>;}
export function DiceTray({dice,rolling,seed,reduced}:{dice:[number,number];rolling:boolean;seed:number;reduced:boolean}) {
 const [faces,setFaces]=useState(dice);
 const [landings,setLandings]=useState([{x:-25,y:0,r:-12},{x:25,y:-10,r:18}]);
 const wasRolling=useRef(false);
 const previousSeed=useRef(seed);
 useEffect(()=>{
  let interval:ReturnType<typeof setInterval>|undefined;
  const scatter=()=>setLandings(last=>last.map((p,i)=>({x:(i===0?-1:1)*(22+Math.random()*18),y:p.y>=0?-12-Math.random()*15:8+Math.random()*15,r:(Math.random()-.5)*60})));
  if(rolling){wasRolling.current=true;scatter();interval=setInterval(()=>setFaces([1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)]),90);}
  else {
   setFaces(dice);
   if(!wasRolling.current&&previousSeed.current!==seed){
    // Opposite halves keep the cubes apart; alternating rows prevent identical consecutive landings.
    scatter();
   }
   wasRolling.current=false;previousSeed.current=seed;
  }
  return ()=>{if(interval)clearInterval(interval);};
 },[rolling,dice[0],dice[1],seed]);
 return <div className={`dice-tray cube-tray ${rolling&&!reduced?'tumbling':''}`} aria-label={rolling?'Dice rolling':`Dice: ${dice.join(' and ')}`} aria-live="polite">{faces.map((value,i)=><span key={i} className="dice-landing" style={{'--land-x':`${landings[i].x}px`,'--land-y':`${landings[i].y}px`,'--land-r':`${landings[i].r}deg`} as React.CSSProperties}><span className={`die cube ${rolling?'rolling':''}`}><Face value={value} name="front"/><Face value={7-value} name="back"/><Face value={adjacent(value)[0]} name="right"/><Face value={7-adjacent(value)[0]} name="left"/><Face value={adjacent(value)[1]} name="top"/><Face value={7-adjacent(value)[1]} name="bottom"/></span></span>)}</div>;
}
