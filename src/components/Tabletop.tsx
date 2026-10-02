import { useEffect, useRef, useState } from 'react';

export function piecePoint(id:number) {
  const centers=[5.435,...Array.from({length:9},(_,i)=>(1.25+i+.5)/11.5*100),94.565];
  if(id<=10)return {x:centers[10-id],y:centers[10]};
  if(id<=20)return {x:centers[0],y:centers[20-id]};
  if(id<=30)return {x:centers[id-20],y:centers[0]};
  return {x:centers[10],y:centers[id-30]};
}
export function pieceHeading(id:number){return id<10?180:id<20?-90:id<30?0:90;}
function Solid({x=0,y=0,z=0,w=12,d=8,h=8,color='body',round=false}:{x?:number;y?:number;z?:number;w?:number;d?:number;h?:number;color?:string;round?:boolean}) {
 return <span className={`model-part ${color} ${round?'round':''}`} style={{'--w':`${w}px`,'--d':`${d}px`,'--h':`${h}px`,transform:`translate3d(${x}px,${y}px,${z+h/2}px)`} as React.CSSProperties}>{['front','back','left','right','top','bottom'].map(face=><i key={face} className={`solid-face ${face}`}/>)}</span>;
}
export function Sculpture({token,color,finish}:{token:number;color:string;finish:'silver'|'gold'}) {
 return <span className={`sculpture finish-${finish} model-${token}`} style={{'--model-color':color} as React.CSSProperties} aria-hidden="true">
   <Solid w={token===2||token===4?22:30} d={token===2||token===4?22:15} h={2} color="base" round/>
   {token===0&&<><Solid w={28} d={13} h={8} z={6}/><Solid w={14} d={12} h={8} z={14} color="glass"/>{[-9,9].flatMap(x=>[-7,7].map(y=><Solid key={`${x}-${y}`} x={x} y={y} z={3} w={6} d={3} h={7} color="rubber" round/>))}<Solid x={13} z={10} w={2} d={11} h={3} color="chrome"/></>}
   {token===1&&<><Solid w={36} d={11} h={6} z={3} round/><Solid w={29} d={10} h={2} z={9}/><Solid x={-3} w={14} d={7} h={6} z={11}/>{[-5,1].map(x=><Solid key={x} x={x} w={3} d={4} h={8} z={17}/>)}<Solid x={12} w={10} d={2} h={2} z={13}/><Solid x={-12} w={8} d={2} h={2} z={12}/><Solid x={-1} w={1} d={1} h={11} z={23}/></>}
   {token===2&&<><Solid w={29} d={25} h={3} z={3} round/><Solid w={17} d={17} h={24} z={6} round/><Solid w={19} d={19} h={3} z={29} round/><Solid w={18} d={18} h={3} z={8} color="glass" round/></>}
   {token===3&&<><Solid x={3} w={31} d={13} h={5} z={3} round/><Solid x={-8} w={13} d={13} h={24} z={8}/><Solid x={8} w={19} d={13} h={8} z={8} round/><Solid x={-8} w={15} d={15} h={3} z={30}/>{[14,18,22].map(z=><Solid key={z} x={-1} w={2} d={9} h={1} z={z} color="glass"/>)}</>}
   {token===4&&<>{[0,1,2,3,4,5].map(i=><Solid key={i} w={23-i*1.8} d={23-i*1.8} h={4} z={3+i*4} round/>)}<Solid w={12} d={12} h={3} z={27} round/></>}
   {token===5&&<><Solid x={10} w={9} d={5} h={13} z={3} round/><Solid x={-2} w={23} d={17} h={3} z={12}/><Solid x={-2} y={-8} w={23} d={2} h={9} z={15}/><Solid x={-2} y={8} w={23} d={2} h={9} z={15}/><Solid x={8} w={2} d={17} h={9} z={15}/>{[-6,6].map(y=><Solid key={y} x={-17} y={y} w={17} d={2} h={2} z={14}/>)}<Solid x={-8} w={2} d={13} h={9} z={3}/></>}
 </span>;
}
const dots:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function adjacent(value:number){const other=[1,2,3,4,5,6].filter(n=>n!==value&&n!==7-value);return [other[0],other.find(n=>n!==other[0]&&n!==7-other[0])!];}
function Face({value,name}:{value:number;name:string}){return <span className={`die-face face-${name}`}>{Array.from({length:9},(_,i)=><i key={i} className={dots[value].includes(i)?'pip':''}/>)}</span>;}
export function DiceTray({dice,rolling,seed,reduced}:{dice:[number,number];rolling:boolean;seed:number;reduced:boolean}) {
 const [landings,setLandings]=useState([{x:42,y:65,r:-12},{x:60,y:58,r:18}]);
 const wasRolling=useRef(false);
 const previousSeed=useRef(seed);
 useEffect(()=>{
  const scatter=()=>{
   const point=()=>({x:12+Math.random()*76,y:12+Math.random()*76,r:Math.random()*360});
   const first=point();let second=point();
   for(let attempt=0;attempt<20&&Math.hypot(second.x-first.x,second.y-first.y)<20;attempt++)second=point();
   if(Math.hypot(second.x-first.x,second.y-first.y)<20)second={x:first.x<50?82:18,y:first.y<50?82:18,r:second.r};
   setLandings([first,second]);
  };
  if(rolling&&!wasRolling.current){wasRolling.current=true;scatter();}
  else {
   if(!rolling&&!wasRolling.current&&previousSeed.current!==seed){
    scatter();
   }
   if(!rolling)wasRolling.current=false;previousSeed.current=seed;
  }
 },[rolling,dice[0],dice[1],seed]);
 return <div className={`dice-tray cube-tray ${rolling&&!reduced?'tumbling':''}`} aria-label={rolling?'Dice rolling':`Dice: ${dice.join(' and ')}`} aria-live="polite">{dice.map((value,i)=><span key={i} className="dice-landing" style={{left:`${landings[i].x}%`,top:`${landings[i].y}%`,'--land-r':`${landings[i].r}deg`} as React.CSSProperties}><span className={`die cube ${rolling?'rolling':''}`}><Face value={value} name="front"/><Face value={7-value} name="back"/><Face value={adjacent(value)[0]} name="right"/><Face value={7-adjacent(value)[0]} name="left"/><Face value={adjacent(value)[1]} name="top"/><Face value={7-adjacent(value)[1]} name="bottom"/></span></span>)}</div>;
}
