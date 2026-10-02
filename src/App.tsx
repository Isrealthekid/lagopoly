import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ArrowRight, Building2, Check, CheckCircle2, ChevronDown, CircleHelp, CirclePlus, Dices, Download, Flag, House, Landmark, List, LogOut, MapPin, Minus, Plus, RefreshCw, Save, Settings2, ShieldCheck, Trophy, Upload, Wallet, X } from 'lucide-react';
import { getBoard } from './data/boards';
import { createSession, readSave, validateSave, type Session } from './game/session';
import { assetActionError, compactMoney, fee, inventory, managementPlayer, money } from './game/engine';
import type { Action, GameState, Space } from './game/types';
import { PromptPresence } from './components/PromptPresence';
import { Board, playerColors, Token, spaceIcon } from './components/Board';
import { FeedbackContext, Modal } from './components/Modal';
import { Setup } from './components/Setup';
import { Trade } from './components/Trade';
import { Multiplayer } from './components/Multiplayer';
import { api, type Account, type OnlineRoom } from './online/api';
import { createOnlineSession } from './online/session';
import { chooseAIAction, decisionPlayer } from './game/ai';

function initialize() {
  const { save, error } = readSave();
  const session = save ? createSession(save.state.G.boardId, save.state.G.players.map(p=>p.name), save.state.G.players.map(p=>p.token), save) : createSession('lagos', ['Player 1','Player 2'], [0,1]);
  return { session, error, restored: !!save };
}
export default function App() {
  const [initial] = useState(initialize);
  const [session,setSession] = useState<Session>(initial.session), [game,setGame] = useState<GameState>(initial.session.get());
  const [setup,setSetup] = useState(!initial.restored), [started,setStarted] = useState(initial.restored);
  const [rules,setRules] = useState(false), [settings,setSettings] = useState(false), [trade,setTrade] = useState(false);
  const [detail,setDetail] = useState<number|null>(null), [selected,setSelected] = useState(0);
  const [error,setError] = useState(initial.error), [saved,setSaved] = useState(false), [saveError,setSaveError] = useState<string|null>(null);
  const [viewDepth,setViewDepth] = useState(true);
  const [compact,setCompact] = useState(()=>window.matchMedia('(max-width:1100px)').matches);
  const [arrived,setArrived] = useState(()=>initial.session.get().players.map(p=>p.position).join(','));
  useEffect(()=>{const media=window.matchMedia('(max-width:1100px)');const update=()=>setCompact(media.matches);media.addEventListener('change',update);return ()=>media.removeEventListener('change',update);},[]);
  const [moving,setMoving] = useState(false);
  const [rolling,setRolling] = useState(false), [tab,setTab] = useState<'activity'|'portfolio'>('activity');
  const [portfolioPlayer,setPortfolioPlayer] = useState<number|null>(null), [bid,setBid] = useState('1000');
  const [mobileAssets,setMobileAssets] = useState(false);
  const [tradeInbox,setTradeInbox] = useState(false);
  const [account,setAccount]=useState<Account|null>(null),[hub,setHub]=useState(false);
  const [onlineRoom,setOnlineRoom]=useState<{code:string;seat:number}|null>(null);
  const [confirmBankruptcy,setConfirmBankruptcy] = useState(false), [motion,setMotion] = useState(()=>{try{return localStorage.getItem('naija-estates.motion')!=='off';}catch{return true;}});
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null), importInput = useRef<HTMLInputElement>(null);
  const board = getBoard(game.boardId), current = game.players[game.current];
  const actor = managementPlayer(game), pending = game.pendingCard ? [...board.community,...board.chance].find(c=>c.id===game.pendingCard) : null;
  const stock = inventory(game), space = board.spaces[selected];
  const destinationReady=arrived===game.players.map(p=>p.position).join(',');
  const showPrompt=!(compact&&viewDepth)||(!rolling&&!moving&&destinationReady&&(!['roll','manage'].includes(game.phase)||current.holding||game.transferCharges.length>0));
  useEffect(()=> {
    session.start();
    const unsub=session.subscribe(g=>setGame(g));
    return ()=>{unsub();session.stop();};
  },[session]);
  useEffect(()=> {
    if (!started) return;
    try { session.save(); setSaved(true);setSaveError(null); } catch { setSaveError('Browser storage is unavailable. Download a save to keep this table.'); setSaved(false); }
  },[game,session,started]);
  useEffect(()=>{ setSelected(current.position); },[current.position,game.current]);
  useEffect(()=>{ if(game.auction) setBid(String(game.auction.high+1000)); },[game.auction?.high,game.auction?.bidder]);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const send=(action:Action)=> {
    if(rolling||moving) return;
    const decision=decisionPlayer(game);
    if(action.type!=='readTradeNotifications'&&((onlineRoom&&decision!==onlineRoom.seat)||(!onlineRoom&&game.aiPlayers?.includes(decision)))){setError('Wait for the other player to finish their decision.');return false;}
    try { session.dispatch(action);setError(null); return true; } catch(e) { setError(e instanceof Error?e.message:'This action is unavailable.');return false; }
  };
  const roll=()=> { if(send({type:'roll'})&&motion&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){setRolling(true);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setRolling(false),1200);} };
  const lastAnimatedRoll=useRef(game.logs.find(log=>/ rolls [1-6] \+ [1-6]\./.test(log.text))?.id);
  useEffect(()=>{
    const latest=game.logs.find(log=>/ rolls [1-6] \+ [1-6]\./.test(log.text))?.id;
    if(latest===lastAnimatedRoll.current)return;
    lastAnimatedRoll.current=latest;
    if(!latest||!motion||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(timer.current)clearTimeout(timer.current);
    setRolling(true);timer.current=setTimeout(()=>setRolling(false),1200);
  },[game.logs,motion]);
  const start=(boardId:string,names:string[],tokens:number[],aiPlayers:number[]=[])=> {
    if(timer.current)clearTimeout(timer.current);setRolling(false);
    const next=createSession(boardId,names,tokens,undefined,aiPlayers);setOnlineRoom(null);setSession(next);setGame(next.get());setStarted(true);setSetup(false);setDetail(null);setPortfolioPlayer(null);setError(null);
  };
  const startOnline=useCallback((room:OnlineRoom)=>{
    if(!room.game)return;
    if(timer.current)clearTimeout(timer.current);setRolling(false);
    const next=createOnlineSession(room,setError);setOnlineRoom({code:room.code,seat:room.seat});setSession(next);setGame(room.game);setStarted(true);setSetup(false);setHub(false);setDetail(null);setError(null);
  },[]);
  const updateAccount=(user:Account|null)=>{
    setAccount(user);
    if(!user&&onlineRoom){const saved=readSave().save;const next=saved?createSession(saved.state.G.boardId,saved.state.G.players.map(p=>p.name),saved.state.G.players.map(p=>p.token),saved):createSession('lagos',['Player 1','Player 2'],[0,1]);setSession(next);setGame(next.get());setOnlineRoom(null);setStarted(!!saved);}
    try{if(user)localStorage.setItem('monopoly.profile',JSON.stringify(user));else localStorage.removeItem('monopoly.profile');}catch{/* Session cookie remains authoritative. */}
  };
  useEffect(()=>{
    let live=true;
    if(new URLSearchParams(location.search).has('room')){setSetup(false);setHub(true);}
    void api<{user:Account|null}>('/me').then(async result=>{
      if(!live)return;updateAccount(result.user);
      if(result.user){const mine=await api<{room:OnlineRoom|null}>('/rooms/mine');if(!live)return;if(mine.room?.game)startOnline(mine.room);else if(mine.room){setSetup(false);setHub(true);}}
    }).catch(()=>{});
    return ()=>{live=false;};
  },[startOnline]);
  useEffect(()=>{
    if(!started||setup||onlineRoom||rolling||moving||game.phase==='won'||!game.aiPlayers?.includes(decisionPlayer(game)))return;
    const timeout=setTimeout(()=>{try{session.dispatch(chooseAIAction(game));setError(null);}catch(e){setError(e instanceof Error?e.message:'Computer move failed.');}},650);
    return ()=>clearTimeout(timeout);
  },[game,session,started,setup,onlineRoom,rolling,moving]);
  const exportSave=()=> {
    try {
      const state=session.get();
      const raw=JSON.stringify(session.snapshot());
      const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`monopoly-${state.boardId}-turn-${state.turn}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch {setError('Could not export the table.');}
  };
  const importSave=async(file?:File)=> {
    if(!file)return;
    try {const s=validateSave(JSON.parse(await file.text()));const next=createSession(s.state.G.boardId,s.state.G.players.map(p=>p.name),s.state.G.players.map(p=>p.token),s);setOnlineRoom(null);setSession(next);setGame(next.get());setStarted(true);setSetup(false);setSettings(false);setError(null);}catch{setError('This file is not a valid MONOPOLY LAG-EDITION save. Your current table is unchanged.');}
    if(importInput.current)importInput.current.value='';
  };
  const openSpace=(id:number)=>{setSelected(id);setDetail(id);};
  const canAct=onlineRoom?decisionPlayer(game)===onlineRoom.seat:!game.aiPlayers?.includes(decisionPlayer(game));
  const canTrade=canAct&&['roll','manage','debt'].includes(game.phase)&&!game.transferCharges.length;
  const tradeNotices=game.tradeNotifications ?? [];
  const unreadTrades=tradeNotices.filter(n=>onlineRoom?!n.readBy?.includes(onlineRoom.seat):!n.read);
  const tradeStatus=unreadTrades.some(n=>n.status==='proposed')?'proposed':unreadTrades.at(-1)?.status;
  const openTrade=()=>{
    if(tradeNotices.length||game.trade){setTradeInbox(true);if(unreadTrades.length)send({type:'readTradeNotifications',...(onlineRoom?{player:onlineRoom.seat}:{})});}
    else setTrade(true);
  };
  const tradeBadge=unreadTrades.length>0?<span className={`trade-badge ${tradeStatus}`} aria-label={`${unreadTrades.length} trade notifications, ${tradeStatus}`}>{unreadTrades.length}</span>:null;
  const portfolio=game.players[portfolioPlayer??onlineRoom?.seat??actor];
  const openAssets=()=>{setTab('portfolio');setPortfolioPlayer(onlineRoom?.seat??actor);if(window.matchMedia('(max-width: 1000px)').matches)setMobileAssets(true);};
  const exitGame=async()=>{
    if(onlineRoom){
      try{await api(`/rooms/${onlineRoom.code}/leave`,{});}catch(e){setError(e instanceof Error?e.message:'Could not leave the room.');return;}
      session.stop();
      const saved=readSave().save;
      const next=saved?createSession(saved.state.G.boardId,saved.state.G.players.map(p=>p.name),saved.state.G.players.map(p=>p.token),saved):createSession('lagos',['Player 1','Player 2'],[0,1]);
      setOnlineRoom(null);setSession(next);setGame(next.get());setStarted(!!saved);
    }
    setDetail(null);setTrade(false);setTradeInbox(false);setMobileAssets(false);
    setRules(false);setSettings(false);setConfirmBankruptcy(false);setHub(false);
    setSetup(true);
  };
  return <FeedbackContext.Provider value={error}><div className="app-shell">
    <header className="app-header"><a className="wordmark" href="#" aria-label="MONOPOLY LAG-EDITION"><strong>MONOPOLY</strong><span className="wordmark-edition">LAG-EDITION</span></a><div className="header-center">{board.name} <span className="header-divider"/>{onlineRoom?`Room ${onlineRoom.code}`:game.aiPlayers?.length?'Computer opponents':'Pass & play'}</div><nav><button className="header-link account-button" title={account?.username??'Sign in'} onClick={()=>{setSetup(false);setHub(true);}}><ShieldCheck size={17}/><span>{account?.username??'Sign in'}</span></button><button className="header-link" onClick={()=>setRules(true)}><CircleHelp size={17}/><span>Rules</span></button><button className="icon-button" title="Table settings" aria-label="Table settings" onClick={()=>setSettings(true)}><Settings2 size={19}/></button><button className="new-game-button" onClick={()=>setSetup(true)}><CirclePlus size={17}/><span>New game</span></button></nav></header>
    {started&&!setup&&<button className="exit-game-button secondary" onClick={exitGame} title="Return to game selection"><LogOut size={18}/> Exit game</button>}
    <main>
      {onlineRoom&&!!game.aiPlayers?.length&&<p className="online-departure-notice" role="status">{game.aiPlayers.map(id=>game.players[id].name).join(', ')} left the game. Their {game.aiPlayers.length===1?'seat is':'seats are'} now controlled by AI.</p>}
      <div className="table-heading"><div><div className="eyebrow"><MapPin size={13}/> NIGERIA / {board.city.toUpperCase()}</div><h2>A city of possibilities.</h2></div><div className="table-status"><span className="turn-badge">TURN {game.turn.toString().padStart(2,'0')}</span><span className={`save-status ${saveError?'failed':''}`} title={saveError||'Saved in this browser'}>{saved?<CheckCircle2 size={14}/>:<Save size={14}/>}<span>{saveError?'Save unavailable':started?'Table saved':'New table'}</span></span></div></div>
      {error&&<div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Dismiss message" onClick={()=>setError(null)}><X size={16}/></button></div>}
      {saveError&&<div className="error-banner" role="alert">{saveError}<button onClick={exportSave}><Download size={15}/> Download save</button></div>}
      <div className="scene-wallet"><span className="scene-player-dot" style={{background:playerColors[current.id]}}/><span>{current.name}<small>{board.spaces[current.position].short||board.spaces[current.position].name}</small></span><strong>{money(current.cash)}</strong><span className="scene-turn">TURN {game.turn}</span></div>
      <div className="table-layout">
        <section className="board-section"><Board board={board} game={game} selected={selected} select={openSpace} rolling={rolling} motion={motion} onMoving={setMoving} onArrived={setArrived} onViewChange={setViewDepth}/><div className="board-footnote"><span><ShieldCheck size={14}/> LOCAL TABLE</span><span>{stock.houses} units <span className="separator-dot"/> {stock.hotels} flagships in bank</span><span>{game.players.filter(p=>!p.bankrupt).length} players</span></div></section>
        <PromptPresence visible={showPrompt} motion={motion}><aside className={`table-sidebar phase-${game.phase} ${game.transferCharges.length ? 'has-transfer' : ''} ${current.holding ? 'in-holding' : ''}`}>
          <section className="turn-section"><div className="section-caption"><span>{game.phase==='auction'?'AT AUCTION':game.phase==='debt'?'PAYMENT DUE':game.phase==='won'?'THE WINNER':'YOUR MOVE'}</span><span className="phase-label">{game.phase==='roll'?'Roll the dice':game.phase==='manage'?'Manage & finish':game.phase==='buy'?'New opportunity':game.phase==='card'?'A twist in the tale':game.phase==='trade'?'Trade proposal':''}</span></div>
            <div className="current-player"><span className="player-avatar large" style={{background:`${playerColors[game.phase==='auction'?game.auction!.bidder:actor]}14`}}><Token token={game.players[game.phase==='auction'?game.auction!.bidder:actor].token} color={playerColors[game.phase==='auction'?game.auction!.bidder:actor]} size={29}/></span><div><h3>{game.players[game.phase==='auction'?game.auction!.bidder:actor].name}</h3><p>{game.phase==='auction'?'Your bid':game.phase==='debt'?'Raise cash or settle':current.holding?'In Holding':board.spaces[current.position].name}</p></div><span className="player-number">0{(game.phase==='auction'?game.auction!.bidder:actor)+1}</span></div>
            {!canAct&&<p className="waiting-player" role="status">{onlineRoom?'Waiting for another player':'Computer is thinking...'}</p>}
            <div className="turn-actions" aria-live="polite" hidden={rolling||moving||!destinationReady} inert={!canAct||rolling||moving||!destinationReady}>
              {game.transferCharges.length>0&&game.phase!=='debt'?<><h4>Inherited mortgage</h4><p>{board.spaces[game.transferCharges[0].space].name}</p><button className="primary" onClick={()=>send({type:'transfer',redeem:false})}>Keep mortgage · {compactMoney(board.spaces[game.transferCharges[0].space].price!*.05)}</button><button className="secondary" onClick={()=>send({type:'transfer',redeem:true})}>Redeem · {compactMoney(board.spaces[game.transferCharges[0].space].price!*.55)}</button></>:<>
              {game.phase==='roll'&&<>{current.holding&&<div className="holding-options"><button className="secondary" onClick={()=>send({type:'release',method:'pay'})}>Pay N50k release</button><button className="secondary" disabled={!current.cards.length} onClick={()=>send({type:'release',method:'card'})}>Use release card</button></div>}<button className="primary roll-button" disabled={rolling||moving||!started} onClick={roll}><Dices size={22}/>{rolling?'Rolling...':current.holding?'Try for doubles':'Roll dice'}<span>{current.holding?'':'Let\'s go'}</span></button></>}
              {game.phase==='buy'&&<><div className="purchase-preview"><span className="asset-swatch" style={{background:board.spaces[current.position].group?board.groups[board.spaces[current.position].group!].color:'#467760'}}/>{spaceIcon(board.spaces[current.position])}<strong>{board.spaces[current.position].name}</strong><span>{money(board.spaces[current.position].price!)}</span></div><button className="primary" disabled={rolling||moving||current.cash<board.spaces[current.position].price!} onClick={()=>send({type:'buy'})}><House size={18}/>Buy property</button><button className="text-action" disabled={rolling||moving} onClick={()=>send({type:'auction'})}>Put up for auction <ArrowRight size={16}/></button></>}
              {game.phase==='manage'&&<><p className="turn-message">{current.holding?'Your assets are still earning.':game.extraRoll?'Doubles! Another roll is yours.':'Your move is complete.'}</p><button className="primary" disabled={rolling||moving} onClick={()=>send({type:'end'})}>{game.extraRoll?<Dices size={20}/>:<Check size={19}/>} {game.extraRoll?'Continue to extra roll':'End turn'}<ArrowRight size={17}/></button></>}
              {game.phase==='card'&&pending&&<div className={`drawn-card ${pending.id.startsWith('CC')?'community':'chance'}`}><span className="eyebrow">{pending.id.startsWith('CC')?'COMMUNITY CHEST':'CHANCE'}</span><h4>{pending.title}</h4><p>{pending.text}</p><button className="primary" disabled={rolling||moving} onClick={()=>send({type:'card'})}>Apply card <ArrowRight size={16}/></button></div>}
              {game.phase==='auction'&&game.auction&&<><div className="auction-info"><strong>{board.spaces[game.auction.space].name}</strong><p>{game.auction.leader===null?'No bids yet':`${game.players[game.auction.leader].name} leads at ${money(game.auction.high)}`}</p></div><label className="cash-field">Your bid (N)<input aria-label="Your bid" type="number" min={game.auction.high+1000} step={1000} value={bid} onChange={e=>setBid(e.target.value)}/></label><div className="action-pair"><button className="primary" onClick={()=>send({type:'bid',amount:Number(bid)})}>Bid</button><button className="secondary" onClick={()=>send({type:'pass'})}>Pass</button></div></>}
              {game.phase==='debt'&&<><div className="debt-info"><strong>{money(game.payments[0].amount)}</strong><p>{game.payments[0].reason} · {game.payments[0].to===null?'Bank':game.players[game.payments[0].to!].name}</p><span>Available: {money(game.players[actor].cash)}</span></div><button className="primary" disabled={game.players[actor].cash<game.payments[0].amount} onClick={()=>send({type:'settle'})}>Settle payment</button><button className="secondary" onClick={openAssets}>Manage debtor's assets</button><button className="text-action danger" onClick={()=>setConfirmBankruptcy(true)}>Declare bankruptcy</button></>}
              {game.phase==='trade'&&game.trade&&<><h4>{game.players[game.trade.to].name}, your decision</h4><TradeSummary game={game} board={board} /><button className="primary" onClick={()=>send({type:'acceptTrade'})}>Accept trade</button><button className="secondary" onClick={()=>send({type:'rejectTrade'})}>Decline trade</button></>}
              {game.phase==='won'&&<div className="win-panel"><Trophy size={38}/><h4>{game.players[game.winner!].name} wins!</h4><p>The {board.city} estate is yours.</p><button className="primary" onClick={()=>setSetup(true)}>Play again</button></div>}
              </>}
            </div>
            <div className="table-tools"><button className="trade-button" disabled={(!canTrade&&!tradeNotices.length&&!game.trade)||rolling||moving||!started} onClick={openTrade}><ArrowLeftRight size={17}/> Trade{tradeBadge}</button><button disabled={!started} onClick={openAssets}><Building2 size={17}/> My assets</button></div>
          </section>
          <section className="players-section"><div className="section-caption"><span>AROUND THE TABLE</span><span>{game.players.length} players</span></div><div className="players-list">{game.players.map(p=><button className={`player-row ${p.id===game.current?'active':''} ${p.bankrupt?'eliminated':''}`} key={p.id} onClick={()=>{setPortfolioPlayer(p.id);setTab('portfolio');}}><span className="player-avatar" style={{background:`${playerColors[p.id]}12`}}><Token token={p.token} color={playerColors[p.id]} size={22}/></span><span className="player-info"><strong>{p.name}{p.id===game.current&&!p.bankrupt&&<span className="active-dot"/>}</strong><small>{p.bankrupt?'Bankrupt':`${Object.values(game.assets).filter(a=>a.owner===p.id).length} assets${p.holding?' · Holding':''}`}</small></span><span className="player-cash">{compactMoney(p.cash)}</span></button>)}</div></section>
          <section className="ledger-section"><div className="ledger-tabs" role="tablist" aria-label="Table ledger"><button role="tab" aria-selected={tab==='activity'} className={tab==='activity'?'active':''} onClick={()=>setTab('activity')}><List size={16}/> Activity</button><button role="tab" aria-selected={tab==='portfolio'} className={tab==='portfolio'?'active':''} onClick={()=>setTab('portfolio')}><Wallet size={16}/> Portfolio</button></div>
            {tab==='activity'?<div className="activity-feed" role="tabpanel">{game.logs.slice(0,12).map((log,i)=><div className={`activity-item ${i===0?'latest':''}`} key={log.id}><span className="log-dot" style={{background:log.player===null?'#b0b9b2':playerColors[log.player]}}/><p>{log.text}</p></div>)}</div>:<div className="portfolio" role="tabpanel"><select aria-label="Portfolio player" value={portfolio.id} onChange={e=>setPortfolioPlayer(+e.target.value)}>{game.players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{board.spaces.filter(s=>game.assets[s.id]?.owner===portfolio.id).map(s=><button key={s.id} className="portfolio-asset" onClick={()=>openSpace(s.id)}><span style={{background:s.group?board.groups[s.group].color:'#8b9b91'}}/><strong>{s.name}</strong><small>{game.assets[s.id].mortgaged?'Mortgaged':game.assets[s.id].level===5?'Flagship':game.assets[s.id].level?`${game.assets[s.id].level} units`:compactMoney(s.price!)}</small><ArrowRight size={14}/></button>)}{!Object.values(game.assets).some(a=>a.owner===portfolio.id)&&<div className="portfolio-empty"><House size={26}/><p>No assets yet.</p></div>}</div>}
          </section>
        </aside></PromptPresence>
      </div>
      <footer className="app-footer"><span>MONOPOLY <span className="separator-dot"/> LAG-EDITION</span><span>A little strategy. A lot of {board.city}.</span></footer>
      <nav className="mobile-game-actions" aria-label="Game actions">
        <button className="primary" disabled={!canAct||!started||rolling||moving||!['roll','manage'].includes(game.phase)||!!game.transferCharges.length} onClick={()=>game.phase==='roll'?roll():send({type:'end'})}>{game.phase==='manage'?<Check size={20}/>:<Dices size={20}/>}<span>{rolling?'Rolling...':moving||!destinationReady?'Moving...':game.phase==='manage'?game.extraRoll?'Roll again':'End turn':'Roll dice'}</span></button>
        <button className="secondary" disabled={!started||rolling||moving} onClick={()=>{setPortfolioPlayer(onlineRoom?.seat??actor);setMobileAssets(true);}}><Building2 size={20}/><span>My assets</span></button>
        <button className="secondary trade-button" disabled={!started||(!canTrade&&!tradeNotices.length&&!game.trade)||rolling||moving} onClick={openTrade}><ArrowLeftRight size={20}/><span>Trade</span>{tradeBadge}</button>
      </nav>
    </main>
    {setup&&<Setup start={start} username={account?.username} online={()=>{setSetup(false);setHub(true);}} close={started?()=>setSetup(false):undefined} hasGame={started}/ >}
    {hub&&<Multiplayer account={account} currentRoom={onlineRoom?.code} onAccount={updateAccount} onGame={startOnline} close={()=>{setHub(false);if(!started)setSetup(true);}}/>}
    {trade&&<Trade game={game} board={board} from={actor} close={()=>setTrade(false)} propose={proposal=>{if(send({type:'trade',proposal}))setTrade(false);}}/>}
    {tradeInbox&&<Modal title="Trade notifications" close={()=>setTradeInbox(false)}><div className="trade-notifications">{tradeNotices.slice().reverse().map((n,i)=><div className="trade-notification" key={i}><span className={`trade-status-dot ${n.status}`}/><div><strong>{game.players[n.from].name} & {game.players[n.to].name}</strong><p>{n.status==='proposed'?'Trade proposed':n.status==='accepted'?'Trade accepted':'Trade declined'}</p></div></div>)}</div>{game.trade&&<><TradeSummary game={game} board={board}/><div className="action-pair"><button className="primary" onClick={()=>{if(send({type:'acceptTrade'}))setTradeInbox(false);}}>Accept trade</button><button className="secondary" onClick={()=>{if(send({type:'rejectTrade'}))setTradeInbox(false);}}>Decline trade</button></div></>}{canTrade&&<button className="primary full" onClick={()=>{setTradeInbox(false);setTrade(true);}}><ArrowLeftRight size={18}/>New trade</button>}</Modal>}
    {mobileAssets&&<Modal title={`${portfolio.name}'s assets`} close={()=>setMobileAssets(false)}><div className="portfolio"><select aria-label="Asset owner" value={portfolio.id} onChange={e=>setPortfolioPlayer(+e.target.value)}>{game.players.map(p=><option key={p.id} value={p.id}>{p.name} - {compactMoney(p.cash)}</option>)}</select>{board.spaces.filter(s=>game.assets[s.id]?.owner===portfolio.id).map(s=><button key={s.id} className="portfolio-asset" onClick={()=>{setMobileAssets(false);openSpace(s.id);}}><span style={{background:s.group?board.groups[s.group].color:'#8b9b91'}}/><strong>{s.name}</strong><small>{game.assets[s.id].mortgaged?'Mortgaged':game.assets[s.id].level===5?'Flagship':game.assets[s.id].level?`${game.assets[s.id].level} units`:compactMoney(s.price!)}</small><ArrowRight size={14}/></button>)}{!Object.values(game.assets).some(a=>a.owner===portfolio.id)&&<div className="portfolio-empty"><House size={26}/><p>No assets yet.</p></div>}</div></Modal>}
    {detail!==null&&<AssetDetail game={game} space={board.spaces[detail]} close={()=>setDetail(null)} send={send}/>}
    {rules&&<Modal title="The Lagos rules" close={()=>setRules(false)} wide><div className="rules-content"><p>Own Lagos assets, develop complete colour groups, and stay solvent. The last player remaining wins.</p><div className="rule-grid"><section><h3><Dices size={19}/> Your turn</h3><p>Roll two dice, move clockwise, and resolve the space. Doubles earn another roll; three doubles send you to Holding. Passing or landing on Eko Start pays N200,000.</p></section><section><h3><House size={19}/> Buy & develop</h3><p>Buy an unowned asset or auction it. Complete colour groups double undeveloped rent. Build evenly, up to four units, then a flagship. All group mortgages must be redeemed first.</p></section><section><h3><Landmark size={19}/> BRT & landmarks</h3><p>BRT fees are N25k, N50k, N100k, or N200k for one to four holdings. National Theatre and Tafawa Balewa Square charge the dice total times N4k for one, or N10k for both.</p></section><section><h3><Wallet size={19}/> Money matters</h3><p>Rent is automatic. Mortgaged assets earn no income. A mortgage pays half the purchase price; redemption adds 10% interest. Sell development at half cost before mortgaging its group.</p></section><section><h3><Flag size={19}/> Holding</h3><p>Pay N50k before rolling, use a release card, or try doubles for up to three turns. Release doubles give no extra roll. After the third failure, pay and move by that roll.</p></section><section><h3><ArrowLeftRight size={19}/> Trade & debt</h3><p>Trade assets, cash, and release cards by agreement. Incoming mortgages carry 10% interest. During debt, sell or mortgage assets to raise cash; if you cannot settle, you leave the game.</p></section></div><h3>Colour groups</h3><div className="rules-groups">{Object.entries(board.groups).map(([id,group])=><div key={id}><span style={{background:group.color}}/><strong>{board.spaces.filter(s=>s.group===id).map(s=>s.short||s.name).join(' / ')}</strong></div>)}</div><p className="rules-note">Owambe Break is a rest space. All values are fictional game money. This table is saved in this browser.</p></div></Modal>}
    {settings&&<Modal title="Table settings" close={()=>setSettings(false)}><label className="settings-toggle"><span><strong>Dice animation</strong><small>Reduced-motion preferences are respected.</small></span><input type="checkbox" checked={motion} onChange={e=>{setMotion(e.target.checked);try{localStorage.setItem('naija-estates.motion',e.target.checked?'on':'off');}catch{/* Preferences remain available for this session. */}}}/></label><div className="settings-actions"><button className="secondary" onClick={exportSave}><Download size={18}/> Download saved table</button><button className="secondary" onClick={()=>importInput.current?.click()}><Upload size={18}/> Restore from file</button><button className="secondary" onClick={()=>{setSettings(false);setSetup(true);}}><RefreshCw size={18}/> Start a new table</button></div></Modal>}
    {confirmBankruptcy&&<Modal title="Leave the game?" close={()=>setConfirmBankruptcy(false)}><p className="confirm-copy">{game.players[actor].name} will be eliminated and their assets transferred to the creditor. You can only declare bankruptcy when your cash and mortgageable assets cannot cover the debt.</p><button className="primary danger-button" onClick={()=>{if(send({type:'bankrupt'}))setConfirmBankruptcy(false);}}>Declare bankruptcy</button></Modal>}
    <input ref={importInput} hidden type="file" accept=".json,application/json" onChange={e=>importSave(e.target.files?.[0])}/>
  </div></FeedbackContext.Provider>;
}

function TradeSummary({game,board}:{game:GameState;board:ReturnType<typeof getBoard>}) {
  const t=game.trade!;
  return <div className="trade-summary">{[[t.from,t.give,t.giveCash,t.giveCards],[t.to,t.take,t.takeCash,t.takeCards]].map(([id,ids,cash,cards],i)=><p key={i}><strong>{game.players[id as number].name} gives</strong><span>{[(cash as number)>0?money(cash as number):'',...(ids as number[]).map(id=>board.spaces[id].name),...(cards as string[]).map(()=>'Release card')].filter(Boolean).join(', ')||'Nothing'}</span></p>)}</div>;
}
function AssetDetail({game,space:s,close,send}:{game:GameState;space:Space;close:()=>void;send:(a:Action)=>boolean|undefined}) {
  const board=getBoard(game.boardId), a=game.assets[s.id];
  const owner=a?.owner!==null&&a?.owner!==undefined?game.players[a.owner]:null;
  const action=(type:'build'|'sell'|'mortgage'|'redeem'|'liquidate')=>owner&&send({type,space:s.id,player:owner.id});
  return <Modal title={s.name} close={close}>
    <div className="deed-paper"><div className="deed-title" style={{backgroundColor:s.group?board.groups[s.group].color:'#e6e6e1'}}><span>{board.city}</span><h3>{s.name}</h3><small>{s.type==='property'?'TITLE DEED':s.type==='brt'?'BRT CONCESSION':s.type==='utility'?'LANDMARK SERVICE':'LAG-EDITION'}</small></div>
    {a&&<><div className="deed-price"><span>Asset purchase value</span><strong>{money(s.price!)}</strong></div>
    {s.rents?<div className="rent-table">{s.rents.map((amount,i)=><div key={i} className={a.level===i?'current':''}><span>{i===0?'Base rent':i===5?'With flagship':`With ${i} ${i===1?'unit':'units'}`}</span><strong>{money(amount)}</strong></div>)}<small>Complete group: double base rent. Development: {money(s.buildingCost!)} per unit or flagship upgrade.</small></div>:s.type==='brt'?<div className="rent-table">{[25000,50000,100000,200000].map((v,i)=><div key={i}><span>{i+1} BRT {i?'assets':'asset'}</span><strong>{money(v)}</strong></div>)}</div>:<div className="rent-table"><div><span>One landmark</span><strong>Dice total x N4,000</strong></div><div><span>Both landmarks</span><strong>Dice total x N10,000</strong></div></div>}
    <div className="deed-owner"><span>Mortgage value</span><strong>{money(s.price!/2)}</strong></div>
    <div className="deed-owner"><span>Owner</span><strong>{owner?owner.name:'Available from the bank'}</strong></div><div className="deed-owner"><span>Status</span><strong>{a.mortgaged?'Mortgaged':a.level===5?'Flagship':a.level?`${a.level} development units`:'Undeveloped'}</strong></div>
    </>}</div>
    {a&&<>
    {owner&&!owner.bankrupt&&<div className="asset-actions">{(['build','sell','mortgage','redeem','liquidate'] as const).filter(type=>s.type==='property'||type==='mortgage'||type==='redeem').map(type=>{const error=assetActionError(game,type,s.id,owner.id);const Icon=type==='build'?Plus:type==='sell'?Minus:type==='liquidate'?Building2:Wallet;return <button key={type} className="secondary" disabled={!!error} title={error||`${type} ${s.name}`} onClick={()=>action(type)}><Icon size={16}/>{type==='build'?'Develop':type==='sell'?'Sell unit':type==='liquidate'?'Liquidate group':type==='mortgage'?'Mortgage':'Redeem'}</button>;})}</div>}</>}
    {!a&&<p className="special-description">{s.type==='start'?'Collect N200,000 when passing or landing here.':s.type==='community'||s.type==='chance'?'Draw the top card and resolve its effect.':s.type==='holding'?'Ordinary visitors pay nothing. Detained players must pay, use a card, or roll doubles.':s.type==='goHolding'?'Move directly to Holding. Your turn ends, with no Start payment.':s.type==='tax'?`Pay ${money(s.amount!)} to the bank.`:'Take a break. No fee, jackpot, or extra turn.'}</p>}
  </Modal>;
}
