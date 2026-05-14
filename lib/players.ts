import { Player, IdentityDNA, IPLEra, AuraEmbedding } from './types';
import { PLAYERS as GENERATED_PLAYERS } from './players_generated';

export type { Player, IdentityDNA, IPLEra, AuraEmbedding };
export const PLAYERS: Player[] = GENERATED_PLAYERS as Player[];

