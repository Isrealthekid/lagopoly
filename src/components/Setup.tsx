import { useEffect, useState } from 'react';
import { MapPin, Minus, Plus, Play, Check } from 'lucide-react';
import { boards } from '../data/boards';
import { playerColors, Token, tokenNames } from './Board';
import { Modal } from './Modal';

export function Setup({ start, close, hasGame, username, online, finish, changeFinish }: { start: (board: string, names: string[], tokens: number[], aiPlayers?:number[]) => void; close?: () => void; hasGame: boolean; username?:string; online?:()=>void; finish:'silver'|'gold'; changeFinish:(finish:'silver'|'gold')=>void }) {
  const [count, setCount] = useState(2), [board, setBoard] = useState('lagos');
  const [names, setNames] = useState([username??'Player 1', 'Player 2', 'Player 3', 'Player 4']);
  const [mode,setMode]=useState<'local'|'ai'>('local');
  useEffect(()=>{if(username)setNames(current=>current[0]==='Player 1'?[username,...current.slice(1)]:current);},[username]);
  const playingNames=names.slice(0,count).map((name,i)=>mode==='ai'&&i>0?`AI ${i}`:name);
  const [tokens, setTokens] = useState([0, 1, 2, 3]);
  const valid = playingNames.every(n => n.trim()) && new Set(playingNames.map(n=>n.trim().toLowerCase())).size === count && new Set(tokens.slice(0,count)).size === count;
  const addPlayer = () => {
    const used=tokens.slice(0,count);
    if(used.includes(tokens[count])) setTokens(tokens.map((token,index)=>index===count?tokenNames.findIndex((_,id)=>!used.includes(id)):token));
    setCount(count+1);
  };
  return <Modal title={hasGame ? 'Start a new table' : 'Welcome to the table'} close={close}>
    <div className="mode-tabs"><button aria-pressed={mode==='local'} onClick={()=>setMode('local')}>Shared device</button><button aria-pressed={mode==='ai'} onClick={()=>setMode('ai')}>Computer</button>{online&&<button onClick={online}>Online</button>}</div>
    <div className="setup-edition"><MapPin size={28} /><div><span className="eyebrow">CHOOSE YOUR CITY</span><select aria-label="Board edition" value={board} onChange={e => setBoard(e.target.value)}>{Object.values(boards).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div><span className="local-pill">LOCAL PLAY</span></div>
    <fieldset className="artifact-finish-picker"><legend>Artifact finish</legend><p>Choose the metal for your playing pieces.</p><div>{(['silver','gold'] as const).map(metal=><button key={metal} type="button" aria-pressed={finish===metal} onClick={()=>changeFinish(metal)}><span className={`finish-swatch ${metal}`} aria-hidden="true"/>{metal==='gold'?'Gold':'Silver'}{finish===metal&&<Check size={15}/>}</button>)}</div></fieldset>
    <div className="setup-row"><h3>Who's playing?</h3><div className="stepper"><button className="icon-button" aria-label="Remove player" disabled={count===2} onClick={()=>setCount(count-1)}><Minus size={16}/></button><span>{count} players</span><button className="icon-button" aria-label="Add player" disabled={count===4} onClick={addPlayer}><Plus size={16}/></button></div></div>
    <div className="setup-players">{playingNames.map((name,i) => <div className="setup-player" key={i}><span className="player-avatar" style={{ background: `${playerColors[i]}14` }}><Token token={tokens[i]} color={playerColors[i]} size={25}/></span><label><span>{mode==='ai'&&i>0?'COMPUTER':'PLAYER'} {i+1}</span><input aria-label={`Player ${i+1} name`} maxLength={20} value={name} disabled={mode==='ai'&&i>0} onChange={e=>setNames(names.map((n,j)=>j===i?e.target.value:n))}/></label><div className="token-picker">{tokenNames.map((label,t)=><button key={t} title={label} aria-label={`Player ${i+1}: ${label}`} aria-pressed={tokens[i]===t} disabled={tokens.some((v,j)=>j!==i&&j<count&&v===t)} onClick={()=>setTokens(tokens.map((v,j)=>j===i?t:v))}><Token token={t} color={tokens[i]===t?playerColors[i]:'#87928c'} size={17}/></button>)}</div></div>)}</div>
    {!valid && <p className="form-error">Each player needs a different name.</p>}
    <div className="setup-summary"><span><Check size={15}/> N1.5m starting cash</span><span><Check size={15}/> Classic rules</span><span><Check size={15}/> Automatic saves</span></div>
    {hasGame && close && <button className="secondary full" onClick={close}><Play size={18}/> Resume game</button>}
    {hasGame && <p className="replace-warning">Starting replaces the table saved in this browser.</p>}
    <button className="primary full" disabled={!valid} onClick={()=>start(board,playingNames.map(n=>n.trim()),tokens.slice(0,count),mode==='ai'?Array.from({length:count-1},(_,i)=>i+1):[])}><Play size={18}/> Start game</button>
  </Modal>;
}
