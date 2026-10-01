import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BusFront, Landmark, Gift, CircleHelp, HandCoins, Coffee, LockKeyhole, Siren, House, Building2, CarFront, Sailboat, Bike, Plane, Anchor, ZoomIn, ZoomOut } from 'lucide-react';
import type { BoardDefinition, GameState, Space } from '../game/types';
import { compactMoney } from '../game/engine';

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
export function Board({ board, game, selected, select, rolling }: { board: BoardDefinition; game: GameState; selected: number; select: (id: number) => void; rolling: boolean }) {
  const current = game.players[game.current];
  const [zoom,setZoom] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const host=scroll.current, tile=host?.querySelector<HTMLButtonElement>(`[data-space="${current.position}"]`);
    if(!host||!tile)return;
    const reveal=()=>{
      const container=host.getBoundingClientRect(), target=(tile.querySelector('.active-token')??tile).getBoundingClientRect();
      host.scrollTo({left:host.scrollLeft+target.left-container.left+target.width/2-host.clientWidth/2,top:host.scrollTop+target.top-container.top+target.height/2-host.clientHeight/2,behavior:'instant'});
    };
    reveal();
    const observer=new ResizeObserver(reveal);observer.observe(host);
    return ()=>observer.disconnect();
  },[current.position,game.current,zoom]);
  return <><div className="board-zoom"><button className="icon-button" aria-label={zoom?'Zoom out board':'Zoom in board'} title={zoom?'Zoom out board':'Zoom in board'} onClick={()=>setZoom(!zoom)}>{zoom?<ZoomOut size={17}/>:<ZoomIn size={17}/>}</button></div><div ref={scroll} className={`board-scroll ${zoom?'zoomed':''}`}><div className="game-board" aria-label={`${board.name} game board`}>
    {board.spaces.map(s => {
      const asset = game.assets[s.id], players = game.players.filter(p => !p.bankrupt && p.position === s.id);
      return <button key={s.id} data-space={s.id} className={`space edge-${Math.floor(s.id / 10)} ${s.id % 10 === 0 ? 'corner' : ''} ${s.group ? 'property' : s.type} ${selected === s.id ? 'selected' : ''} ${current.position === s.id ? 'current-space' : ''} ${asset?.mortgaged ? 'mortgaged' : ''}`}
        style={{ ...coords(s.id), '--group-color': s.group ? board.groups[s.group].color : 'transparent' } as React.CSSProperties}
        onClick={() => select(s.id)} aria-label={`${s.name}${s.price ? `, ${compactMoney(s.price)}` : ''}${asset?.owner !== null && asset?.owner !== undefined ? `, owned by ${game.players[asset.owner].name}` : ''}`}>
        {s.group && <div className="group-strip">{asset?.level > 0 && <span className="tile-buildings">{asset.level === 5 ? <Building2 size={11} /> : Array.from({ length: asset.level }, (_, i) => <House key={i} size={9} />)}</span>}</div>}
        <span className={`space-content group-${s.group || 'none'}`}>{s.group && <span className="district-label">{board.city.toUpperCase()}</span>}{!s.group && <span className="space-symbol">{s.type==='chance'?<span className="chance-glyph">?</span>:spaceIcon(s, s.id % 10 === 0 ? 26 : 21)}</span>}<span className="space-name">{s.type==='start'?'GO':s.short || s.name}</span><span className="space-price">{s.price ? compactMoney(s.price) : s.type === 'start' ? '+N200k' : s.amount ? compactMoney(s.amount) : ''}</span></span>
        {asset?.owner !== null && asset?.owner !== undefined && <span className="owner-dot" style={{backgroundColor:playerColors[asset.owner]}} title={`Owned by ${game.players[asset.owner].name}`} aria-hidden="true"/>}
        {!!players.length && <span className="tile-tokens">{players.map(p => <span key={p.id} className={`tile-token ${p.id===current.id?'active-token':''}`} style={{ '--token-color': playerColors[p.id] } as React.CSSProperties} title={p.name}><Token token={p.token} color={playerColors[p.id]} size={13} /></span>)}</span>}
      </button>;
    })}
    <div className="board-center">
      <div className="board-center-top"><span className="center-coordinates">NIGERIA / {board.city.toUpperCase()}</span><span className="edition-stamp">{board.name.toUpperCase()}</span></div>
      <div className="board-brand"><h1>MONOPOLY</h1><h2>LAG-EDITION</h2></div>
      <img className="skyline" src={board.artwork} alt={`Illustrated ${board.city} skyline`} />
      <div className="deck-area"><div className="deck community-deck"><Gift size={24} /><span>COMMUNITY<br />CHEST</span><small>{game.community.length} cards</small></div><div className="dice-tray" aria-label={`Dice: ${game.dice.join(' and ')}`}><Dice value={game.dice[0]} rolling={rolling} /><Dice value={game.dice[1]} rolling={rolling} /></div><div className="deck chance-deck"><CircleHelp size={26} /><span>CHANCE</span><small>{game.chance.length} cards</small></div></div>
      <div className="center-bottom"><span>BUY. BUILD. MAKE YOUR MOVE.</span><span>EST. IN {board.city.toUpperCase()}</span></div>
    </div>
  </div></div></>;
}
export function Dice({ value, rolling = false }: { value: number; rolling?: boolean }) {
  const dots: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return <span className={`die ${rolling ? 'rolling' : ''}`}>{Array.from({ length: 9 }, (_, i) => <i key={i} className={dots[value].includes(i) ? 'pip' : ''} />)}</span>;
}
