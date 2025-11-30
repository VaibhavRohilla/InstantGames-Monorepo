import { ProvablyFairContext } from "@instant-games/core-provably-fair";
import { IRngService } from "@instant-games/core-rng";
import { Card, Suit } from "@instant-games/game-math-hilo";

const SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface BuildDeckParams {
  rngService: IRngService;
  context: ProvablyFairContext;
  baseNonce: number;
}

export interface BuiltDeck {
  deck: Card[];
}

export function buildHiloDeck(params: BuildDeckParams): BuiltDeck {
  const { rngService, context, baseNonce } = params;
  const deck = createOrderedDeck();
  // Fisher-Yates shuffle seeded via PF RNG by consuming deterministic offsets from the base nonce.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const drawNonce = baseNonce + (deck.length - 1 - i);
    const rand = rngService.rollFloat(context, drawNonce);
    const j = Math.floor(rand * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return { deck };
}

function createOrderedDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

