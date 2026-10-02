export type SpaceType = 'start' | 'property' | 'community' | 'chance' | 'tax' | 'brt' | 'utility' | 'holding' | 'rest' | 'goHolding';
export interface Space { id: number; name: string; short?: string; type: SpaceType; price?: number; group?: string; rents?: number[]; buildingCost?: number; amount?: number }
export type CardEffect = { kind: 'cash'; amount: number } | { kind: 'move'; to: number } | { kind: 'holding' } | { kind: 'release' } | { kind: 'each'; amount: number } | { kind: 'repair'; house: number; hotel: number } | { kind: 'back'; steps: number } | { kind: 'nearest'; type: 'brt' | 'utility'; special: boolean };
export interface Card { id: string; title: string; text: string; effect: CardEffect }
export interface BoardDefinition { id: string; name: string; city: string; description: string; artwork: string; spaces: Space[]; groups: Record<string, { name: string; color: string }>; community: Card[]; chance: Card[]; startingCash: number; salary: number; releaseFee: number }
export interface Player { id: number; name: string; token: number; cash: number; position: number; holding: boolean; attempts: number; bankrupt: boolean; cards: string[] }
export interface Asset { owner: number | null; level: number; mortgaged: boolean }
export interface Payment { from: number; to: number | null; amount: number; reason: string }
export interface Auction { space: number; bidder: number; high: number; leader: number | null; passed: number[]; queue: number[] }
export interface Trade { from: number; to: number; give: number[]; take: number[]; giveCash: number; takeCash: number; giveCards: string[]; takeCards: string[] }
export interface MoneyEvent { id:number; player:number; amount:number; reason:string }
export interface GameState {
  moneyEvents?: MoneyEvent[];
  version: 1; layoutVersion?: number; boardId: string; players: Player[]; assets: Record<number, Asset>; current: number;
  aiPlayers?: number[];
  tradeNotifications?: { from: number; to: number; status: 'proposed' | 'accepted' | 'declined'; read: boolean; readBy?: number[] }[];
  phase: 'roll' | 'buy' | 'card' | 'manage' | 'debt' | 'auction' | 'trade' | 'won';
  dice: [number, number]; doubles: number; extraRoll: boolean; turn: number;
  seed: number; community: string[]; chance: string[]; pendingCard: string | null;
  payments: Payment[]; afterPayments: 'manage' | 'roll' | 'move'; pendingMove: number | null;
  auction: Auction | null; bankAuctions: number[]; trade: Trade | null; tradeReturn: 'roll' | 'manage' | 'debt';
  transferCharges: { player: number; space: number }[]; winner: number | null;
  logs: { id: number; text: string; player: number | null }[]; sequence: number;
}
export type Action = { type: 'roll' } | { type: 'end' } | { type: 'buy' } | { type: 'auction' } | { type: 'bid'; amount: number } | { type: 'pass' } | { type: 'card' } | { type: 'settle' } | { type: 'bankrupt' } | { type: 'build' | 'sell' | 'mortgage' | 'redeem' | 'liquidate'; space: number; player: number } | { type: 'release'; method: 'pay' | 'card' } | { type: 'trade'; proposal: Trade } | { type: 'acceptTrade' | 'rejectTrade' } | { type: 'transfer'; redeem: boolean } | {type:'readTradeNotifications';player?:number};
