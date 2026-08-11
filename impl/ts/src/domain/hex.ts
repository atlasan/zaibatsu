// Hex geometry for the Cybernet. Blocks are hexagonal tiles connected edge to
// edge. Mirrors impl/go/internal/domain/hex.go exactly — same direction ordering,
// edge-facing convention, and rotation convention (the parity/determinism
// contract in DOCS/parity.md). See DOCS/domain-model.md ("Cybernet").
//
// Coordinates are axial (q, r). The six edges of a hex are indexed 0..5 and each
// edge i faces grid direction i. HEX_DIRECTIONS[i] is the delta to the neighbor
// across edge i. The neighbor's edge facing back is opposite(i).

export interface Coord {
  q: number;
  r: number;
}

/** Neighbor deltas per edge/grid direction. Shared with the Go mirror; do not reorder. */
export const HEX_DIRECTIONS: readonly Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Returns the coordinate across edge/direction dir (0..5). */
export function neighbor(c: Coord, dir: number): Coord {
  const d = HEX_DIRECTIONS[(((dir % 6) + 6) % 6)]!;
  return { q: c.q + d.q, r: c.r + d.r };
}

/** Returns the edge that faces back across a shared border. */
export function opposite(dir: number): number {
  return (((dir % 6) + 6 + 3) % 6);
}

/** Stable string key for a coordinate (map keys / equality). */
export function coordKey(c: Coord): string {
  return `${c.q},${c.r}`;
}

export function coordEqual(a: Coord, b: Coord): boolean {
  return a.q === b.q && a.r === b.r;
}

/**
 * A block instance positioned in the Cybernet with a rotation. A block's local
 * edge e faces grid direction (e + rotation) mod 6.
 */
export interface PlacedBlock {
  blockId: string;
  rotation: number;
  coord: Coord;
}

/**
 * The growing hex layout of placed blocks. Blocks are stored in placement order
 * (deterministic iteration); lookups scan the small array.
 */
export class Cybernet {
  blocks: PlacedBlock[] = [];

  at(c: Coord): PlacedBlock | undefined {
    return this.blocks.find((pb) => coordEqual(pb.coord, c));
  }

  occupied(c: Coord): boolean {
    return this.at(c) !== undefined;
  }
}

export function newCybernet(): Cybernet {
  return new Cybernet();
}
