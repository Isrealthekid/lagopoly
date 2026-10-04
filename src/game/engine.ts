import { getBoard } from '../data/boards';
import type { Action, BoardDefinition, GameState, Payment, Space, Trade } from './types';

export const money = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
export const compactMoney = (amount: number) => amount >= 1000000 ? `N${+(amount / 1000000).toFixed(2)}m` : `N${+(amount / 1000).toFixed(1)}k`;
export const redemptionCost = (space: Space) => Math.round(space.price! * 55 / 100);
const transferInterest = (space: Space) => Math.round(space.price! * 5 / 100);
export function addLog(g: GameState, text: string, player: number | null = g.current) {
  g.logs.unshift({ id: ++g.sequence, text, player });
  g.logs = g.logs.slice(0, 70);
}
function changeCash(g:GameState, player:number, amount:number, reason:string) {
  if(!amount)return;
  g.players[player].cash+=amount;
  const events=g.moneyEvents??[];
  g.moneyEvents=[...events.slice(-31),{id:(events.at(-1)?.id??0)+1,player,amount,reason}];
}
export function createGame(board: BoardDefinition, names: string[], tokens: number[], shuffle: <T>(items: T[]) => T[], dice: () => number): GameState {
  if (names.length < 2 || names.length > 4) throw new Error('Choose 2 to 4 players.');
  const players = names.map((name, id) => ({ id, name: name.trim().slice(0, 20) || `Player ${id + 1}`, token: tokens[id], cash: board.startingCash, position: 0, holding: false, attempts: 0, bankrupt: false, cards: [] as string[] }));
  let contenders = players.map(p => p.id), current = 0;
  const opening: string[] = [];
  while (contenders.length > 1) {
    const rolls = contenders.map(id => ({ id, total: dice() + dice() }));
    opening.push(...rolls.map(r => `${players[r.id].name}: ${r.total}`));
    const high = Math.max(...rolls.map(r => r.total));
    contenders = rolls.filter(r => r.total === high).map(r => r.id);
  }
  current = contenders[0];
  const g: GameState = {
    version: 1, layoutVersion: 3, boardId: board.id, players, current, assets: Object.fromEntries(board.spaces.filter(s => s.price).map(s => [s.id, { owner: null, level: 0, mortgaged: false }])),
    phase: 'roll', dice: [1, 1], doubles: 0, extraRoll: false, turn: 1, seed: 0,
    community: shuffle(board.community.map(c => c.id)), chance: shuffle(board.chance.map(c => c.id)), pendingCard: null,
    payments: [], afterPayments: 'manage', pendingMove: null, auction: null, bankAuctions: [], trade: null, tradeReturn: 'manage', transferCharges: [], winner: null, logs: [], sequence: 0,
  };
  addLog(g, `Opening rolls: ${opening.join(' / ')}. ${players[current].name} starts.`, null);
  addLog(g, `Welcome to ${board.name}. Each player receives ${money(board.startingCash)}.`, null);
  return g;
}
export const groupSpaces = (g: GameState, s: Space) => getBoard(g.boardId).spaces.filter(x => s.group && x.group === s.group);
export function ownsGroup(g: GameState, s: Space, player: number): boolean { return !!s.group && groupSpaces(g, s).every(x => g.assets[x.id].owner === player); }
export function inventory(g: GameState) {
  const assets = Object.values(g.assets);
  return { houses: 32 - assets.reduce((n, a) => n + (a.level < 5 ? a.level : 0), 0), hotels: 12 - assets.filter(a => a.level === 5).length };
}
export function fee(g: GameState, space: Space, total: number, special = false): number {
  const a = g.assets[space.id];
  if (!a || a.owner === null || a.mortgaged) return 0;
  if (space.type === 'property') return space.rents![a.level] * (a.level === 0 && ownsGroup(g, space, a.owner) ? 2 : 1);
  const owned = getBoard(g.boardId).spaces.filter(s => s.type === space.type && g.assets[s.id]?.owner === a.owner).length;
  if (space.type === 'brt') return [25000, 50000, 100000, 200000][owned - 1] * (special ? 2 : 1);
  if (space.type === 'utility') return total * (special || owned === 2 ? 10000 : 4000);
  return 0;
}
function requireRule(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function won(g: GameState) {
  const alive = g.players.filter(p => !p.bankrupt);
  if (alive.length === 1) { g.winner = alive[0].id; g.phase = 'won'; g.auction = null; g.trade = null; addLog(g, `${alive[0].name} wins the ${getBoard(g.boardId).city} estate!`, alive[0].id); return true; }
  return false;
}
function nextTurn(g: GameState) {
  if (won(g)) return;
  do { g.current = (g.current + 1) % g.players.length; } while (g.players[g.current].bankrupt);
  g.turn++; g.phase = 'roll'; g.extraRoll = false; g.doubles = 0;
  addLog(g, `${g.players[g.current].name}'s turn.`);
}
function sendHolding(g: GameState) {
  const p = g.players[g.current]; p.position = 10; p.holding = true; p.attempts = 0;
  g.extraRoll = false; g.doubles = 0; g.phase = 'manage';
  addLog(g, `${p.name} goes directly to Kirikiri. No Start payment.`);
}
function moveTo(g: GameState, to: number, forward: boolean) {
  const p = g.players[g.current], board = getBoard(g.boardId);
  if (forward && to <= p.position) { changeCash(g,p.id,board.salary,`Passed GO · ${board.spaces[0].name}`); addLog(g, `${p.name} collects ${money(board.salary)} at ${board.spaces[0].name}.`); }
  p.position = to;
}
function payment(g: GameState, from: number, to: number | null, amount: number, reason: string) {
  if (amount > 0 && from !== to) g.payments.push({ from, to, amount, reason });
}
function startAuction(g: GameState, id: number) {
  const queue: number[] = [];
  for (let i = 0; i < g.players.length; i++) { const id = (g.current + i) % g.players.length; if (!g.players[id].bankrupt) queue.push(id); }
  g.auction = { space: id, high: 0, leader: null, bidder: queue[0], passed: [], queue };
  g.phase = 'auction';
  addLog(g, `${getBoard(g.boardId).spaces[id].name} goes to auction.`, null);
}
function resume(g: GameState, dice: () => number) {
  if (won(g)) return;
  if (g.bankAuctions.length) { startAuction(g, g.bankAuctions.shift()!); return; }
  if (g.players[g.current].bankrupt) { nextTurn(g); return; }
  if (g.afterPayments === 'move' && g.pendingMove !== null) {
    const steps = g.pendingMove; g.pendingMove = null; g.afterPayments = 'manage';
    moveTo(g, (g.players[g.current].position + steps) % 40, true); resolveSpace(g, dice); return;
  }
  g.phase = g.afterPayments === 'roll' ? 'roll' : 'manage'; g.afterPayments = 'manage';
}
function drain(g: GameState, dice: () => number) {
  while (g.payments.length) {
    const debt = g.payments[0], p = g.players[debt.from];
    if (p.bankrupt) { g.payments.shift(); continue; }
    if (p.cash < debt.amount) { g.phase = 'debt'; return; }
    const isRent=getBoard(g.boardId).spaces.some(s=>s.price&&s.name===debt.reason);
    const reason=isRent?`Rent · ${debt.reason}`:debt.reason;
    changeCash(g,p.id,-debt.amount,`${reason} · To ${debt.to===null?'the bank':g.players[debt.to].name}`);
    if (debt.to !== null) changeCash(g,debt.to,debt.amount,`${reason} · From ${p.name}`);
    addLog(g, `${p.name} pays ${money(debt.amount)} to ${debt.to === null ? 'the bank' : g.players[debt.to].name} for ${debt.reason}.`, p.id);
    g.payments.shift();
  }
  if (g.transferCharges.length) { g.phase = 'manage'; return; }
  resume(g, dice);
}
function resolveSpace(g: GameState, dice: () => number, special = false, feeRoll = false) {
  const p = g.players[g.current], board = getBoard(g.boardId), s = board.spaces[p.position];
  addLog(g, `${p.name} arrives at ${s.name}.`);
  if (s.price) {
    const a = g.assets[s.id];
    if (a.owner === null) { g.phase = 'buy'; return; }
    if (a.owner !== p.id && !a.mortgaged) {
      const total = s.type === 'utility' && feeRoll ? dice() + dice() : g.dice[0] + g.dice[1];
      const cost = fee(g, s, total, special);
      if (s.type === 'utility') addLog(g, `Landmark fee roll: ${total}. Usage fee ${money(cost)}.`);
      payment(g, p.id, a.owner, cost, s.name); drain(g, dice); return;
    }
  } else if (s.type === 'community' || s.type === 'chance') {
    const deck = s.type === 'community' ? g.community : g.chance;
    g.pendingCard = deck.shift()!; g.phase = 'card'; return;
  } else if (s.type === 'tax') { payment(g, p.id, null, s.amount!, s.name); drain(g, dice); return; }
  else if (s.type === 'goHolding') { sendHolding(g); return; }
  g.phase = 'manage';
}
function applyCard(g: GameState, dice: () => number) {
  requireRule(g.phase === 'card' && g.pendingCard, 'No card is waiting.');
  const board = getBoard(g.boardId), c = [...board.community, ...board.chance].find(c => c.id === g.pendingCard)!;
  const p = g.players[g.current], e = c.effect;
  g.pendingCard = null; g.phase = 'manage';
  addLog(g, `${p.name}: ${c.title}. ${c.text}`);
  if (e.kind !== 'release') (c.id.startsWith('CC') ? g.community : g.chance).push(c.id);
  switch (e.kind) {
    case 'release': p.cards.push(c.id); break;
    case 'cash': if (e.amount >= 0) changeCash(g,p.id,e.amount,`${c.title} · Card reward`); else payment(g, p.id, null, -e.amount, c.title); drain(g, dice); break;
    case 'holding': sendHolding(g); break;
    case 'move': moveTo(g, e.to, true); resolveSpace(g, dice, false, true); break;
    case 'back': moveTo(g, (p.position - e.steps + 40) % 40, false); resolveSpace(g, dice, false, true); break;
    case 'nearest': {
      let id = (p.position + 1) % 40;
      while (board.spaces[id].type !== e.type) id = (id + 1) % 40;
      moveTo(g, id, true); resolveSpace(g, dice, e.special, true); break;
    }
    case 'repair': {
      const total = Object.values(g.assets).filter(a => a.owner === p.id).reduce((n, a) => n + (a.level === 5 ? e.hotel : a.level * e.house), 0);
      payment(g, p.id, null, total, c.title); drain(g, dice); break;
    }
    case 'each':
      for (let i = 1; i < g.players.length; i++) {
        const other = g.players[(p.id + i) % g.players.length];
        if (!other.bankrupt) payment(g, e.amount > 0 ? other.id : p.id, e.amount > 0 ? p.id : other.id, Math.abs(e.amount), c.title);
      }
      drain(g, dice); break;
  }
}
export function managementPlayer(g: GameState) { return g.phase === 'debt' ? g.payments[0].from : g.transferCharges[0]?.player ?? g.current; }
export function assetActionError(g: GameState, type: 'build' | 'sell' | 'mortgage' | 'redeem' | 'liquidate', id: number, player: number): string | null {
  if (!['roll', 'manage', 'debt'].includes(g.phase)) return 'Finish the pending action first.';
  const s = getBoard(g.boardId).spaces[id], a = g.assets[id], p = g.players[player];
  if (!a || !p || a.owner !== player || p.bankrupt) return 'This asset belongs to another player.';
  if (g.phase === 'debt' && player !== g.payments[0].from) return 'Only the debtor can manage assets now.';
  if (g.transferCharges.length && g.phase !== 'debt') return 'Resolve the inherited mortgage first.';
  const group = groupSpaces(g, s), levels = group.map(x => g.assets[x.id].level), stock = inventory(g);
  if (type === 'build') {
    if (g.phase === 'debt') return 'Settle the debt before developing.';
    if (!ownsGroup(g, s, player)) return 'Own the whole colour group first.';
    if (group.some(x => g.assets[x.id].mortgaged)) return 'Redeem all group mortgages first.';
    if (a.level >= 5) return 'Already a flagship.';
    if (a.level !== Math.min(...levels)) return 'Develop the group evenly.';
    if (p.cash < s.buildingCost!) return 'Not enough cash.';
    if (a.level === 4 ? stock.hotels === 0 : stock.houses === 0) return 'The bank has no available development pieces.';
  }
  if (type === 'sell') {
    if (!a.level) return 'No development to sell.';
    if (a.level !== Math.max(...levels)) return 'Sell development evenly.';
    if (a.level === 5 && stock.houses < 4) return 'Not enough bank units; liquidate the whole group instead.';
  }
  if (type === 'liquidate' && !levels.some(n => n > 0)) return 'No group development to liquidate.';
  if (type === 'mortgage') {
    if (a.mortgaged) return 'Already mortgaged.';
    if (levels.some(n => n > 0)) return 'Sell all development in this group first.';
  }
  if (type === 'redeem') {
    if (!a.mortgaged) return 'This asset is not mortgaged.';
    if (g.phase === 'debt') return 'Settle the debt first.';
    if (p.cash < redemptionCost(s)) return 'Not enough cash to redeem.';
  }
  return null;
}
function tradeError(g: GameState, t: Trade): string | null {
  const from = g.players[t.from], to = g.players[t.to];
  if (!from || !to || from.bankrupt || to.bankrupt || t.from === t.to) return 'Choose two active players.';
  if (![t.giveCash, t.takeCash].every(n => Number.isSafeInteger(n) && n >= 0)) return 'Cash offers must be positive whole amounts.';
  const board = getBoard(g.boardId);
  const costs = [t.giveCash, t.takeCash];
  for (const [assets, owner, recipient] of [[t.give, t.from, 1], [t.take, t.to, 0]] as const) {
    if (new Set(assets).size !== assets.length) return 'An asset cannot appear twice.';
    for (const id of assets) {
      const a = g.assets[id], s = board.spaces[id];
      if (!a || a.owner !== owner) return 'An offered asset changed owner.';
      if (groupSpaces(g, s).some(x => g.assets[x.id].level > 0)) return 'Sell all group development before trading.';
      if (a.mortgaged) costs[recipient] += transferInterest(s);
    }
  }
  for (const [cards, owner] of [[t.giveCards, t.from], [t.takeCards, t.to]] as const) {
    if (new Set(cards).size !== cards.length || cards.some(c => !g.players[owner].cards.includes(c))) return 'A release card is no longer available.';
  }
  if (from.cash < costs[0] || to.cash < costs[1]) return 'Cash must also cover incoming mortgage interest.';
  if (!(t.give.length + t.take.length + t.giveCards.length + t.takeCards.length + t.giveCash + t.takeCash)) return 'Add an asset or cash to the trade.';
  return null;
}
export function transition(state: GameState, action: Action, dice: () => number): GameState {
  const g: GameState = JSON.parse(JSON.stringify(state));
  const board = getBoard(g.boardId), p = g.players[g.current];
  requireRule(g.phase !== 'won'||action.type==='readTradeNotifications', 'This game has finished.');
  if (g.transferCharges.length && g.phase !== 'debt') requireRule(action.type === 'transfer'||action.type==='readTradeNotifications', 'Resolve the inherited mortgage first.');
  switch (action.type) {
    case 'roll': {
      requireRule(g.phase === 'roll', 'Finish the current action before rolling.');
      const d: [number, number] = [dice(), dice()]; g.dice = d;
      addLog(g, `${p.name} rolls ${d[0]} + ${d[1]}.`);
      if (p.holding) {
        p.attempts++; g.extraRoll = false;
        if (d[0] !== d[1] && p.attempts < 3) { g.phase = 'manage'; addLog(g, `${p.name} stays in Kirikiri (${p.attempts}/3 attempts).`); break; }
        p.holding = false; p.attempts = 0;
        if (d[0] !== d[1]) { g.pendingMove = d[0] + d[1]; g.afterPayments = 'move'; payment(g, p.id, null, board.releaseFee, 'Kirikiri release'); drain(g, dice); break; }
      } else {
        g.extraRoll = d[0] === d[1]; g.doubles = g.extraRoll ? g.doubles + 1 : 0;
        if (g.doubles === 3) { sendHolding(g); break; }
      }
      moveTo(g, (p.position + d[0] + d[1]) % 40, true); resolveSpace(g, dice); break;
    }
    case 'release': {
      requireRule(g.phase === 'roll' && p.holding, 'You are not waiting in Kirikiri.');
      if (action.method === 'card') { requireRule(p.cards.length, 'No release card available.'); const id = p.cards.shift()!; (id.startsWith('CC') ? g.community : g.chance).push(id); addLog(g, `${p.name} uses a release card.`); }
      else { payment(g, p.id, null, board.releaseFee, 'Kirikiri release'); g.afterPayments = 'roll'; }
      p.holding = false; p.attempts = 0; g.doubles = 0; g.afterPayments = 'roll'; drain(g, dice); break;
    }
    case 'end': requireRule(g.phase === 'manage', 'Resolve the space before ending your turn.'); if (g.extraRoll) { g.phase = 'roll'; g.extraRoll = false; } else nextTurn(g); break;
    case 'buy': {
      requireRule(g.phase === 'buy', 'No asset is waiting to be bought.'); const s = board.spaces[p.position], a = g.assets[s.id];
      requireRule(a.owner === null && p.cash >= s.price!, 'Not enough cash; start an auction instead.');
      changeCash(g,p.id,-s.price!,`Property purchase · ${s.name}`); a.owner = p.id; g.phase = 'manage'; addLog(g, `${p.name} buys ${s.name} for ${money(s.price!)}.`); break;
    }
    case 'auction': requireRule(g.phase === 'buy', 'No purchase is waiting.'); startAuction(g, p.position); break;
    case 'bid': case 'pass': {
      requireRule(g.phase === 'auction' && g.auction, 'No auction is in progress.'); const a = g.auction, bidder = g.players[a.bidder];
      if (action.type === 'bid') { requireRule(Number.isSafeInteger(action.amount) && action.amount >= a.high + 1000 && bidder.cash >= action.amount, 'Bid at least N1,000 above the current bid, within your cash.'); a.high = action.amount; a.leader = bidder.id; addLog(g, `${bidder.name} bids ${money(a.high)}.`, bidder.id); }
      else { a.passed.push(bidder.id); addLog(g, `${bidder.name} passes.`, bidder.id); }
      const challengers = a.queue.filter(id => !a.passed.includes(id) && id !== a.leader);
      if (!challengers.length) {
        if (a.leader !== null) { changeCash(g,a.leader,-a.high,`Auction purchase · ${board.spaces[a.space].name}`); g.assets[a.space].owner = a.leader; addLog(g, `${g.players[a.leader].name} wins ${board.spaces[a.space].name} for ${money(a.high)}.`, a.leader); }
        else addLog(g, 'No bids. The asset remains with the bank.', null);
        g.auction = null; drain(g, dice);
      } else { const index = a.queue.indexOf(a.bidder); for (let i = 1; i <= a.queue.length; i++) { const next = a.queue[(index + i) % a.queue.length]; if (challengers.includes(next)) { a.bidder = next; break; } } }
      break;
    }
    case 'card': applyCard(g, dice); break;
    case 'settle': requireRule(g.phase === 'debt', 'No payment is waiting.'); requireRule(g.players[g.payments[0].from].cash >= g.payments[0].amount, 'Raise enough cash first.'); drain(g, dice); break;
    case 'bankrupt': {
      requireRule(g.phase === 'debt' && g.payments.length, 'No debt to resolve.'); const debt = g.payments[0], debtor = g.players[debt.from];
      const capacity = debtor.cash + board.spaces.reduce((n, s) => { const a = g.assets[s.id]; if (!a || a.owner !== debtor.id) return n; return n + (!a.mortgaged ? s.price! / 2 : 0) + (a.level * (s.buildingCost || 0) / 2); }, 0);
      requireRule(capacity < debt.amount, 'You can still settle by liquidating and mortgaging assets.');
      for (const s of board.spaces) { const a = g.assets[s.id]; if (!a || a.owner !== debtor.id) continue;
        changeCash(g,debtor.id,a.level*(s.buildingCost||0)/2,`Building sale · ${s.name}`); a.level = 0;
        a.owner = debt.to;
        if (debt.to === null) { a.mortgaged = false; g.bankAuctions.push(s.id); }
        else if (a.mortgaged) g.transferCharges.push({ player: debt.to, space: s.id });
      }
      if (debt.to !== null) { changeCash(g,debt.to,debtor.cash,`Bankruptcy settlement · From ${debtor.name}`); g.players[debt.to].cards.push(...debtor.cards); }
      else for (const id of debtor.cards) (id.startsWith('CC') ? g.community : g.chance).push(id);
      changeCash(g,debtor.id,-debtor.cash,`Bankruptcy settlement · ${debt.reason}`); debtor.cards = []; debtor.bankrupt = true;
      g.payments = g.payments.filter(x => x.from !== debtor.id); g.transferCharges = g.transferCharges.filter(x => x.player !== debtor.id);
      addLog(g, `${debtor.name} is bankrupt. Assets ${debt.to === null ? 'return to the bank' : `transfer to ${g.players[debt.to].name}`}.`, debtor.id);
      if (!won(g)) drain(g, dice); break;
    }
    case 'transfer': {
      requireRule(g.transferCharges.length && g.phase !== 'debt', 'No inherited mortgage is waiting.');
      const t = g.transferCharges.shift()!, s = board.spaces[t.space];
      if (action.redeem) requireRule(g.players[t.player].cash >= redemptionCost(s), 'Raise enough cash before redeeming, or keep the mortgage.');
      payment(g, t.player, null, action.redeem ? redemptionCost(s) : transferInterest(s), `${s.name} mortgage transfer`);
      if (action.redeem) g.assets[t.space].mortgaged = false;
      drain(g, dice); break;
    }
    case 'build': case 'sell': case 'mortgage': case 'redeem': case 'liquidate': {
      const error = assetActionError(g, action.type, action.space, action.player); requireRule(!error, error || 'Unavailable action.');
      const s = board.spaces[action.space], a = g.assets[s.id], owner = g.players[action.player];
      if (action.type === 'build') { changeCash(g,owner.id,-s.buildingCost!,`Construction · ${s.name}`); a.level++; }
      if (action.type === 'sell') { changeCash(g,owner.id,s.buildingCost!/2,`Building sale · ${s.name}`); a.level--; }
      if (action.type === 'liquidate') for (const x of groupSpaces(g, s)) { changeCash(g,owner.id,g.assets[x.id].level*x.buildingCost!/2,`Building sale · ${x.name}`); g.assets[x.id].level = 0; }
      if (action.type === 'mortgage') { changeCash(g,owner.id,s.price!/2,`Mortgage proceeds · ${s.name}`); a.mortgaged = true; }
      if (action.type === 'redeem') { changeCash(g,owner.id,-redemptionCost(s),`Mortgage redemption · ${s.name}`); a.mortgaged = false; }
      addLog(g, `${owner.name}: ${action.type} ${s.name}.`, owner.id); break;
    }
    case 'readTradeNotifications': {
      if(action.player!==undefined)requireRule(Number.isInteger(action.player)&&!!g.players[action.player],'Choose a player.');
      for(const notice of g.tradeNotifications??[]) {
        if(action.player===undefined)notice.read=true;
        else notice.readBy=[...new Set([...(notice.readBy??[]),action.player])];
      }
      break;
    }
    case 'trade': {
      requireRule(['manage', 'roll', 'debt'].includes(g.phase), 'Resolve the pending action first.');
      requireRule(g.phase !== 'debt' || (action.proposal.from === g.payments[0].from && action.proposal.take.length === 0 && action.proposal.takeCards.length === 0 && action.proposal.giveCash === 0 && action.proposal.takeCash > 0), 'During debt, only sell your assets or cards for cash.');
      const error = tradeError(g, action.proposal); requireRule(!error, error || 'Invalid trade.');
      g.tradeReturn = g.phase as 'roll' | 'manage' | 'debt'; g.trade = action.proposal; g.phase = 'trade';
      g.tradeNotifications = [...(g.tradeNotifications ?? []).slice(-29), {from: g.trade.from, to: g.trade.to, status: 'proposed', read: false}]; break;
    }
    case 'rejectTrade': {
      requireRule(g.phase === 'trade' && g.trade, 'No trade is waiting.');
      const notice = g.tradeNotifications?.slice().reverse().find(n=>n.status==='proposed');
      if (notice) { notice.status = 'declined'; notice.read = false; notice.readBy = []; }
      else g.tradeNotifications = [...(g.tradeNotifications ?? []), {from:g.trade!.from,to:g.trade!.to,status:'declined',read:false}];
      g.trade = null; g.phase = g.tradeReturn; break;
    }
    case 'acceptTrade': {
      requireRule(g.phase === 'trade' && g.trade, 'No trade is waiting.'); const t = g.trade, error = tradeError(g, t); requireRule(!error, error || 'Invalid trade.');
      const from = g.players[t.from], to = g.players[t.to]; changeCash(g,from.id,-t.giveCash,`Trade payment · To ${to.name}`);changeCash(g,to.id,t.giveCash,`Trade payment · From ${from.name}`);
      changeCash(g,to.id,-t.takeCash,`Trade payment · To ${from.name}`);changeCash(g,from.id,t.takeCash,`Trade payment · From ${to.name}`);
      const notice = g.tradeNotifications?.slice().reverse().find(n=>n.status==='proposed');
      if (notice) { notice.status = 'accepted'; notice.read = false; notice.readBy = []; }
      else g.tradeNotifications = [...(g.tradeNotifications ?? []), {from:t.from,to:t.to,status:'accepted',read:false}];
      for (const [ids, recipient] of [[t.give, t.to], [t.take, t.from]] as const) for (const id of ids) { const a = g.assets[id]; a.owner = recipient; if (a.mortgaged) changeCash(g,recipient,-transferInterest(board.spaces[id]),`Mortgage transfer interest · ${board.spaces[id].name}`); }
      from.cards = from.cards.filter(c => !t.giveCards.includes(c)).concat(t.takeCards); to.cards = to.cards.filter(c => !t.takeCards.includes(c)).concat(t.giveCards);
      addLog(g, `${from.name} and ${to.name} complete a trade. Incoming mortgages remain active; 10% transfer interest is paid.`, null);
      g.trade = null; if (g.tradeReturn === 'roll') g.afterPayments = 'roll'; drain(g, dice); break;
    }
  }
  return g;
}
