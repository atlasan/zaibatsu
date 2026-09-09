import { coordKey, neighbor, type BonusIcon, type Coord, type PlacedBlock } from "../domain/hex.ts";
import { blockById, playerById, type Block, type GameData, type GameState } from "../domain/types.ts";

const CORNER_DIRECTIONS: Array<readonly [number, number]> = [
  [1, 2],
  [0, 1],
  [5, 0],
  [4, 5],
  [3, 4],
  [2, 3],
];

function compareCoords(a: Coord, b: Coord): number {
  return a.q === b.q ? a.r - b.r : a.q - b.q;
}

function sortedCoords(coords: Coord[]): Coord[] {
  return coords.map((coord) => ({ ...coord })).sort(compareCoords);
}

function keyForCoords(coords: Coord[]): string {
  return sortedCoords(coords).map(coordKey).join("|");
}

function bonusCornersFor(block: Block): boolean[] {
  return Array.isArray(block.bonusCorners) && block.bonusCorners.length === 6
    ? block.bonusCorners
    : [false, false, false, false, false, false];
}

function vertexCoordsForCorner(coord: Coord, rotation: number, cornerIndex: number): Coord[] {
  const [dirA, dirB] = CORNER_DIRECTIONS[cornerIndex]!;
  return sortedCoords([
    coord,
    neighbor(coord, (dirA + rotation) % 6),
    neighbor(coord, (dirB + rotation) % 6),
  ]);
}

function blockVertexKeys(block: Block, placed: PlacedBlock): Array<{ key: string; coords: Coord[] }> {
  return bonusCornersFor(block).flatMap((hasFragment, cornerIndex) => {
    if (!hasFragment) return [];
    const coords = vertexCoordsForCorner(placed.coord, placed.rotation, cornerIndex);
    return [{ key: keyForCoords(coords), coords }];
  });
}

function blockHasFragmentAtKey(gd: GameData, placed: PlacedBlock, key: string): boolean {
  const block = blockById(gd, placed.blockId);
  if (!block) return false;
  return blockVertexKeys(block, placed).some((entry) => entry.key === key);
}

/**
 * Detects any newly formed bonus icons created by the latest placed block and
 * stores them on the board exactly once.
 */
export function detectBonusIconsAfterPlacement(
  s: GameState,
  gd: GameData,
  placed: PlacedBlock,
): BonusIcon[] {
  const block = blockById(gd, placed.blockId);
  if (!block) return [];
  const created: BonusIcon[] = [];
  for (const candidate of blockVertexKeys(block, placed)) {
    if (s.cybernet.bonusIcons.some((icon) => icon.key === candidate.key)) continue;
    const incident = candidate.coords.map((coord) => s.cybernet.at(coord));
    if (incident.some((entry) => !entry)) continue;
    if (!incident.every((entry) => blockHasFragmentAtKey(gd, entry!, candidate.key))) continue;
    const icon: BonusIcon = { key: candidate.key, coords: candidate.coords };
    s.cybernet.bonusIcons.push(icon);
    created.push(icon);
  }
  return created;
}

/**
 * Collects any formed bonus icons now controlled by playerId. Each icon pays
 * exactly one counter once for the whole game.
 */
export function collectControlledBonusIcons(
  s: GameState,
  playerId: string,
): BonusIcon[] {
  const player = playerById(s, playerId);
  if (!player) return [];
  const collected: BonusIcon[] = [];
  for (const icon of s.cybernet.bonusIcons) {
    if (icon.collectedBy) continue;
    if (!icon.coords.every((coord) => s.cybernet.at(coord)?.ownerId === playerId)) continue;
    icon.collectedBy = playerId;
    player.bonusCounters++;
    collected.push(icon);
  }
  return collected;
}
