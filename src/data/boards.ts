import { lagos } from './lagos';
import type { BoardDefinition } from '../game/types';

export const boards: Record<string, BoardDefinition> = { [lagos.id]: lagos };
export function getBoard(id: string): BoardDefinition {
  if (!boards[id]) throw new Error('This board edition is not available.');
  return boards[id];
}
