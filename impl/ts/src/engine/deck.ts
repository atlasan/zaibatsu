import type { GameState } from "../domain/types.ts";

/** Draw one physical card, recycling the public discard only when necessary. */
export function draw(s: GameState): string | undefined {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return undefined;
    s.deck = s.discard;
    s.discard = [];
    s.rng.shuffle(s.deck);
  }
  return s.deck.pop();
}
