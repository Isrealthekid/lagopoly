import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BusFront, Landmark, Gift, CircleHelp, HandCoins, Coffee, LockKeyhole, Siren, House, Building2, CarFront, Sailboat, Bike, Plane, Anchor } from 'lucide-react';
import type { BoardDefinition, GameState, Space } from '../game/types';
import { compactMoney } from '../game/engine';
import { DiceTray, Sculpture, piecePoint } from './Tabletop';
export const tokenIcons = [CarFront, Sailboat, Bike, Plane, Anchor, House];
export const tokenNames = ['Car', 'Boat', 'Bicycle', 'Plane', 'Anchor', 'House'];
export const playerColors = ['#186648', '#e29934', '#8060a4', '#3c83bb'];
export function Token({ token, color, size = 20 }: { token: number; color: string; size?: number }) { const Icon = tokenIcons[token]; return <Icon size={size} color={color} strokeWidth={2.3} />; }
export function spaceIcon(s: Space, size = 20) {
  const Icon = ({ start: ArrowUpRight, brt: BusFront, utility: Landmark, community: Gift, chance: CircleHelp, tax: HandCoins, rest: Coffee, holding: LockKeyhole, goHolding: Siren, property: House })[s.type];
  return <Icon size={size} strokeWidth={1.65} />;
}
function coords(id: number) {
  if (id <= 10) return { gridRow: 11, gridColumn: 11 - id };
  if (id <= 20) return { gridRow: 21 - id, gridColumn: 1 };
  if (id <= 30) return { gridRow: 1, gridColumn: id - 19 };
  return { gridRow: id - 29, gridColumn: 11 };
}
export function Board({ board, game, selected, select, rolling, motion, onMoving, onArrived, onViewChange }: { board: BoardDefinition; game: GameState; selected: number; select: (id: number) => void; rolling: boolean; motion: boolean; onMoving: (moving:boolean)=>void; onArrived:(positions:string)=>void; onViewChange:(depth:boolean)=>void }) {
  const current = game.players[game.current];
  const [depth,setDepth] = useState(true), [angle,setAngle] = useState(45);
  const [follow,setFollow] = useState(true);
  const [scene,setScene] = useState({size:760,width:390,height:844,mobile:window.innerWidth<=1100});
  const [positions,setPositions] = useState(()=>game.players.map(p=>p.position));
  const positionsRef=useRef(positions);
  const previousGame=useRef(game);
  const stageRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    const observer=new ResizeObserver(()=>{const size=stage.clientWidth;const host=stage.parentElement!;setScene({size,width:host.clientWidth,height:host.clientHeight,mobile:window.innerWidth<=1100});stage.style.setProperty('--board-unit',`${size/100}px`);stage.style.setProperty('--piece-scale',`${Math.max(.45,size/420)}`);});
    observer.observe(stage);observer.observe(stage.parentElement!);return ()=>observer.disconnect();
  },[]);
  const drag=useRef<{x:number;angle:number}|null>(null);
  const suppressClick=useRef(false);
  const reduced=!motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets=game.players.map(p=>p.position).join(',');
  useEffect(()=>{
    if(rolling)return;
    const from=positionsRef.current;
    const previous=previousGame.current;previousGame.current=game;
    if(from.length!==game.players.length || previous.boardId!==game.boardId || game.sequence<previous.sequence || reduced){positionsRef.current=game.players.map(p=>p.position);setPositions(positionsRef.current);onMoving(false);onArrived(targets);return;}
    const paths=game.players.map((p,i)=>{
      const start=from[i];if(start===p.position)return [];
      const card=[...board.community,...board.chance].find(c=>c.id===previous.pendingCard);
      const backwards=card?.effect.kind==='back';
      const count=backwards?3:(p.position-start+40)%40;
      if(p.holding){
        const rolled=game.logs.find(l=>/ rolls /.test(l.text))?.id!==previous.logs.find(l=>/ rolls /.test(l.text))?.id;
        if(rolled&&(start+game.dice[0]+game.dice[1])%40===30&&game.doubles<3){
          return [...Array.from({length:game.dice[0]+game.dice[1]},(_,step)=>(start+step+1)%40),10];
        }
        return [p.position];
      }
      return Array.from({length:count},(_,step)=>(start+(backwards?-1:1)*(step+1)+40)%40);
    });
    const steps=Math.max(0,...paths.map(p=>p.length));if(!steps){onMoving(false);onArrived(targets);return;}
    onMoving(true);
    let step=0;
    const advance=()=>{positionsRef.current=game.players.map((p,i)=>paths[i][Math.min(step,paths[i].length-1)]??p.position);setPositions([...positionsRef.current]);step++;};
    const startTimer=setTimeout(advance,80);
    const interval=setInterval(()=>{if(step<steps)advance();},180);
    const finish=setTimeout(()=>{onMoving(false);onArrived(targets);},steps*180+220);
    return ()=>{clearTimeout(startTimer);clearInterval(interval);clearTimeout(finish);};
  },[targets,rolling,reduced,game.boardId,onMoving,onArrived]);
  useEffect(()=>()=>onMoving(false),[onMoving]);
  const focus=rolling?{x:50,y:62}:piecePoint(positions[current.id]??current.position);
  const radians=angle*Math.PI/180;
  const dx=(focus.x-50)*scene.size/100,dy=(focus.y-50)*scene.size/100;
  const cameraScale=scene.mobile?.95:.67;
  const strength=scene.mobile?1:.25;
  const cameraX=depth&&follow?-(dx*Math.cos(radians)-dy*Math.sin(radians))*cameraScale*strength:0;
  const cameraY=depth&&follow?-(dx*Math.sin(radians)+dy*Math.cos(radians))*Math.cos(38*Math.PI/180)*cameraScale*strength+(scene.mobile?scene.height*(scene.height<500?0:['buy','card','debt','auction','trade'].includes(game.phase)?0:.14):0):0;
  return <><div className="board-zoom"><button className="board-view-button" aria-pressed={depth} onClick={()=>{setDepth(!depth);onViewChange(!depth);}} title={depth ? 'Switch to overhead view' : 'Switch to 3D view'}>{depth ? '3D VIEW' : 'FLAT VIEW'}</button>{depth&&<><button className="board-view-button follow-button" aria-pressed={follow} onClick={()=>setFollow(!follow)}>{follow?'Following':'Overview'}</button><button className="board-view-button" aria-label="Rotate board left" onClick={()=>setAngle(a=>a-15)}>↶</button><button className="board-view-button" aria-label="Reset board angle" onClick={()=>setAngle(45)}>Reset</button><button className="board-view-button" aria-label="Rotate board right" onClick={()=>setAngle(a=>a+15)}>↷</button></>}</div><div className={`board-scroll ${depth?'depth-view':'flat-view'} ${reduced?'reduced-motion':''}`}>
    <div ref={stageRef} className="board-stage" style={{'--board-angle':`${angle}deg`,'--camera-x':`${cameraX}px`,'--camera-y':`${cameraY}px`,'--scene-scale':`${scene.mobile?(follow?.95:Math.min(scene.width,scene.height)*.67/scene.size):.67}`} as React.CSSProperties}
      onPointerDown={e=>{if(!depth||e.button!==0)return;drag.current={x:e.clientX,angle};suppressClick.current=false;}}
      onPointerMove={e=>{const d=drag.current;if(!d)return;const delta=e.clientX-d.x;if(Math.abs(delta)>6){suppressClick.current=true;e.currentTarget.setPointerCapture(e.pointerId);setAngle(d.angle+delta*.3);}}}
      onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
      onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}>
    <div className="game-board" aria-label={`${board.name} game board`}>
    {board.spaces.map(s => {
      const asset = game.assets[s.id];
      return <button key={s.id} data-space={s.id} className={`space edge-${Math.floor(s.id / 10)} ${s.id % 10 === 0 ? 'corner' : ''} ${s.group ? 'property' : s.type} ${selected === s.id ? 'selected' : ''} ${current.position === s.id ? 'current-space' : ''} ${asset?.mortgaged ? 'mortgaged' : ''}`}
        style={{ ...coords(s.id), '--group-color': s.group ? board.groups[s.group].color : 'transparent' } as React.CSSProperties}
        onClick={() => select(s.id)} aria-label={`${s.name}${s.price ? `, ${compactMoney(s.price)}` : ''}${asset?.owner !== null && asset?.owner !== undefined ? `, owned by ${game.players[asset.owner].name}` : ''}`}>
        {s.group && <div className="group-strip">{asset?.level > 0 && <span className="tile-buildings">{asset.level === 5 ? <Building2 className="tile-hotel" size={11} /> : Array.from({ length: asset.level }, (_, i) => <House key={i} size={9} />)}</span>}</div>}
        <span className={`space-content group-${s.group || 'none'}`}>{s.group && <span className="district-label">{board.city.toUpperCase()}</span>}{!s.group && <span className="space-symbol">{s.type==='chance'?<span className="chance-glyph">?</span>:spaceIcon(s, s.id % 10 === 0 ? 26 : 21)}</span>}<span className="space-name">{s.type==='start'?'GO':s.short || s.name}</span><span className="space-price">{s.price ? compactMoney(s.price) : s.type === 'start' ? '+N200k' : s.amount ? compactMoney(s.amount) : ''}</span></span>
        {asset?.owner !== null && asset?.owner !== undefined && <span className="owner-dot" style={{backgroundColor:playerColors[asset.owner]}} title={`Owned by ${game.players[asset.owner].name}`} aria-hidden="true"/>}
      </button>;
    })}
    <div className="board-center">
      <div className="board-center-top"><span className="center-coordinates">NIGERIA / {board.city.toUpperCase()}</span><span className="edition-stamp">{board.name.toUpperCase()}</span></div>
      <div className="board-brand"><h1>MONOPOLY</h1><h2>LAG-EDITION</h2></div>
      <img className="skyline" src={board.artwork} alt={`Illustrated ${board.city} skyline`} />
      <div className="deck-area"><div className="deck community-deck"><Gift size={24} /><span>COMMUNITY<br />CHEST</span><small>{game.community.length} cards</small></div><DiceTray dice={game.dice} rolling={rolling} seed={game.logs.find(log=>/ rolls /.test(log.text))?.id??0} reduced={reduced} /><div className="deck chance-deck"><CircleHelp size={26} /><span>CHANCE</span><small>{game.chance.length} cards</small></div></div>
      <div className="center-bottom"><span>BUY. BUILD. MAKE YOUR MOVE.</span><span>EST. IN {board.city.toUpperCase()}</span></div>
    </div>
    <div className="piece-layer" aria-label="Player pieces">{game.players.filter(p=>!p.bankrupt).map(p=>{
      const point=piecePoint(positions[p.id]??p.position);
      return <span key={p.id} data-player={p.id} data-position={positions[p.id]??p.position} className={`tile-token sculpted-token ${p.id===current.id?'active-token':''}`} style={{left:`${point.x}%`,top:`${point.y}%`,'--seat-offset':`${(p.id-1.5)*7}px`,'--token-color':playerColors[p.id]} as React.CSSProperties} title={`${p.name}: ${board.spaces[positions[p.id]??p.position].name}`}><Sculpture token={p.token} color={playerColors[p.id]} /><span className="piece-name">{p.name}</span></span>;
    })}</div>
  </div></div></div><div className="board-hint">{depth?'Drag to rotate · tap a space to inspect':'Tap a space to inspect'}<span>{rolling?'Rolling dice…':game.players.some(p=>positions[p.id]!==p.position)?'Moving…':''}</span></div></>;
}
