import {validateBlockBonus} from "./block-bonus.ts";
import {requireBonusReserve,validateGlobalBonusEffect} from "./bonus-pool.ts";
import { newCybernet,coordKey, neighbor, type BonusIcon, type Coord, type PlacedBlock } from "../domain/hex.ts";
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

/** Pure candidate calculation; the virtual/real placed block must be present. */
function bonusCandidates(s:GameState,gd:GameData,placed:PlacedBlock):BonusIcon[] {
 const block=blockById(gd,placed.blockId);if(!block)return [];
 return blockVertexKeys(block,placed).filter(candidate=>!s.cybernet.bonusIcons.some(i=>i.key===candidate.key) && candidate.coords.every(coord=>{const pb=s.cybernet.at(coord);return !!pb && blockHasFragmentAtKey(gd,pb,candidate.key);})).map(candidate=>({key:candidate.key,coords:candidate.coords}));
}
/** Preview allocation and the following global award without using state or RNG. */
export function bonusPlacementError(s:GameState,gd:GameData,placed:PlacedBlock):string|undefined {
 const cy=newCybernet();cy.blocks=[...s.cybernet.blocks,placed];cy.bonusIcons=s.cybernet.bonusIcons;cy.pawns=s.cybernet.pawns;const virtual={...s,cybernet:cy},block=blockById(gd,placed.blockId);
 try {if(block){validateGlobalBonusEffect(block);validateBlockBonus(block);}const effect=block?.effects?.inCybernet,award=effect && typeof effect!=="string" && effect.kind==="gain-bonus-all-players"?s.players.length*effect.amount!:0;requireBonusReserve(s,bonusCandidates(virtual,gd,placed).length+award+(typeof effect==="object" && effect.kind==="place-block-bonus"?1:0));}catch(error){return (error as Error).message;}
}
/** Allocate every newly formed icon atomically before any placement effect. */
export function detectBonusIconsAfterPlacement(s:GameState,gd:GameData,placed:PlacedBlock):BonusIcon[] {
 const created=bonusCandidates(s,gd,placed);requireBonusReserve(s,created.length);if(s.bonusCounterSupply!==undefined)for(const icon of created)icon.counterPlaced=true;s.cybernet.bonusIcons.push(...created);return created;
}
/** Transfer existing board counters exactly once; reserve does not change. */
export function collectControlledBonusIcons(s:GameState,playerId:string):BonusIcon[] {
 const player=playerById(s,playerId);if(!player)return [];
 const collected=s.cybernet.bonusIcons.filter(icon=>!icon.collectedBy && icon.coords.every(coord=>s.cybernet.at(coord)?.ownerId===playerId));
 if(s.bonusCounterSupply!==undefined && collected.some(icon=>!icon.counterPlaced))throw new Error("a source bonus icon needs exactly one uncollected physical counter");
 for(const icon of collected){icon.collectedBy=playerId;delete icon.counterPlaced;player.bonusCounters++;}return collected;
}
