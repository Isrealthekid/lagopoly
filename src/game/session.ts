import { Client } from 'boardgame.io/client';
import { INVALID_MOVE } from 'boardgame.io/core';
import type { Game, State } from 'boardgame.io';
import { getBoard } from '../data/boards';
import { createGame, inventory, transition } from './engine';
import type { Action, GameState } from './types';

export const SAVE_KEY = 'naija-estates.local.v1';
type Saved = { format: 1; savedAt: string; state: State<GameState> };

export function validateSave(value: unknown): Saved {
  const v = structuredClone(value) as Saved, g = v?.state?.G;
  const check = (test: unknown) => { if (!test) throw new Error('This saved game is invalid or uses an unsupported version.'); };
  const integer = (n: unknown, min = 0) => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
  check(v?.format === 1 && typeof v.savedAt === 'string' && g?.version === 1 && typeof g.boardId === 'string');
  const board = getBoard(g.boardId);
  // Keep asset identity when restoring tables created before the edge alignment.
  if (g.boardId === 'lagos' && (g.layoutVersion === undefined || g.layoutVersion === 1)) {
    const positions: Record<number, number> = { 29: 31, 31: 32, 32: 34, 34: 29 };
    const relocate = (id: number) => positions[id] ?? id;
    check(Array.isArray(g.players) && g.assets && Array.isArray(g.bankAuctions) && Array.isArray(g.transferCharges));
    g.players.forEach(p => { p.position = relocate(p.position); });
    g.assets = Object.fromEntries(Object.entries(g.assets).map(([id, asset]) => [relocate(Number(id)), asset]));
    if (g.auction) g.auction.space = relocate(g.auction.space);
    g.bankAuctions = g.bankAuctions.map(relocate);
    g.transferCharges.forEach(t => { t.space = relocate(t.space); });
    if (g.trade) {
      check(Array.isArray(g.trade.give) && Array.isArray(g.trade.take));
      g.trade.give = g.trade.give.map(relocate);
      g.trade.take = g.trade.take.map(relocate);
    }
    g.layoutVersion = 2;
    v.state._undo = []; v.state._redo = []; v.state.deltalog = [];
  }
  if (g.boardId === 'lagos' && g.layoutVersion === 2) {
    check(Array.isArray(g.players) && g.assets && Array.isArray(g.bankAuctions) && Array.isArray(g.transferCharges));
    const removed = g.assets[1];
    check(removed && g.assets[2]);
    if (removed.owner !== null) {
      check(integer(removed.owner) && !!g.players[removed.owner] && integer(removed.level) && removed.level <= 5);
      g.players[removed.owner].cash += (removed.mortgaged ? 30000 : 60000) + removed.level * 50000;
    }
    const relocate = (id: number) => id === 2 ? 1 : id === 29 ? 2 : id;
    if (g.phase === 'buy' && g.players[g.current]?.position === 1) g.phase = 'manage';
    g.players.forEach(p => { p.position = relocate(p.position); });
    g.assets[1] = g.assets[2]; delete g.assets[2];
    g.assets[29] = { owner: null, level: 0, mortgaged: false };
    g.bankAuctions = g.bankAuctions.filter(id=>id!==1).map(relocate);
    g.transferCharges = g.transferCharges.filter(t=>t.space!==1).map(t=>({...t,space:relocate(t.space)}));
    if (g.auction) {
      if (g.auction.space === 1) { g.auction = null; g.phase = 'manage'; }
      else g.auction.space = relocate(g.auction.space);
    }
    if (g.trade) {
      g.trade = null; g.phase = g.tradeReturn;
    }
    g.layoutVersion = 3;
    v.state._undo = []; v.state._redo = []; v.state.deltalog = [];
  }
  check(g.layoutVersion === 3);
  if (g.tradeNotifications !== undefined) {
    check(Array.isArray(g.tradeNotifications) && g.tradeNotifications.length <= 30);
    check(g.tradeNotifications.every(n=>integer(n.from)&&integer(n.to)&&n.from<g.players.length&&n.to<g.players.length&&['proposed','accepted','declined'].includes(n.status)&&typeof n.read==='boolean'));
    check(g.tradeNotifications.every(n=>n.readBy===undefined||(Array.isArray(n.readBy)&&n.readBy.every(id=>integer(id)&&id<g.players.length))));
  }
  check(Array.isArray(g.players) && g.players.length >= 2 && g.players.length <= 4);
  if(g.aiPlayers!==undefined)check(Array.isArray(g.aiPlayers)&&g.aiPlayers.every(id=>integer(id)&&id>0&&id<g.players.length)&&new Set(g.aiPlayers).size===g.aiPlayers.length);
  check(integer(g.current) && g.current < g.players.length && integer(g.turn, 1) && integer(g.sequence));
  check(['roll', 'buy', 'card', 'manage', 'debt', 'auction', 'trade', 'won'].includes(g.phase));
  check(['roll','manage','debt'].includes(g.tradeReturn) && ['roll','manage','move'].includes(g.afterPayments));
  const cardIds = [...board.community, ...board.chance].map(c => c.id);
  const releaseIds = [...board.community, ...board.chance].filter(c=>c.effect.kind==='release').map(c=>c.id);
  for (const [index, p] of g.players.entries()) {
    check(p.id === index && typeof p.name === 'string' && p.name.trim().length && p.name.length <= 20);
    check(integer(p.cash) && integer(p.position) && p.position < 40 && integer(p.token) && p.token < 6);
    check(typeof p.holding === 'boolean' && typeof p.bankrupt === 'boolean' && integer(p.attempts) && p.attempts <= 3);
    check(Array.isArray(p.cards) && p.cards.every(id => releaseIds.includes(id)));
    check(!p.holding || p.position === 10);
  }
  if(g.moneyEvents!==undefined){
    check(Array.isArray(g.moneyEvents)&&g.moneyEvents.length<=32);
    check(g.moneyEvents.every((e,i)=>integer(e.id,1)&&integer(e.player)&&e.player<g.players.length&&Number.isSafeInteger(e.amount)&&e.amount!==0&&typeof e.reason==='string'&&e.reason.length<=200&&(i===0||e.id>g.moneyEvents![i-1].id)));
  }
  check(new Set(g.players.map(p => p.token)).size === g.players.length);
  const ownable = board.spaces.filter(s => s.price);
  check(g.assets && Object.keys(g.assets).length === ownable.length);
  for (const s of ownable) {
    const a = g.assets[s.id];
    check(a && (a.owner === null || (integer(a.owner) && a.owner < g.players.length && !g.players[a.owner].bankrupt)));
    check(integer(a.level) && a.level <= 5 && typeof a.mortgaged === 'boolean');
    check(!a.level || (s.group && a.owner !== null && !a.mortgaged));
    check(a.owner !== null || (!a.level && !a.mortgaged));
  }
  for (const group of Object.keys(board.groups)) {
    const assets = board.spaces.filter(s => s.group === group).map(s => g.assets[s.id]);
    if (assets.some(a => a.level)) check(assets.every(a => a.owner === assets[0].owner && !a.mortgaged) && Math.max(...assets.map(a=>a.level)) - Math.min(...assets.map(a=>a.level)) <= 1);
  }
  check(inventory(g).houses >= 0 && inventory(g).hotels >= 0);
  check(Array.isArray(g.community) && Array.isArray(g.chance));
  check(g.community.every(id => id.startsWith('CC')) && g.chance.every(id => id.startsWith('CH')));
  const all = [...g.community, ...g.chance, ...g.players.flatMap(p => p.cards), ...(g.pendingCard ? [g.pendingCard] : [])];
  check(all.length === cardIds.length && new Set(all).size === all.length && all.every(id => cardIds.includes(id)));
  check((g.phase === 'card') === (g.pendingCard !== null));
  check(Array.isArray(g.dice) && g.dice.length === 2 && g.dice.every(n => integer(n,1) && n <= 6));
  check(typeof g.extraRoll === 'boolean' && integer(g.doubles) && g.doubles <= 3);
  check(g.pendingMove === null || (integer(g.pendingMove,2) && g.pendingMove <= 12));
  check(Array.isArray(g.payments) && g.payments.every(d => integer(d.from) && d.from < g.players.length && (d.to === null || (integer(d.to) && d.to < g.players.length)) && integer(d.amount,1) && typeof d.reason === 'string'));
  check(g.phase !== 'debt' || g.payments.length > 0);
  check(Array.isArray(g.bankAuctions) && g.bankAuctions.every(id => g.assets[id]?.owner === null));
  check(Array.isArray(g.transferCharges) && g.transferCharges.every(t => integer(t.player) && g.assets[t.space]?.owner === t.player && g.assets[t.space].mortgaged));
  if (g.phase === 'auction') {
    const a = g.auction;
    check(a && g.assets[a.space]?.owner === null && integer(a.high) && integer(a.bidder) && a.bidder < g.players.length);
    check(Array.isArray(a!.queue) && a!.queue.length && a!.queue.every(id => integer(id) && id < g.players.length && !g.players[id].bankrupt));
    check(Array.isArray(a!.passed) && a!.passed.every(id => a!.queue.includes(id)) && a!.queue.includes(a!.bidder));
    check(a!.leader === null || (a!.queue.includes(a!.leader) && g.players[a!.leader].cash >= a!.high));
  } else check(g.auction === null);
  if (g.phase === 'trade') {
    const t = g.trade; check(t && integer(t.from) && integer(t.to) && t.from < g.players.length && t.to < g.players.length && t.from !== t.to);
    check(Array.isArray(t!.give) && Array.isArray(t!.take) && [...t!.give,...t!.take].every(id => !!g.assets[id]));
    check(Array.isArray(t!.giveCards) && Array.isArray(t!.takeCards) && integer(t!.giveCash) && integer(t!.takeCash));
  } else check(g.trade === null);
  check(g.winner === null || (integer(g.winner) && g.winner < g.players.length));
  check((g.phase === 'won') === (g.winner !== null));
  check(Array.isArray(g.logs) && g.logs.length <= 70 && g.logs.every(l => integer(l.id) && typeof l.text === 'string' && (l.player === null || (integer(l.player) && l.player < g.players.length))));
  check(v.state.ctx?.numPlayers === g.players.length && typeof v.state.ctx.currentPlayer === 'string' && Array.isArray(v.state.ctx.playOrder));
  check(integer(v.state._stateID) && v.state.plugins?.random?.data?.seed !== undefined);
  return v;
}
export function readSave(): { save: Saved | null; error: string | null } {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return { save: raw ? validateSave(JSON.parse(raw)) : null, error: null };
  } catch { return { save: null, error: 'The saved table could not be restored. Start a new game to continue.' }; }
}

export function createSession(boardId: string, names: string[], tokens: number[], saved?: Saved, aiPlayers: number[] = []) {
  let error: string | null = null;
  const game: Game<GameState> = {
    name: 'naija-estates', minPlayers: 2, maxPlayers: 4, disableUndo: true,
    setup: ({ random }) => ({...createGame(getBoard(boardId), names, tokens, items => random.Shuffle(items), () => random.D6() as number),aiPlayers}),
    moves: {
      act: { undoable: false, move: ({ G, random }, action: Action) => {
        try { error = null; return transition(G, action, () => random.D6() as number); }
        catch (e) { error = e instanceof Error ? e.message : 'Action unavailable.'; return INVALID_MOVE; }
      } },
    },
  };
  const client = Client({ game, numPlayers: names.length, debug: false });
  if (saved) client.store.dispatch({ type: 'RESET', state: saved.state, clientOnly: true });
  const snapshot = (): Saved => ({ format: 1, savedAt: new Date().toISOString(), state: { ...client.store.getState(), _undo: [], _redo: [], deltalog: [] } });
  return {
    get: () => client.getState()!.G,
    subscribe: (callback: (g: GameState) => void) => client.subscribe(state => { if (state) callback(state.G); }),
    dispatch: (action: Action) => { client.moves.act(action); if (error) throw new Error(error); },
    snapshot,
    save: () => {
      const envelope = snapshot();
      localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
      return envelope.savedAt;
    },
    start: () => client.start(), stop: () => client.stop(),
  };
}
export type Session = ReturnType<typeof createSession>;
