import {bonusCounterPool,grantBonusCounters} from "../../impl/ts/src/engine/bonus-pool.ts";
import {effectiveIcebreakerModifier} from "../../impl/ts/src/engine/icebreaker-modifiers.ts";
import {newRng} from "../../impl/ts/src/domain/rng.ts";
import {defenseProfile} from "../../impl/ts/src/engine/defense.ts";
import {useMarkerAllocations} from "../../impl/ts/src/engine/use-markers.ts";
import {movementChoicePreview} from "../../impl/ts/src/engine/movement-choice.ts";
import {playerView,eventsForPlayer} from "../../impl/ts/src/engine/player-view.ts";
import {deleteActivationOptions,deleteProfile} from "../../impl/ts/src/engine/delete-profile.ts";
// Local-only Speedrunners play sessions. This module owns no files: it loads
// canonical data once and keeps all commands/state in memory for the Bun host.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadDefault, loadRegression, loadMode, loadThreats } from "../../impl/ts/src/data/index.ts";
import { validSearchPlacements } from "../../impl/ts/src/engine/abilities.ts";
import { effectivePawnClasses, targetIceNullified } from "../../impl/ts/src/engine/attach.ts";
import { pawnAttachmentSlots } from "../../impl/ts/src/engine/attachment-slots.ts";
import { advancePhase, applyActionWithEvents, cloneGameState, controlMarkersFor, gainPawnControl,newGame, availableActions, movementStepModifier, type Action, type TransitionResult,eliminatePawn } from "../../impl/ts/src/engine/index.ts";
import { effectiveAbility } from "../../impl/ts/src/engine/combat.ts";
import { snapshot } from "../../impl/ts/src/engine/snapshot.ts";
import { currentPlayer, pawnById, type GameData, type GameState } from "../../impl/ts/src/domain/types.ts";
import { neighbor } from "../../impl/ts/src/domain/hex.ts";
import { canActivateMovementOption, canEndOn, effectiveMovementOptions, stepTargets, type MovementOption, type SpaceRef } from "../../impl/ts/src/engine/movement.ts";
import { coverageSurface } from "./coverage.ts";
import { sha256 } from "./model.ts";

export type PlayCommand = { kind: "phase" } | { kind: "action"; action: Action };
export interface PlaySetup { playerNames: string[]; seed: number; modeId?: string; }
export interface StandardPlayTrace { format: "zaibatsu-speedrunners-trace/v1"; setup: PlaySetup; dataChecksum: string; commands: PlayCommand[]; }
export interface FixturePlayTrace { format: "zaibatsu-speedrunners-trace/v2"; setup: PlaySetup; scenarioId: string; dataChecksum: string; commands: PlayCommand[]; }
export type PlayTrace = StandardPlayTrace | FixturePlayTrace;

export interface PlayScenario {
  id: string;
  title: string;
  description: string;
  checkpoints: string[];
}

interface PlaySession { id: string; setup: PlaySetup; scenarioId?: string; commands: PlayCommand[]; data: GameData; state: GameState; events: TransitionResult["events"]; }

const repoRoot = resolve(import.meta.dir, "../..");
const data = loadRegression("speedrunners");
const regressionChecksum = sha256([
  "blocks.json", "pawns.json", "action-cards.json", "mode.json", "modes.json",
].map((file) => readFileSync(join(repoRoot, "spec/fixtures/provisional-v1/spec/data/speedrunners", file), "utf8")).join("\n") + readFileSync(join(repoRoot, "spec/fixtures/provisional-v1/spec/data/shadowraiders/threats.json"), "utf8"));
const canonicalChecksum = sha256("source-v20/block-bonus-counters\n"+["blocks.json", "pawns.json", "action-cards.json", "control-cards.json", "mode.json", "modes.json"].map(file => readFileSync(join(repoRoot, "spec/data/speedrunners", file), "utf8")).join("\n"));
function checksumFor(setup: PlaySetup, scenarioId?: string): string {
  return ["arms-industry","drone-turret","drone-probe","engineering-mk2","black-clinic","corporate-scandal","yakuza-attack","pink-control","gynoid-theft","broadcast-reboot","copyleft-bonus","emp-sacrifice","antro-discard","sprawl-discard","internal-arrows","idoru-marker-victory","toyeku-neutral","zero-step-movement","physical-use-markers","rolled-movement","source-search","trojan-reveal","virus-control","lima-flag","printed-delete","attachment-slots","attachment-restrictions","source-foundation","phase-choices","phase-jetpack","phase-insider-trading","phase-electric-sheep","elimination-prevention"].includes(scenarioId ?? "") || (!scenarioId && setup.modeId === "speedrunners") ? canonicalChecksum : regressionChecksum;
}
const layout = JSON.parse(readFileSync(join(repoRoot, "spec/data/block-layouts.json"), "utf8")).layouts[0];
const sessions = new Map<string, PlaySession>();
let nextSessionID = 1;
// Transport identity must not be reused when the host restarts. This never seeds game RNG.
const hostIdentity = `${Date.now().toString(36)}-${process.pid}`;

function cleanNames(names: unknown): string[] {
  if (!Array.isArray(names)) throw new Error("playerNames must be an array");
  const cleaned = names.map((name) => typeof name === "string" ? name.trim() : "").filter(Boolean);
  if (cleaned.length < 2 || cleaned.length > 4) throw new Error("Speedrunners requires 2–4 named players");
  return cleaned;
}

function cleanSetup(setup: PlaySetup): PlaySetup {
  if (!Number.isSafeInteger(setup?.seed) || setup.seed < 0) throw new Error("seed must be a nonnegative whole number");
  if (setup.modeId !== undefined && !["speedrunners", "speedrunners-quick-match"].includes(setup.modeId)) throw new Error("Unknown match mode");
  return { playerNames: cleanNames(setup.playerNames), seed: setup.seed, ...(setup.modeId ? { modeId: setup.modeId } : {}) };
}

const scenarios: PlayScenario[] = [
 {id:"arms-industry",title:"Arms Industry physical counter",description:"Two synthetic controlled peers stage one bonus-icon formation. Ada holds 22 counters, leaving two for the icon and Arms Industry’s own block counter. Search and place Edge 0 rotation 0. Enter through hand with Uplink and capture using Worm. Both existing counters transfer at empty reserve. Reserve shortage remains unresolved and this focused fixture is not a complete official match.",checkpoints:["Reveal Arms Industry without allocating a counter.","Place the tile and allocate both physical board counters.","Enter the hand space and inspect its four-card limit.","Capture and collect icon then block counter at empty reserve."]},
 {id:"drone-turret",title:"Military Development and Drone Turret",description:"Search Military Development, choose Edge 0 rotation 5, enter through hand and the Turret home, then capture. Finish Ada’s turn; Bea enters the same home. Hand back to Ada using permitted abilities, pay Uplink for the Turret’s public Delete, then assign the die. The active player and phase never switch during the attack; each player recycles only their own face-up cards. This focused fixture is not a full official match.",checkpoints:["Capture Military Development and control its one Drone Turret.","Bring Bea into the Turret block during her turn.","Let Ada roll the Turret’s paid Delete during Bea’s turn.","Assign Ada’s public roll while Bea keeps the turn."]},
 {id:"drone-probe",title:"Combat Prototypes and Drone Probe",description:"Search and capture Combat Prototypes to deploy its one Drone Probe. The drone has separate free Search and five-step movement uses. Search from its central home without discarding a card, place the revealed Engineering War, then move the drone there through right, defense and the MK-2 home. Both uses stay spent until its controller's next beginning. Servocanon is optional for Module testing; it grants no paid Delete. This focused fixture is not a complete official match.",checkpoints:["Capture Combat Prototypes and control its one Drone Probe.","Use the drone's free Search to reveal Engineering War.","Place Engineering War from the drone's current block.","Spend the drone's independent native movement to enter Engineering War."]},
 {id:"engineering-mk2",title:"Engineering War and Drone MK-2",description:"Search the printed tile, rotate its left entrance toward Central Core, move through defense to the Drone MK-2 home, then capture. The one physical drone and card enter under your control. Move it to Core using its free five-step ability, then play Uplink for one-skull Delete and assign the public die to Bea's runner. Servocanon can also be tested in the Module slot; its wider multiple-free/reuse gaps remain separate. This focused sequence is not a complete official match.",checkpoints:["Place Engineering War through one of its two side entrances.","Capture the block and control its one Drone MK-2.","Spend the drone's native movement to reach Central Core.","Assign the drone's paid Delete roll to Bea's runner."]},
 {id:"black-clinic",title:"Black Clinic and the hand-size space",description:"Search, enter the large unlimited Clinic and capture the tile. Choose any Cybernet pawn: Ada carries Gunhed, its AK-12kM and Phase-Loop; Bea carries Dummy. Clear Ada's three cards to recover four invested counters, then stop on the minus-one hand space and refill to four. Paid attachments are staged by ordinary engine actions; this focused fixture does not prove an ordinary complete match. Used-card redraw remains T-RULES-021.",checkpoints:["Capture Black Clinic and choose a Cybernet pawn.","Discard Ada's three attachments and recover four invested counters.","Stop on the hand space: the current recycling limit is four.","Refill Ada's hand to four during recycling."]},
 {id:"corporate-scandal",title:"Corporate Scandal whole-hand discard",description:"Other tile ownership and Idoru are staged: Ada has five counted Cybernet markers (four on tiles and one on Idoru's card), Bea has six. Search, enter and capture Corporate Scandal. Its new sixth marker makes Ada eligible too; both whole hands discard while Worm remains played. These staged holdings test the threshold and do not prove an ordinary full match.",checkpoints:["Place Corporate Scandal without discarding either hand.","Capture it: the sixth counted marker triggers both whole hands.","Keep the paid Worm out of the discarded hands."]},
 {id:"yakuza-attack",title:"Yakuza optional adjacent attack",description:"Search, enter and capture the printed Yakuza tile. Its controller may decline or select a pawn on an adjacent block before rolling one skull. Bea has a paid Dummy attachment and may respond to a hit during Ada's turn. Tile capture and the source target/roll/prevention sequence use ordinary engine actions; this is a focused rule fixture.",checkpoints:["Capture Yakuza and open its optional target choice.","Select an adjacent pawn and resolve its one-skull attack.","Let Bea decide whether Dummy prevents elimination."]},
 {id:"pink-control",title:"Pink District and controlled Gynoid placement",description:"Search the printed Pink District tile, then enter its unlimited Gynoid space and Icebreak the block. Tile placement alone leaves the physical pawn in reserve. Capturing it puts Gynoid on her matching space under your control. Her separate beginning theft and simultaneous-order gap are tracked independently.",checkpoints:["Place Pink District without granting Gynoid.","Capture the block to place and control its one Gynoid.","Inspect the matching home and printed movement arrow."]},
 {id:"gynoid-theft",title:"Gynoid beginning-of-turn theft",description:"Gynoid's control and Pink District are staged. Begin Ada's turn, then decline or choose another pawn's controller for one random hand card. Another friendly pawn is legal under the unqualified printed text. Empty-handed targets are unavailable. Simultaneous beginning-effect ordering remains provisional T-RULES-005.",checkpoints:["Open Gynoid's optional beginning decision.","Transfer one random physical card from Bea's hand.","Keep the private decision and result through replay and undo."]},
 {id:"broadcast-reboot",title:"Clandestine Broadcast Reboot destinations",description:"The printed Broadcast tile is controlled by Ada and her starter is retained after elimination. Reboot onto its large special space or the original Core using a matching card or four-card payment. Tile control and elimination are staged fixture setup, not an ordinary complete match.",checkpoints:["Choose the controlled Broadcast as a Reboot destination.","Return the retained starter to its large special space.","Retain the destination through replay and undo."]},
 {id:"copyleft-bonus",title:"Copyleft and physical bonus counters",description:"Printed Copyleft on a clearly synthetic two-peer bonus setup. Only three of the 24 counters remain in reserve. Placement puts one on the completed icon before awarding one to each player. Attach Phase-Loop, then move onto Copyleft and Icebreak it to transfer the existing icon counter at empty reserve. EKO is artwork, not a pawn. Reserve shortfalls remain provisional T-RULES-030/031.",checkpoints:["Place Copyleft: allocate the icon counter before both reserve awards.","Invest one existing counter in Phase-Loop.","Collect the existing board counter without creating another."]},
 {id:"emp-sacrifice",title:"Electromagnetic Pulse pawn sacrifices",description:"Search the printed Electromagnetic Pulse tile. Each player controls two pawns and must select one to sacrifice. A synthetic non-Reboot worker lets the fixture compare reserve/common release with retained starter Reboot. Selections are public; cleanup waits for both. Global timing and retained/Dummy eligibility remain provisional T-RULES-029.",checkpoints:["Place Electromagnetic Pulse and open the controller choices.","Commit one public pawn selection without early elimination.","Finish both selections and inspect physical cleanup and refunds."]},
 {id:"antro-discard",title:"Antro optional attachment discard",description:"Printed Antro with Gunhed, AK-12kM, Phase-Loop and Dummy. Move onto either side effect space, then decline or select a matching physical attachment. Gunhed removal also removes AK-12kM and refunds three counters. Cybernet-wide targeting and stop timing remain provisional under T-RULES-027.",checkpoints:["Stop on an optional discard space.","Select a physical attachment or decline.","Inspect refunds and remaining attachment benefits."]},
  {id:"sprawl-discard",title:"Sprawl all-player discards",description:"Search reveals Sprawl. Ada controls two pawns; Bea retains her eliminated Speedrunner. Each selects their own required physical cards. Commitments stay private until both submit, then all discards become public. This tests the provisional normal-hand interpretation; shortfalls and global timing still need acceptance.",checkpoints:["Place Sprawl and open the per-player discard decisions.","Commit one selection without publishing its cards.","Complete both selections and publish exactly three physical discards."]},
  {id:"internal-arrows",title:"Sprawl one-way space links",description:"Ada starts on Sprawl shield. The printed rabbit-to-shield arrow bars the reverse link while allowing the other exit. Inspect the movement preview, attach Octagon Dex, then move to rabbit using its arrow exception. The rotated placement is staged for focused movement testing.",checkpoints:["Attach Octagon Dex to ignore the printed internal arrow.","Move from shield back to rabbit using the exception."]},
  {id:"idoru-marker-victory",title:"Idoru control-card marker",description:"A focused source fixture starts with neutral Idoru on Toyeku. Use a matching Icebreaker card to acquire her and place your last marker on the control card. One-marker victory and staged pawn positions are fixture setup. Repeat placement after marker removal remains provisional.",checkpoints:["Acquire Idoru from the common area.","Place the last marker on her control card and win immediately.","Inspect the public allocation and replay the result."]},
  {id:"toyeku-neutral",title:"Toyeku and neutral Idoru",description:"Search reveals the verified first printed Speedrunners block. Place it to put Idoru on its matching pawn space without control, then move Ada's runner onto the white flat die1 space. The die changes defense shielding; block ICE stays 3,4,6. Idoru's marker lifecycle remains provisional, so this is a focused rule fixture.",checkpoints:["Place Toyeku with Idoru free of player control.","Move the controlled runner onto the white die1 space.","Inspect vulnerable defense1 while block ICE stays 3,4,6."]},
  {id:"zero-step-movement",title:"Spend movement without taking a step",description:"Ada has a synthetic fixed two-step free movement on the isolated Central Core. Choose the free activation or a movement card and finish at the current space; its use or physical card is still spent. No printed pawn is promoted.",checkpoints:["Spend the free movement without leaving Central Core.","Spend a movement card without leaving Central Core.","Keep both costs through replay and undo."]},
  {id:"physical-use-markers",title:"Ability markers follow control",description:"Bea's synthetic Cleaner has already used its free movement. Capture it with Virus and inspect its spent marker. It becomes available at Ada's next beginning, when she controls the card. The synthetic class and movement do not promote a printed pawn.",checkpoints:["Capture the pawn without refreshing its used movement.","Keep the used marker through the change of control.","Reach Ada's next beginning to clear the controlled marker."]},
  {id:"rolled-movement",title:"Roll before movement",description:"Ada has a synthetic two-die native movement ability on a synthetic board. Roll first, then select a path through occupied space b to open space c, or stop without moving. The printed starter is not promoted as a dice mover. The accepted roll/use marker survives rejected paths and replay.",checkpoints:["Roll movement before selecting a path.","Pass occupied space b and finish on space c.","Complete movement with its free use still spent."]},
  {id:"source-search",title:"Search draw and placement",description:"Source Search discards one physical card and reveals the top tile before choosing its location and orientation. The tile geometry is an explicitly synthetic fixture; it does not promote an unfinished block. Other actions wait for the placement decision.",checkpoints:["Declare Search and reveal the top block.","Choose a legal location and orientation for the revealed block.","Complete placement without paying twice."]},
  {id:"trojan-reveal",title:"Trojan face-up hand",description:"Attach printed Trojan to Bea’s starter to expose her current hand. Other hands and draw-pile order stay private in engine player views. This Test Lab retains trusted operator replay/debug access.",checkpoints:["Attach Trojan to Bea’s pawn.","Read Bea’s face-up hand from Ada’s player view."]},
  {id:"virus-control",title:"Virus attachment takeover",description:"Printed Virus captures Bea's pawn after being attached to its extra Add-on slot. Its Cleaner class is synthetic; this does not promote an unfinished Cleaner pawn record. Existing Gunhed, AK-12kM and Biochip attachments, plus Virus itself, are discarded and Bea recovers four paid counters.",checkpoints:["Attach Virus and take control of the eligible pawn.","Discard its previous attachments and Virus itself.","Return four paid counters to Bea."]},
  {id:"lima-flag",title:"Lima Flag movement restriction",description:"Printed Lima Flag is already attached to Ada's starter on a synthetic movement board. The engine excludes entering Central Core from movement options, while movement within the current block and toward the other board tile remains available.",checkpoints:["Inspect the movement choices without Central Core entry.","Move to the other board tile.","Keep Lima Flag attached after the legal move."]},
  {id:"printed-delete",title:"Gunhed, weapons and Delete activations",description:"Printed Gunhed, AK-12kM and Servocanon with a synthetic Gadget-to-Module adapter. The defender has synthetic fully shielded faces so attacks can be repeated. Install all four cards to obtain three skulls, a matching-card activation and one free activation. Multiple free activators remain provisional under the EN/ES conflict.",checkpoints:["Attach Gunhed and gain its Weapon slot.","Attach AK-12kM, the adapter and Servocanon.","Roll three dice using the free activation.","Roll again using a matching card after the free activation."]},
  {id:"attachment-slots",title:"Granted slots and cleanup",description:"Synthetic cards test the printed slot rules: choose a native or granted Gadget slot, then build a Weapon/Module chain. The provider discards itself at Ada's next turn beginning, removing all cards in its granted slots and refunding their counters. These are mechanic fixtures, not completed Gunhed or weapon records.",checkpoints:["Choose a Gadget slot and attach the synthetic gadget.","Attach the Weapon and Module chain.","Reach Ada's next beginning and inspect dependent-card cleanup."]},
  {id:"attachment-restrictions",title:"Malware target restrictions",description:"Printed Worm, Under Clocker and Hijacker. The two starting Speedrunners are Operatives and cannot receive these cards. A synthetic non-Operative target is provided for legal attachment testing; reset to try another card.",checkpoints:["Confirm only the synthetic target is offered for malware.","Attach one printed malware card.","Inspect the gained Malware class."]},
  {id:"elimination-prevention",title:"Dummy elimination prevention",description:"Canonical Dummy on Bea's starter. Ada has a synthetic Delete grant and Bea has a synthetic unshielded defense profile so the fixture reliably opens the prevention decision. Bea may respond during Ada's turn.",checkpoints:["Roll Delete and assign the public die to the defender.","Resolve the defender's prevention decision.","Discard Dummy and keep the pawn in the Cybernet."]},
  {id:"phase-jetpack",title:"Jetpack relocation",description:"Printed Jetpack on a starter. Choose an available space after discarding the attachment. Threat destinations and simultaneous beginning effects remain provisional.",checkpoints:["Open the Jetpack destination decision.","Relocate and refund the paid counter.","Confirm the action phase resumes."]},
  {id:"phase-insider-trading",title:"Insider Trading hand choice",description:"Printed Insider Trading on a starter with two DJ copies in a synthetic hand. Select exactly two physical cards; underfilled hands and simultaneous effects remain provisional.",checkpoints:["Open the two-card discard decision.","Discard two physical hand cards.","Confirm the attachment remains in play."]},
  {id:"phase-electric-sheep",title:"Electric Sheep sacrifice and draw",description:"Printed Electric Sheep on a starter with a synthetic hand and deck. The beginning effect sacrifices the pawn, refunds paid counters, then draws three cards.",checkpoints:["Sacrifice the attached pawn at turn beginning.","Draw three cards after sacrifice.","Confirm the action phase resumes."]},
  {id:"phase-choices",title:"Beginning-turn choices",description:"Canonical Toxin on a starter: discard one physical card or sacrifice the pawn before entering the action phase. Multiple simultaneous phase effects remain provisional.",checkpoints:["Open the beginning-of-turn Toxin decision.","Discard one card or sacrifice the pawn.","Confirm action phase resumes after marker reset."]},
  { id: "source-foundation", title: "Verified starter and card rules", description: "Canonical starters and page-one cards on a synthetic arrow board. Check Octagon, paid accelerators, and E-Synapse movement; Simstim bonus remains provisional.", checkpoints: ["Attach Octagon Dex to the Blue Speedrunner.", "Move against the synthetic arrow into Central Core.", "Reset to test other attachments."] },
  { id: "threat-combat", title: "Shadowraiders threat combat", description: "A Test Lab board with the printed Guard drone: move to awaken it, roll Delete, assign your dice, then resolve surviving fixed attacks.", checkpoints: ["Awaken the Guard through normal movement.", "Roll Delete and assign the public dice.", "Defeat the Guard or resolve its fixed attack."] },
  { id: "game-basics", title: "Game basics", description: "A short basics fixture for control-marker placement, victory, and reset.", checkpoints: ["Place your last control marker.", "Confirm the winner event, then reset the fixture."] },
  { id: "search-and-move", title: "Search and movement", description: "Place the next block, then test fixed/card movement across the Central Core boundary.", checkpoints: ["Play Search and place the top block.", "Move the Red Speedrunner into that block.", "Use Undo to confirm deterministic replay."] },
  { id: "combat-and-control", title: "Combat and control", description: "A co-located combat fixture with a controllable ICE block and an ICE-bearing pawn.", checkpoints: ["Use a card to Delete a target.", "Use the Cyberninja for a Test Lab Split Delete.", "Icebreak the Cyberninja or the Hacktivism block.", "Inspect rolls, eliminations, and control events."] },
  { id: "attachments", title: "Attachments", description: "Exercise granted movement, armor defense, and ICE nullification without touching canonical spec data.", checkpoints: ["Attach the Stealth Harness to your Red Speedrunner.", "Use the granted stealth move.", "Attach the Block ICE Jammer and confirm block control is no longer offered."] },
  { id: "bonus-economy", title: "Bonus economy", description: "Create a bonus icon, collect its counter by taking the third block, then spend that counter on an attachment.", checkpoints: ["Play Search to create the bonus icon.", "Move onto the new block and collect the bonus counter with Icebreaker.", "Spend the earned counter on Bonus Rig."] },
  { id: "effect-execution", title: "Typed effects", description: "Historical regression fixture: its old Cracker/Idoru triggers are not the printed Gentleman Loser/Toyeku rules. Exercises typed place-pawn handlers against frozen data.", checkpoints: ["Play Cracker to Icebreak the Idoru block.", "Confirm both Cracker and Idoru were placed under your control.", "Inspect the pawn-placement events from that action."] },
  { id: "reboot-and-turn", title: "Reboot and turn flow", description: "Reboot an eliminated pawn with four cards, then exercise pass, recycle, end, and reset.", checkpoints: ["Play four cards to Reboot the eliminated Red Speedrunner.", "Pass and end the turn.", "Reset the fixture and compare its trace."] },
];

export function listPlayScenarios(): PlayScenario[] { return scenarios.map((scenario) => ({ ...scenario, checkpoints: [...scenario.checkpoints] })); }

function scenarioById(id: string): PlayScenario {
  const scenario = scenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown Test Lab scenario "${id}"`);
  return scenario;
}

function playDataForScenario(id?: string, modeId?: string): GameData {
  if(id==="arms-industry"){const gd=loadDefault("speedrunners");for(const id of ["fixture-arms-peer-a","fixture-arms-peer-b"])gd.blocks.push({...structuredClone(gd.blocks.find(b=>b.isCentralCore)!),id,name:"Synthetic Arms bonus peer",isCentralCore:false,bonusCorners:Array(6).fill(true),provisional:true});return gd;}

  if(id==="drone-turret" || id==="drone-probe" || id==="engineering-mk2" || id==="black-clinic" || id==="corporate-scandal" || id==="yakuza-attack" || id==="pink-control" || id==="gynoid-theft")return loadDefault("speedrunners");
  if(id==="broadcast-reboot")return loadDefault("speedrunners");
  if(id==="copyleft-bonus") {const gd=loadDefault("speedrunners");for(const id of ["fixture-peer-a","fixture-peer-b"])gd.blocks.push({...structuredClone(gd.blocks.find(b=>b.isCentralCore)!),id,name:"Synthetic bonus peer",isCentralCore:false,bonusCorners:Array(6).fill(true),provisional:true});return gd;}
  if(id==="emp-sacrifice") {const gd=loadDefault("speedrunners"),worker={...structuredClone(gd.pawns.find(p=>p.isStarter)!),id:"fixture-worker",name:"Synthetic non-Reboot worker",isStarter:false,abilities:[],provisional:true};gd.pawns.push(worker);gd.controlCards!.push({id:"fixture-worker-control",name:worker.name,expansion:"speedrunners",subject:{kind:"pawn",id:worker.id},provisional:true});return gd;}
  if(id==="antro-discard" || id==="sprawl-discard" || id==="internal-arrows") return loadDefault("speedrunners");
  if(id==="idoru-marker-victory") return loadDefault("speedrunners");
  if(id==="toyeku-neutral") return loadDefault("speedrunners");
  if(id==="zero-step-movement") return loadDefault("speedrunners");
  if(id==="physical-use-markers") {const gd=loadDefault("speedrunners");gd.blocks.push({id:"fixture-marker-board",name:"Synthetic marker board",expansion:"speedrunners",edges:[true,true,true,true,true,true],boundarySpaces:Array.from({length:6},()=>["a"]),spaces:[{id:"a",type:"special",capacity:"unlimited",neighbors:["b"],zoneIds:["h6"]},{id:"b",type:"special",capacity:"unlimited",neighbors:["a"],zoneIds:["h4"]}],provisional:true});return gd;}
  if(id==="rolled-movement") {const gd=loadDefault("speedrunners");for(const id of ["fixture-movement-board","fixture-movement-next"]) gd.blocks.push({id,name:"Synthetic movement board",expansion:"speedrunners",iceValue:"high",iceFaces:[1],edges:[true,true,true,true,true,true],boundarySpaces:[["a"],["a"],["a"],["a"],["a"],["a"]],spaces:[{id:"a",type:"special",capacity:"unlimited",neighbors:["b"],zoneIds:["h6"]},{id:"b",type:"normal",neighbors:["a","c"],zoneIds:["h5"]},{id:"c",type:"special",capacity:"unlimited",neighbors:["b"],zoneIds:["h4"]}],provisional:true});return gd;}
  if(id==="source-search") {const gd=loadDefault("speedrunners");gd.blocks.push({id:"fixture-search-tile",name:"Synthetic Search tile",expansion:"speedrunners",iceValue:"high",iceFaces:[1],edges:[true,false,false,false,false,false],boundarySpaces:[["a"],[],[],[],[],[]],spaces:[{id:"a",type:"special",capacity:"unlimited"}],provisional:true});return gd;}
  if(id==="trojan-reveal") return loadDefault("speedrunners");
  if(id==="virus-control") return loadDefault("speedrunners");
  if(id==="lima-flag") {
    const gd=loadDefault("speedrunners");
    gd.blocks.push({id:"fixture-lima-board",name:"Synthetic movement board",expansion:"speedrunners",iceValue:"none",edges:[true,true,true,true,true,true],boundarySpaces:Array.from({length:6},()=>["a"]),spaces:[{id:"a",type:"special",capacity:"unlimited",neighbors:["b"]},{id:"b",type:"special",capacity:"unlimited",neighbors:["a"]}],provisional:true});return gd;
  }
  if(id==="printed-delete") {
    const gd=loadDefault("speedrunners");gd.cards.push({id:"fixture-module-adapter",name:"Synthetic module adapter",copies:1,attach:{as:"pawn",slot:"gadget",grantsSlot:["module"]}});return gd;
  }
  if(id==="attachment-slots") {
    const gd=loadDefault("speedrunners");
    gd.cards.push(
      {id:"fixture-expiring-provider",name:"Synthetic expiring provider",attach:{as:"pawn",slot:"add-on",cost:2,grantsSlot:["gadget","weapon"],phaseEffects:[{trigger:"begin-turn",kind:"discard-self"}]}},
      {id:"fixture-slot-gadget",name:"Synthetic gadget",attach:{as:"pawn",slot:"gadget",cost:1,handModifier:1}},
      {id:"fixture-slot-weapon",name:"Synthetic weapon carrier",attach:{as:"pawn",slot:"weapon",cost:1,grantsSlot:["module"]}},
      {id:"fixture-slot-module",name:"Synthetic module",attach:{as:"pawn",slot:"module",cost:2,movementModifier:1}},
    );return gd;
  }
  if (id === "attachment-restrictions") {
    const gd=loadDefault("speedrunners"),basis=structuredClone(gd.pawns.find(pawn=>pawn.isStarter)!);
    gd.pawns.push({...basis,id:"fixture-malware-target",name:"Synthetic non-Operative target",isStarter:false,class:["fixture-subject"],provisional:true});
    return gd;
  }
  if(id === "elimination-prevention") {
    const gd=loadDefault("speedrunners");
    gd.cards.push({id:"fixture-delete-grant",name:"Synthetic Delete grant",attach:{as:"pawn",slot:"gadget",grants:["delete"]},provisional:true});
    return gd;
  }
  if (["phase-choices","phase-jetpack","phase-insider-trading","phase-electric-sheep"].includes(id??"")) return loadDefault("speedrunners");
  if (id === "source-foundation") {
    const gd = loadDefault("speedrunners");
    gd.blocks.push({id:"fixture-source-arrows",name:"Synthetic arrow board",expansion:"speedrunners",iceValue:"none",edges:[true,true,true,true,true,true],boundarySpaces:Array.from({length:6},()=>["a"]),spaces:[{id:"a",type:"special",capacity:"unlimited",direction:0,neighbors:["b"]},{id:"b",type:"special",capacity:"unlimited",neighbors:["a","c"]},{id:"c",type:"special",capacity:"unlimited",neighbors:["b"]}],provisional:true});
    return gd;
  }
  if (!id && modeId) return modeId === "speedrunners-quick-match" ? loadRegression("speedrunners", modeId) : loadMode("speedrunners", modeId);
  if (id === "threat-combat") {
    const cloned = structuredClone(data);
    cloned.threats = loadThreats("shadowraiders", true);
    return cloned;
  }
  if (id !== "attachments" && id !== "bonus-economy" && id !== "effect-execution" && id !== "game-basics") return data;
  const cloned = structuredClone(data);
  if (id === "game-basics") {
    cloned.blocks.find((block) => block.id === "data-haven")!.iceFaces = [1, 2, 3, 4, 5, 6];
    return cloned;
  }
  if (id === "attachments") {
    cloned.cards.push(
      {
        id: "fixture-grant-stealth-steps",
        name: "Stealth Harness",
        attach: {
          as: "pawn",
          slot: "gadget",
          grantsMovement: [{ type: "fixed", amount: 1, stealth: true }],
          abilityUses: [{ ability: "move", activation: "card" }],
        },
      },
      {
        id: "fixture-armor-override",
        name: "Shield Mesh",
        attach: {
          as: "pawn",
          slot: "armor",
          defenseOverride: [1, 2, 3, 4, 5, 6].map((value) => ({ value, shielded: true })),
        },
      },
      {
        id: "fixture-block-nullify-ice",
        name: "Block ICE Jammer",
        attach: { as: "block", nullifiesIce: true },
      },
    );
    return cloned;
  }
  if (id === "effect-execution") {
    cloned.blocks = cloned.blocks.map((block) =>
      block.id === "idoru" ? { ...block, iceFaces: [1, 2, 3, 4, 5, 6] } : block
    );
    return cloned;
  }
  const core = cloned.blocks.find((block) => block.isCentralCore);
  if (!core) return cloned;
  const basis = structuredClone(core);
  const bonusBlock = (blockId: string, bonusCorners: boolean[], iceValue: "none" | "high" = "none") => ({
    ...structuredClone(basis),
    id: blockId,
    name: blockId,
    isCentralCore: false,
    iceValue,
    iceFaces: iceValue === "high" ? [1, 2, 3, 4, 5, 6] : [],
    edges: [true, true, true, true, true, true],
    boundarySpaces: [["a"], ["a"], ["a"], ["a"], ["a"], ["a"]],
    bonusCorners,
    bonusFragments: bonusCorners.filter(Boolean).length,
    spaces: [{ id: "a", type: "special", zoneIds: ["h1"], capacity: "unlimited", neighbors: [] }],
  });
  cloned.blocks.push(
    bonusBlock("fixture-bonus-a", [false, true, false, false, false, false]),
    bonusBlock("fixture-bonus-b", [false, false, false, true, false, false]),
    bonusBlock("fixture-bonus-c", [false, false, false, false, false, true], "high"),
  );
  cloned.cards.push(
    { id: "fixture-search", name: "Search Spike", activates: ["search"] },
    { id: "fixture-icebreak", name: "ICE Key", activates: ["icebreaker"] },
    { id: "fixture-bonus-gadget", name: "Bonus Rig", attach: { as: "pawn", slot: "gadget", cost: 1 } },
  );
  return cloned;
}

function fixtureState(id: string, setup: PlaySetup, gd: GameData): GameState {
  scenarioById(id);
  const state = newGame({ data: gd, ...setup, allowProvisional: true });

  if(id==="arms-industry") {
   state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};for(const id of ["dj","move-1","move-1","move-2","worm","dummy"])take(0,id);for(const id of ["move-2","move-1"])take(1,id);grantBonusCounters(state,"p1",22);for(const [id,coord] of [["fixture-arms-peer-a",{q:2,r:0}],["fixture-arms-peer-b",{q:2,r:-1}]] as const)state.cybernet.blocks.push({blockId:id,coord:{...coord},rotation:0,ownerId:"p1"});state.players[0]!.controlMarkersPlaced=2;state.blockPile=state.blockPile.filter(id=>id!=="arms-industry");state.blockPile.push("arms-industry");state.rng=newRng(5);return state;
  }
  if(id==="drone-turret") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};for(const c of ["dj","move-2","worm","move-1","move-1","servocanon"])take(0,c);for(const c of ["move-2","move-1","dummy"])take(1,c);grantBonusCounters(state,"p1",1);state.blockPile=state.blockPile.filter(id=>id!=="military-development");state.blockPile.push("military-development");state.rng=newRng(5);return state;
  }
  if(id==="drone-probe") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};for(const c of ["dj","move-2","worm","move-1","move-2","servocanon"])take(0,c);for(const c of ["move-2","move-1","move-1"])take(1,c);grantBonusCounters(state,"p1",1);state.blockPile=state.blockPile.filter(id=>!["engineering-war","combat-prototypes"].includes(id));state.blockPile.push("engineering-war","combat-prototypes");state.rng=newRng(5);return state;
  }
  if(id==="engineering-mk2") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};for(const c of ["dj","move-2","worm","move-1","move-1","move-3","servocanon"])take(0,c);for(const c of ["move-2","move-1","move-1","move-1","move-3"])take(1,c);grantBonusCounters(state,"p1",1);state.blockPile=state.blockPile.filter(id=>id!=="engineering-war");state.blockPile.push("engineering-war");state.rng=newRng(5);return state;
  }
  if(id==="black-clinic") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};for(const c of ["dj","move-2","worm","move-1","move-2","weapon-gunhed","ak-12km","phase-loop"])take(0,c);take(1,"dummy");grantBonusCounters(state,"p1",6);grantBonusCounters(state,"p2",1);
    for(const [i,cards] of [[0,["weapon-gunhed","ak-12km","phase-loop"]],[1,["dummy"]]] as const) {state.currentPlayer=i;for(const cardId of cards){const r=applyActionWithEvents(state,gd,{type:"attach-pawn",cardId,targetId:state.players[i]!.pawnId});if(!r.accepted)throw new Error(r.error);}}
    state.currentPlayer=0;state.blockPile=state.blockPile.filter(id=>id!=="black-clinic");state.blockPile.push("black-clinic");state.rng=newRng(5);return state;
  }
  if(id==="corporate-scandal") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};
    for(const c of ["dj","move-2","worm","move-1","move-1"])take(0,c);for(const c of ["move-1","move-1","move-2"])take(1,c);
    state.reserve=state.reserve!.filter(id=>id!=="idoru");state.cybernet.placePawn({pawnId:"idoru",ownerId:"",coord:{q:0,r:0},spaceId:"core"});gainPawnControl(state,gd,"idoru","p1");
    const peers=gd.blocks.filter(b=>!b.isCentralCore && b.id!=="corporate-scandal");let cursor=0;
    for(const [i,blockCount] of [4,6].entries()) {const p=state.players[i]!;for(let n=0;n<blockCount;n++){const b=peers[cursor++]!;state.cybernet.blocks.push({blockId:b.id,coord:{q:-cursor,r:0},rotation:0,ownerId:p.id});state.blockPile=state.blockPile.filter(id=>id!==b.id);}p.controlMarkersPlaced=blockCount+(i===0?1:0);}
    state.blockPile=state.blockPile.filter(id=>id!=="corporate-scandal");state.blockPile.push("corporate-scandal");state.rng=newRng(5);return state;
  }
  if(id==="yakuza-attack") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};
    for(const c of ["dj","move-2","worm"])take(0,c);take(1,"dummy");grantBonusCounters(state,"p2",1);state.currentPlayer=1;
    const attached=applyActionWithEvents(state,gd,{type:"attach-pawn",cardId:"dummy",targetId:state.players[1]!.pawnId,slotRef:"pawn:add-on"});if(!attached.accepted)throw new Error(attached.error);
    state.currentPlayer=0;state.blockPile=state.blockPile.filter(b=>b!=="yakuza");state.blockPile.push("yakuza");state.rng=newRng(5);return state;
  }
  if(id==="pink-control" || id==="gynoid-theft") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};
    for(const c of id==="pink-control"?["dj","move-2","worm"]:["move-2"])take(0,c);for(const c of ["move-1","move-1","move-2"])take(1,c);
    state.blockPile=state.blockPile.filter(b=>b!=="pink-district");
    if(id==="pink-control"){state.blockPile.push("pink-district");state.rng=newRng(1);}
    else {state.cybernet.blocks.push({blockId:"pink-district",coord:{q:1,r:0},rotation:0,ownerId:"p1"});state.players[0]!.controlMarkersPlaced=1;state.reserve=state.reserve!.filter(p=>p!=="gynoid");state.cybernet.placePawn({pawnId:"gynoid",ownerId:"",coord:{q:1,r:0},spaceId:"gynoid"});gainPawnControl(state,gd,"gynoid","p1");state.phase="beginning";state.rng=newRng(11);}
    return state;
  }
  if(id==="broadcast-reboot") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    for(const id of ["move-1","move-2","move-2","dj"]){const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[0]!.hand.push(id);}
    state.blockPile=state.blockPile.filter(id=>id!=="clandestine-broadcast");state.cybernet.blocks.push({blockId:"clandestine-broadcast",coord:{q:1,r:0},rotation:0,ownerId:"p1"});state.players[0]!.controlMarkersPlaced=1;eliminatePawn(state,state.players[0]!.pawnId,gd);return state;
  }
  if(id==="copyleft-bonus") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];for(const id of ["dj","move-2","worm","phase-loop"]){const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[0]!.hand.push(id);}
    for(const [id,coord] of [["fixture-peer-a",{q:2,r:-1}],["fixture-peer-b",{q:1,r:-1}]] as const)state.cybernet.blocks.push({blockId:id,coord:{...coord},rotation:0,ownerId:"p1"});state.players[0]!.controlMarkersPlaced=2;grantBonusCounters(state,"p1",21);state.blockPile=state.blockPile.filter(id=>!["fixture-peer-a","fixture-peer-b","copyleft"].includes(id));state.blockPile.push("copyleft");state.rng=newRng(1);return state;
  }
  if(id==="emp-sacrifice") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];const take=(i:number,id:string)=>{const at=state.deck.indexOf(id);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(id);};
    for(const id of ["dj","weapon-gunhed","ak-12km","phase-loop"])take(0,id);take(1,"jetpack");state.players[0]!.bonusCounters=6;state.players[1]!.bonusCounters=2;
    for(const [pawnId,ownerId] of [["idoru","p1"],["fixture-worker","p2"]]){state.reserve=state.reserve!.filter(id=>id!==pawnId);state.cybernet.placePawn({pawnId:pawnId!,ownerId:"",coord:{q:0,r:0},spaceId:"core"});gainPawnControl(state,gd,pawnId!,ownerId!);}
    for(const cardId of ["weapon-gunhed","ak-12km","phase-loop"]){const r=applyActionWithEvents(state,gd,{type:"attach-pawn",cardId,targetId:state.players[0]!.pawnId});if(!r.accepted)throw new Error(r.error);}state.currentPlayer=1;const r=applyActionWithEvents(state,gd,{type:"attach-pawn",cardId:"jetpack",targetId:"fixture-worker"});if(!r.accepted)throw new Error(r.error);state.currentPlayer=0;state.blockPile=state.blockPile.filter(id=>id!=="electromagnetic-pulse");state.blockPile.push("electromagnetic-pulse");return state;
  }
  if(id==="antro-discard") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    const take=(i:number,cardId:string)=>{const at=state.deck.indexOf(cardId);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(cardId);};
    for(const c of ["weapon-gunhed","ak-12km","phase-loop","move-1","move-2"])take(0,c);take(1,"dummy");state.players[0]!.bonusCounters=6;state.players[1]!.bonusCounters=2;
    for(const c of ["weapon-gunhed","ak-12km","phase-loop"]) {const result=applyActionWithEvents(state,gd,{type:"attach-pawn",cardId:c,targetId:state.players[0]!.pawnId});if(!result.accepted)throw new Error(result.error);}
    state.currentPlayer=1;const result=applyActionWithEvents(state,gd,{type:"attach-pawn",cardId:"dummy",targetId:state.players[1]!.pawnId});if(!result.accepted)throw new Error(result.error);state.currentPlayer=0;
    state.blockPile=state.blockPile.filter(b=>b!=="antro");state.cybernet.blocks.push({blockId:"antro",coord:{q:1,r:0},rotation:0});const actor=state.cybernet.pawnById(state.players[0]!.pawnId)!;actor.coord={q:1,r:0};actor.spaceId="dance";return state;
  }
  if(id==="sprawl-discard" || id==="internal-arrows") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players)p.hand=[];
    const take=(i:number,cardId:string)=>{const at=state.deck.indexOf(cardId);if(at<0)throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[i]!.hand.push(cardId);};
    if(id==="internal-arrows") {take(0,"move-1");take(0,"octagon-dex");state.blockPile=state.blockPile.filter(b=>b!=="chiba-city");state.cybernet.blocks.push({blockId:"chiba-city",coord:{q:1,r:0},rotation:3});const actor=state.cybernet.pawnById(state.players[0]!.pawnId)!;actor.coord={q:1,r:0};actor.spaceId="shield";return state;}
    for(const c of ["dj","move-1","move-1","octagon-dex"])take(0,c);for(const c of ["dummy","worm"])take(1,c);
    state.blockPile=state.blockPile.filter(b=>b!=="idoru" && b!=="chiba-city");state.blockPile.push("chiba-city");state.cybernet.blocks.push({blockId:"idoru",coord:{q:0,r:1},rotation:0});state.reserve=state.reserve!.filter(p=>p!=="idoru");state.cybernet.placePawn({pawnId:"idoru",ownerId:"",coord:{q:0,r:1},spaceId:"idoru"});gainPawnControl(state,gd,"idoru","p1");const retained=state.players[1]!.pawnId;state.cybernet.removePawn(retained);state.eliminated.push(retained);return state;
  }
  if(id==="idoru-marker-victory") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players) p.hand=[];const at=state.deck.indexOf("worm");state.deck.splice(at,1);state.players[0]!.hand=["worm"];state.players[0]!.controlMarkersTotal=1;
    state.blockPile=state.blockPile.filter(id=>id!=="idoru");state.cybernet.blocks.push({blockId:"idoru",coord:{q:1,r:0},rotation:0});state.reserve=state.reserve!.filter(id=>id!=="idoru");state.cybernet.placePawn({pawnId:"idoru",ownerId:"",coord:{q:1,r:0},spaceId:"idoru"});const actor=state.cybernet.pawnById(state.players[0]!.pawnId)!;actor.coord={q:1,r:0};actor.spaceId="idoru";state.rng=newRng(79);return state;
  }
  if(id==="toyeku-neutral") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players) p.hand=[];
    for(const id of ["dj","dummy"]) {const at=state.deck.indexOf(id);if(at<0) throw new Error("Missing fixture card");state.deck.splice(at,1);state.players[0]!.hand.push(id);}
    state.blockPile=state.blockPile.filter(id=>id!=="idoru");state.blockPile.push("idoru");return state;
  }
  if(id==="zero-step-movement") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players) p.hand=[];
    for(const id of ["move-1","move-1"]) {const at=state.deck.indexOf(id);if(at<0) throw new Error("Missing fixture movement card");state.deck.splice(at,1);state.players[0]!.hand.push(id);}
    const definition=gd.pawns.find(p=>p.id===state.players[0]!.pawnId)!;definition.movement={type:"steps",steps:2,activation:"once-per-turn"};definition.provisional=true;return state;
  }
  if(id==="physical-use-markers") {
    state.phase="action";state.deck.push(...state.players.flatMap(p=>p.hand));for(const p of state.players) p.hand=[];
    const at=state.deck.indexOf("virus");if(at<0) throw new Error("Missing fixture Virus");state.deck.splice(at,1);state.players[0]!.hand=["virus"];
    const target=state.players[1]!.pawnId,definition=gd.pawns.find(p=>p.id===target)!;definition.class=["cleaner"];definition.movement={type:"steps",steps:2,activation:"once-per-turn"};definition.provisional=true;
    for(const pawn of state.cybernet.pawns) {pawn.coord={q:1,r:0};pawn.spaceId=pawn.pawnId===target?"b":"a";}
    state.cybernet.blocks.push({blockId:"fixture-marker-board",coord:{q:1,r:0},rotation:0});state.blockPile=state.blockPile.filter(id=>id!=="fixture-marker-board");state.nativeUseMarkers=[{pawnId:target,ability:"move",uses:1}];return state;
  }
  if(id==="rolled-movement") {
    state.phase="action";state.deck.push(...state.players.flatMap(player=>player.hand));for(const player of state.players) player.hand=[];
    for(const cardId of ["dj","dummy"]) {const at=state.deck.indexOf(cardId);if(at<0) throw new Error(`Missing fixture card ${cardId}`);state.deck.splice(at,1);state.players[0]!.hand.push(cardId);}
    const definition=gd.pawns.find(p=>p.id===state.players[0]!.pawnId)!;definition.movement={type:"2d6",activation:"once-per-turn"};definition.provisional=true;
    for(const [index,pawn] of state.cybernet.pawns.entries()) {pawn.coord={q:1,r:0};pawn.spaceId=index===0?"a":"b";}
    state.cybernet.blocks.push({blockId:"fixture-movement-board",coord:{q:1,r:0},rotation:0},{blockId:"fixture-movement-next",coord:{q:2,r:0},rotation:0});state.blockPile=state.blockPile.filter(id=>!["fixture-movement-board","fixture-movement-next"].includes(id));return state;
  }
  if(id==="source-search") {
    state.phase="action";state.deck.push(...state.players.flatMap(player=>player.hand));for(const player of state.players) player.hand=[];
    for(const cardId of ["dj","dummy"]) {const at=state.deck.indexOf(cardId);if(at<0) throw new Error(`Missing fixture card ${cardId}`);state.deck.splice(at,1);state.players[0]!.hand.push(cardId);}
    state.blockPile=state.blockPile.filter(id=>id!=="fixture-search-tile");state.blockPile.push("fixture-search-tile");return state;
  }
  if(id==="trojan-reveal") {
    state.phase="action";state.deck.push(...state.players.flatMap(player=>player.hand));for(const player of state.players) player.hand=[];
    for(const [index,cardIds] of [[0,["trojan"]],[1,["dummy","dj"]]] as const) for(const cardId of cardIds) {const at=state.deck.indexOf(cardId);if(at<0) throw new Error(`Missing fixture card ${cardId}`);state.deck.splice(at,1);state.players[index]!.hand.push(cardId);}
    return state;
  }
  if(id==="virus-control" || id==="lima-flag") {
    state.phase="action";state.deck.push(...state.players.flatMap(player=>player.hand));for(const player of state.players) player.hand=[];
    const pull=(cardId:string)=>{const index=state.deck.indexOf(cardId);if(index<0) throw new Error(`Missing fixture card ${cardId}`);state.deck.splice(index,1);};
    if(id==="virus-control") {
      pull("virus");state.players[0]!.hand=["virus"];
      for(const cardId of ["weapon-gunhed","ak-12km","biochip"]) pull(cardId);
      const target=state.cybernet.pawnById(state.players[1]!.pawnId)!;gd.pawns.find(pawn=>pawn.id===target.pawnId)!.class=["cleaner"];
      target.attachments=[{cardId:"weapon-gunhed",slot:"add-on",slotRef:"pawn:add-on",bonusPaid:2},{cardId:"ak-12km",slot:"weapon",slotRef:"pawn:add-on/weapon",bonusPaid:1},{cardId:"biochip",slot:"gadget",slotRef:"pawn:gadget",bonusPaid:1}];
    } else {
      for(const cardId of ["lima-flag","dummy","dj"]) pull(cardId);state.players[0]!.hand=["dummy","dj"];
      const pawn=state.cybernet.pawnById(state.players[0]!.pawnId)!;pawn.coord={q:1,r:0};pawn.spaceId="a";pawn.attachments=[{cardId:"lima-flag",slot:"add-on",slotRef:"pawn:add-on"}];
      state.cybernet.blocks.push({blockId:"fixture-lima-board",coord:{q:1,r:0},rotation:0},{blockId:"fixture-lima-board",coord:{q:2,r:0},rotation:0});
    }
    return state;
  }
  if(id==="printed-delete") {
    state.phase="action";state.players[0]!.bonusCounters=4;
    state.deck.push(...state.players.flatMap(player=>player.hand));for(const player of state.players) player.hand=[];
    for(const cardId of ["weapon-gunhed","ak-12km","fixture-module-adapter","servocanon","dummy","electric-sheep"]) {
      state.deck.splice(state.deck.indexOf(cardId),1);state.players[0]!.hand.push(cardId);
    }
    gd.pawns.find(pawn=>pawn.id===state.players[1]!.pawnId)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:true}));
    return state;
  }
  if(id==="attachment-slots") {
    state.phase="action";state.players[0]!.bonusCounters=8;state.players[0]!.hand=["fixture-slot-gadget","fixture-slot-weapon","fixture-slot-module"];
    state.cybernet.pawnById(state.players[0]!.pawnId)!.attachments=[{cardId:"fixture-expiring-provider",slot:"add-on",slotRef:"pawn:add-on",bonusPaid:2}];
    return state;
  }
  if (id === "attachment-restrictions") {
    state.phase="action";state.players[0]!.hand=["worm","under-clocker","hijacker"];
    state.cybernet.placePawn({pawnId:"fixture-malware-target",ownerId:"p2",coord:{q:0,r:0},spaceId:"core"});
    state.reserve=state.reserve!.filter(pawnId=>pawnId!=="fixture-malware-target");
    return state;
  }
  if(id === "elimination-prevention") {
    state.phase="action";
    state.players[0]!.hand=["electric-sheep"];
    state.cybernet.pawnById(state.players[0]!.pawnId)!.attachments=[{cardId:"fixture-delete-grant",slot:"gadget"}];
    state.cybernet.pawnById(state.players[1]!.pawnId)!.attachments=[{cardId:"dummy",slot:"add-on",bonusPaid:1}];
    gd.pawns.find(pawn=>pawn.id===state.players[1]!.pawnId)!.defense=[1,2,3,4,5,6].map(value=>({value,shielded:false}));
    return state;
  }
  if (["phase-jetpack","phase-insider-trading","phase-electric-sheep"].includes(id)) {
    const cardId=id.slice("phase-".length);
    state.players[0]!.hand=["dj","dj","octagon-dex"];
    state.deck=["biochip","dj","octagon-dex"];
    state.players[0]!.oncePerTurnUsed={"fixture-used":true};
    state.cybernet.pawns.find(pawn=>pawn.ownerId==="p1")!.attachments=[{cardId,slot:"add-on",bonusPaid:gd.cards.find(card=>card.id===cardId)!.attach!.cost}];
    return state;
  }
  if (id === "phase-choices") {
    state.players[0]!.hand=["dj","dj"];
    state.players[0]!.oncePerTurnUsed={"fixture-used":true};
    state.cybernet.pawns.find(pawn=>pawn.ownerId==="p1")!.attachments=[{cardId:"toxin",slot:"add-on"}];
    return state;
  }
  if (id === "source-foundation") {
    state.phase = "action";
    state.players[0]!.pawnId="speedrunner-blue"; state.players[0]!.color="blue";
    state.players[1]!.pawnId="speedrunner-green"; state.players[1]!.color="green";
    state.cybernet.pawns=[{pawnId:"speedrunner-blue",ownerId:"p1",coord:{q:1,r:0},spaceId:"a"},{pawnId:"speedrunner-green",ownerId:"p2",coord:{q:0,r:0},spaceId:"core"}];
    state.outOfGame=["speedrunner-pink","speedrunner-orange"];
    state.reserve=gd.pawns.filter(pawn=>!state.cybernet.pawnById(pawn.id) && !state.outOfGame!.includes(pawn.id)).map(pawn=>pawn.id);
    state.controlCards=gd.controlCards!.map(card=>({cardId:card.id,subject:{...card.subject},ownerId:card.subject.id==="speedrunner-blue"?"p1":card.subject.id==="speedrunner-green"?"p2":"",zone:["speedrunner-blue","speedrunner-green"].includes(card.subject.id)?"control" as const:"out-of-game" as const}));
    state.cybernet.blocks.push({blockId:"fixture-source-arrows",rotation:0,coord:{q:1,r:0}});
    state.players[0]!.hand=["octagon-dex","dj","simstim-record","biochip","e-synapse-neural-interface","accelerator-transgenic-therapy"];
    state.players[0]!.bonusCounters=2;
    return state;
  }
  state.currentPlayer = 0;
  state.turn = 1;
  state.phase = "action";
  state.deck = ["move-3", "move-2", "move-1", "enemy-malware", "add-on-accelerator"];
  state.discard = [];
  state.blockPile = ["data-haven", "hacktivism"];
  state.eliminated = [];
  const p1 = state.players[0]!;
  const p2 = state.players[1]!;
  p1.oncePerTurnUsed = {}; p2.oncePerTurnUsed = {};
  const core = state.cybernet.blocks[0]!;
  state.cybernet.blocks = [core];
  state.cybernet.pawns = [];

  if (id === "threat-combat") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["move-2", "move-3", "move-1"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "data-haven", rotation: 0, coord: {q:1,r:0} });
    state.cybernet.placePawn({pawnId:p1.pawnId, ownerId:p1.id, coord:{q:1,r:0}, spaceId:"a"});
    state.cybernet.placePawn({pawnId:p2.pawnId, ownerId:p2.id, coord:{q:0,r:0}, spaceId:"core"});
    state.threats = [{id:"guard-lab",threatId:"guard",coord:{q:1,r:0},spaceId:"b",status:"inactive"}];
  } else if (id === "game-basics") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-blue";
    p1.controlMarkersPlaced = Math.max(0, p1.controlMarkersTotal - 1);
    p1.hand = ["move-1"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "data-haven", rotation: 0, coord: { q: 1, r: 0 } });
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 1, r: 0 }, spaceId: "a" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  } else if (id === "search-and-move") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["move-1", "move-2"]; p2.hand = ["move-1"];
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 0 }, spaceId: "core" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  } else if (id === "combat-and-control") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-yellow";
    p1.hand = ["move-1", "move-2", "move-3"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "hacktivism", rotation: 4, coord: { q: 0, r: 1 } });
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "h7" });
    state.cybernet.placePawn({ pawnId: "merc-cyberninja", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "h1" });
    state.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: p2.id, coord: { q: 0, r: 1 }, spaceId: "h2" });
    state.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: p2.id, coord: { q: 0, r: 1 }, spaceId: "h3" });
  } else if (id === "attachments") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-yellow";
    p1.hand = ["fixture-grant-stealth-steps", "fixture-armor-override", "fixture-block-nullify-ice", "enemy-malware", "move-1"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "data-haven", rotation: 0, coord: { q: 0, r: 1 } });
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "a" });
    state.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: p2.id, coord: { q: 0, r: 1 }, spaceId: "b" });
  } else if (id === "bonus-economy") {
    p1.pawnId = "speedrunner-yellow"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["fixture-search", "fixture-icebreak", "fixture-bonus-gadget"]; p2.hand = [];
    p1.controlMarkersPlaced = 2;
    state.cybernet.blocks.push(
      { blockId: "fixture-bonus-a", rotation: 0, coord: { q: 0, r: 1 }, ownerId: p1.id },
      { blockId: "fixture-bonus-b", rotation: 0, coord: { q: 1, r: 0 }, ownerId: p1.id },
    );
    state.blockPile = ["fixture-bonus-c"];
    state.cybernet.placePawn({ pawnId: "speedrunner-yellow", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "a" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  } else if (id === "effect-execution") {
    p1.pawnId = "speedrunner-red"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["cracker"]; p2.hand = [];
    state.cybernet.blocks.push({ blockId: "idoru", rotation: 0, coord: { q: 0, r: 1 } });
    state.cybernet.placePawn({ pawnId: "speedrunner-red", ownerId: p1.id, coord: { q: 0, r: 1 }, spaceId: "h1" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  } else if (id === "reboot-and-turn") {
    p1.pawnId = "speedrunner-green"; p2.pawnId = "speedrunner-blue";
    p1.hand = ["move-1", "move-1", "move-3", "enemy-malware", "add-on-accelerator"]; p2.hand = [];
    state.eliminated = ["speedrunner-red"];
    state.cybernet.placePawn({ pawnId: "speedrunner-green", ownerId: p1.id, coord: { q: 0, r: 0 }, spaceId: "core" });
    state.cybernet.placePawn({ pawnId: "speedrunner-blue", ownerId: p2.id, coord: { q: 0, r: 0 }, spaceId: "core" });
  }
  return state;
}

function replay(setup: PlaySetup, commands: PlayCommand[], scenarioId?: string): { data: GameData; state: GameState; events: TransitionResult["events"] } {
  const gd = playDataForScenario(scenarioId, setup.modeId);
  const state = scenarioId ? fixtureState(scenarioId, setup, gd) : newGame({ data: gd, ...setup });
  let events: TransitionResult["events"] = [];
  for (const command of commands) {
    const result = command.kind === "phase" ? advancePhase(state, gd) : applyActionWithEvents(state, gd, command.action);
    if (!result.accepted) throw new Error(`trace command is no longer valid: ${result.error ?? "rejected command"}`);
    events.push(...result.events);
  }
  return { data: gd, state, events };
}

function get(id: string): PlaySession {
  const session = sessions.get(id);
  if (!session) throw new Error("Play session not found");
  return session;
}

function readableData(gd: GameData) {
  return {
    mode: gd.mode,
    threats: gd.threats ?? [],
    blocks: gd.blocks.map(({ id, name, iceValue, iceFaces, blackIce, edges, spaces, effects, assetRefs, isCentralCore, nonPlayableZoneIds, spaceArrows, provisional }) => ({ id, name, iceValue, iceFaces, blackIce, edges, spaces, effects, assetRefs, isCentralCore, nonPlayableZoneIds, spaceArrows, provisional })),
    pawns: gd.pawns.map(({ id, name, class: pawnClass, movement, abilities, defense, slots, iceValue, iceFaces, controlMarkerEffect, phaseEffects, abilityTurn, special, artwork, assetRefs, provisional }) => ({ id, name, class: pawnClass, movement, abilities, defense, slots, iceValue, iceFaces, controlMarkerEffect, phaseEffects, abilityTurn, special, artwork, assetRefs, provisional })),
    cards: gd.cards.map(({ id, name, activates, attach, movement, effects, provisional, assetRefs, summary }) => ({ id, name, activates, attach, movement, effects, provisional, assetRefs, summary })),
  };
}

function movementLabel(name: string, option: MovementOption, movementIndex: number): string {
  const typeLabel = option.movement.type === "steps"
    ? `${Math.max(0, option.movement.steps ?? 0)} steps`
    : option.movement.type === "d6"
      ? "d6 steps"
      : option.movement.type === "2d6"
        ? "2d6 steps"
        : "hex";
  const sourceLabel = movementIndex === 0 ? "base" : `grant ${option.key}`;
  return `Move ${name} (${sourceLabel}: ${typeLabel}${option.stealth ? " · stealth" : ""})`;
}

function legalOptions(state: GameState, gd: GameData, scenarioId?: string) {
  state = cloneGameState(state); // Some granted-use gates roll; projection must never advance live RNG.
  const player = currentPlayer(state);
  if (state.pendingChoice) return {phase:state.phase,activePlayerId:state.pendingChoice.playerId,actions:[],choiceTargets:availableActions(state,gd)[0]?.targets??[],choiceResponses:availableActions(state,gd)[0]?.responses??[],unresolvedTargets:availableActions(state,gd)[0]?.unresolvedTargets??[],cardsInHand:state.players.find(p=>p.id===state.pendingChoice!.playerId)!.hand};
  const owned = state.cybernet.pawns.filter((pawn) => pawn.ownerId === player.id);
  const actions: Array<Record<string, unknown>> = [];
  const addAction = (type: string, label: string, extra: Record<string, unknown> = {}) => {
    const family = type === "pass" || type === "place-marker"
      ? "basics"
      : type.includes("move")
        ? "movement"
        : type.includes("search")
          ? "search"
          : type.includes("delete")
            ? "combat"
            : type.includes("icebreak")
              ? "icebreaker"
              : type.includes("attach")
                ? "attachments"
                : type.includes("reboot")
                  ? "reboot"
                  : "basics";
    actions.push({ type, label, family, ...extra });
  };
  if (state.pendingAttack) {const owner=state.players.find(p=>p.id===state.pendingAttack!.playerId)!;return { phase: state.phase, activePlayerId: owner.id, actions: [], cardsInHand: owner.hand };}
  if (state.pendingThreats?.stage === "retaliation") return { phase: state.phase, activePlayerId: player.id, actions: [], cardsInHand: player.hand };
  addAction("pass", "Pass");
  for (const pawn of owned) {
    const pawnDef = pawnById(gd, pawn.pawnId);
    if (pawnDef) {
      effectiveMovementOptions(gd, pawnDef, pawn.attachments).forEach((option, movementIndex) => {
        const preview = cloneGameState(state);
        const gate = canActivateMovementOption(preview, currentPlayer(preview), pawn.pawnId, option);
        if (gate) return;
        if (option.movement.type === "hex") {
          const directions = [0, 1, 2, 3, 4, 5].filter((dir) => state.cybernet.at(neighbor(pawn.coord, dir)));
          if (directions.length) {
            addAction("move-hex", movementLabel(pawnDef.name, option, movementIndex), {
              pawnId: pawn.pawnId,
              movement: option.movement,
              movementIndex,
              movementKey: option.key,
              stealth: option.stealth,
              directions,
            });
          }
          return;
        }
        const targets = stepTargets(gd, state.cybernet, pawn.coord, pawn.spaceId, pawn.pawnId);
        const maxSelectable = Math.max(0, maxSelectableSteps(option.movement.type, option.movement.steps) + movementStepModifier(gd, pawn));
        if (targets.length && maxSelectable > 0) {
          addAction("move-steps", movementLabel(pawnDef.name, option, movementIndex), {
            pawnId: pawn.pawnId,
            movement: option.movement,
            movementIndex,
            movementKey: option.key,
            stealth: option.stealth,
            maxSelectableSteps: maxSelectable,
            targets,
          });
        }
      });
    }
    const abilities = pawnDef ? ["search", "delete", "icebreaker", "reboot"].flatMap(name=>name==="delete"?deleteActivationOptions(gd,pawnDef,pawn.attachments):[effectiveAbility(gd,pawnDef,pawn.attachments,name)]).filter((ability)=>!!ability) : [];
    if (abilities.some((ability) => ability.ability === "search" && ability.activation === "once-per-turn")) {
      try { addAction("search", `Search with ${pawnDef?.name}`, { pawnId: pawn.pawnId, placements: validSearchPlacements(state, gd, pawn.pawnId) }); } catch { /* no legal placement is simply not an option */ }
    }
    const colocated = state.cybernet.pawns.filter((other) => other.pawnId !== pawn.pawnId && other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r);
    if (colocated.length && abilities.some((ability) => ability.ability === "delete" && ability.activation === "once-per-turn")) addAction("delete", `Delete with ${pawnDef?.name}`, { pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId) });
    const threats = (state.threats ?? []).filter(t => t.coord.q === pawn.coord.q && t.coord.r === pawn.coord.r && t.status !== "eliminated");
    for (const token of (state.threats ?? []).filter(t => t.coord.q === pawn.coord.q && t.coord.r === pawn.coord.r && t.status === "eliminated")) addAction("collect-threat", "Collect defeated threat token", { pawnId: pawn.pawnId, targetId: token.id });
    if ((colocated.length || threats.length) && abilities.some(ability => ability.ability === "delete" && ability.activation === "once-per-turn")) addAction("roll-delete", `Roll Delete with ${pawnDef?.name}`, { pawnId: pawn.pawnId });
    const deleteAbility = abilities.find((ability) => ability.ability === "delete" && ability.activation !== "none");
    const skulls = Math.max(1, deleteAbility?.skulls ?? 1);
    if (colocated.length && skulls > 1 && deleteAbility?.activation === "once-per-turn") addAction("delete-multi", `Split Delete with ${pawnDef?.name}`, { pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId), maxTargets: skulls });
    if (deleteAbility?.activation === "once-per-turn") addAction("delete-area", `Area Delete with ${pawnDef?.name}`, { pawnId: pawn.pawnId });
    if (colocated.length && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "once-per-turn")) {
      const enemyTargets = colocated
        .filter((other) => other.ownerId !== player.id)
        .filter((other) => {
          const target = pawnById(gd, other.pawnId);
          return ((target?.iceFaces?.length??0)>0 || !!target?.iceValue && target.iceValue !== "none") && !targetIceNullified(gd, other.attachments);
        })
        .map((other) => other.pawnId);
      if (enemyTargets.length) addAction("icebreak-pawn", `Icebreak with ${pawnDef?.name}`, { pawnId: pawn.pawnId, targetIds: enemyTargets });
    }
    const block = state.cybernet.at(pawn.coord);
    const blockDef = block ? blockDataFor(gd, block.blockId) : undefined;
    if (block && block.ownerId !== player.id && blockDef?.iceValue && blockDef.iceValue !== "none" && !targetIceNullified(gd, block.attachments) && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "once-per-turn")) addAction("icebreak-block", `Icebreak ${block.blockId}`, { pawnId: pawn.pawnId, coord: pawn.coord });
  }
  for (const cardId of new Set(player.hand)) {
    const card = gd.cards.find((item) => item.id === cardId);
    if (!card) continue;
    for (const pawn of owned) {
      const pawnDef = pawnById(gd, pawn.pawnId);
      const abilities = pawnDef ? ["search", "delete", "icebreaker", "reboot"].flatMap(name=>name==="delete"?deleteActivationOptions(gd,pawnDef,pawn.attachments):[effectiveAbility(gd,pawnDef,pawn.attachments,name)]).filter((ability)=>!!ability) : [];
      const colocated = state.cybernet.pawns.filter((other) => other.pawnId !== pawn.pawnId && other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r);
      if (card.activates?.includes("delete") && abilities.some((ability) => ability.ability === "delete" && ability.activation === "card") && colocated.length) addAction("play-delete", `Play ${card.name}: Delete`, { cardId, pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId) });
      const nearbyThreats = (state.threats ?? []).filter(t => t.coord.q === pawn.coord.q && t.coord.r === pawn.coord.r && t.status !== "eliminated");
      if (card.activates?.includes("delete") && abilities.some(a => a.ability === "delete" && a.activation === "card") && (colocated.length || nearbyThreats.length)) {
        addAction("roll-delete", `Play ${card.name}: Roll Delete`, { cardId, pawnId: pawn.pawnId });
        if (owned.filter(other => other.coord.q === pawn.coord.q && other.coord.r === pawn.coord.r && effectiveAbility(gd, pawnById(gd, other.pawnId)!, other.attachments, "delete")).length > 1 && nearbyThreats.length) addAction("roll-delete", `Play ${card.name}: Joint attack`, { cardId, pawnId: pawn.pawnId, joint: true });
      }
      const multiAbility = abilities.find((ability) => ability.ability === "delete" && ability.activation === "card");
      if (card.activates?.includes("delete") && multiAbility && (multiAbility.skulls ?? 1) > 1 && colocated.length) addAction("play-delete-multi", `Play ${card.name}: Split Delete`, { cardId, pawnId: pawn.pawnId, targetIds: colocated.map((other) => other.pawnId), maxTargets: multiAbility.skulls });
      if (card.activates?.includes("delete") && abilities.some((ability) => ability.ability === "delete" && ability.activation === "card")) addAction("play-delete-area", `Play ${card.name}: Area Delete`, { cardId, pawnId: pawn.pawnId });
      if (typeof card.movement === "number" && card.movement > 0 && pawnDef && effectiveMovementOptions(gd, pawnDef, pawn.attachments).length) {
        const targets = stepTargets(gd, state.cybernet, pawn.coord, pawn.spaceId, pawn.pawnId);
        if (targets.length) addAction("play-move", `Play ${card.name}: Move ${card.movement}`, { cardId, pawnId: pawn.pawnId, movement: { type: "steps", steps: card.movement, activation: "card" }, maxSelectableSteps: Math.max(0, card.movement + movementStepModifier(gd, pawn)), targets });
      }
      if (card.activates?.includes("icebreaker") && abilities.some((ability) => ability.ability === "icebreaker" && ability.activation === "card")) {
        const enemies = colocated
          .filter((other) => other.ownerId !== player.id)
          .filter((other) => {
            const target = pawnById(gd, other.pawnId);
            return ((target?.iceFaces?.length??0)>0 || !!target?.iceValue && target.iceValue !== "none") && !targetIceNullified(gd, other.attachments);
          })
          .map((other) => other.pawnId);
        if (enemies.length) addAction("play-icebreak-pawn", `Play ${card.name}: Icebreak pawn`, { cardId, pawnId: pawn.pawnId, targetIds: enemies });
        const block = state.cybernet.at(pawn.coord);
        const blockDef = block ? blockDataFor(gd, block.blockId) : undefined;
        if (block && block.ownerId !== player.id && blockDef?.iceValue && blockDef.iceValue !== "none" && !targetIceNullified(gd, block.attachments)) addAction("play-icebreak-block", `Play ${card.name}: Icebreak block`, { cardId, pawnId: pawn.pawnId, coord: pawn.coord });
      }
      if (abilities.some((ability) => ability.ability === "search" && ability.activation === "card")) {
        try { addAction("play-search", `Play ${card.name}: Search`, { cardId, pawnId: pawn.pawnId, placements: validSearchPlacements(state, gd, pawn.pawnId) }); } catch { /* no legal placement */ }
      }
      if (card.attach?.as === "enemy" && colocated.some((other) => other.ownerId !== player.id)) addAction("attach-enemy", `Attach ${card.name} to enemy`, { cardId, pawnId: pawn.pawnId, targetIds: colocated.filter((other) => other.ownerId !== player.id).map((other) => other.pawnId) });
      if (card.attach?.as === "block") addAction("attach-block", `Attach ${card.name} to block`, { cardId, pawnId: pawn.pawnId, coord: pawn.coord });
    }
    if (card.attach?.as === "pawn" && owned.length) addAction("attach-pawn", `Attach ${card.name} to pawn`, { cardId, targetIds: owned.map((pawn) => pawn.pawnId) });
  }
  for (const pawnId of state.eliminated) {
    const pawnDef = pawnById(gd, pawnId);
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "once-per-turn")) addAction("reboot", `Reboot ${pawnDef.name}`, { pawnId });
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "card")) for (const cardId of new Set(player.hand)) if (gd.cards.find(c => c.id === cardId)?.activates?.includes("reboot")) addAction("play-reboot-card", `Play ${gd.cards.find(c => c.id === cardId)?.name}: Reboot ${pawnDef.name}`, { pawnId, cardId });
    if (pawnDef?.abilities?.some((ability) => ability.ability === "reboot" && ability.activation === "card") && player.hand.length >= 4) addAction("play-reboot", `Play 4 cards: Reboot ${pawnDef.name}`, { pawnId, cardIds: player.hand });
  }
  // Confirm every fully specified choice on an independent reducer state.
  const accepts = (option: Record<string, unknown>, extra: Record<string, unknown> = {}) => applyActionWithEvents(cloneGameState(state), gd, { ...option, ...extra } as unknown as Action).accepted;
  const available = (state.phase !== "action" && !(state.pendingPhase && state.pendingThreats)) || state.winnerId ? [] : actions.flatMap((option) => {
    if (option.type === "move-steps" || option.type === "move-hex") {
      const movement = option.movement as { activation: string };
      if (movement.activation === "card") {
        const payment = player.hand.find((id) => (gd.cards.find((card) => card.id === id)?.movement ?? 0) > 0);
        if (!payment) return [];
        option = { ...option, cardId: payment, label: `${option.label} · discard ${gd.cards.find((card) => card.id === payment)?.name}` };
      }
    }
    if (Array.isArray(option.directions)) {
      option = { ...option, directions: option.directions.filter((dir) => accepts(option, { dir })) };
      return (option.directions as unknown[]).length ? [option] : [];
    }
    if (Array.isArray(option.placements)) {
      option = { ...option, placements: option.placements.filter((placement) => accepts(option, placement)) };
      return (option.placements as unknown[]).length ? [option] : [];
    }
    if (option.type === "move-steps" || option.type === "play-move") return [option]; // Paths are validated by movement preview and submission.
    if (Array.isArray(option.targetIds) && option.type !== "delete-multi" && option.type !== "play-delete-multi") {
      option = { ...option, targetIds: option.targetIds.filter((targetId) => accepts(option, { targetId })) };
      return (option.targetIds as unknown[]).length ? [option] : [];
    }
    if (option.type === "delete-multi" || option.type === "play-delete-multi") return accepts(option, { targetIds: [(option.targetIds as string[])[0]] }) ? [option] : [];
    if (option.type === "play-reboot") return accepts(option, { cardIds: player.hand.slice(0, 4) }) ? [option] : [];
    return accepts(option) ? [option] : [];
  });
  const engineOptions = gd.controlCards?.length ? availableActions(state, gd) : undefined;
  let scoped = engineOptions ? available.filter(option => engineOptions.some(({action}) => action.type === option.type && action.cardId === option.cardId && action.pawnId === option.pawnId && (action.movementIndex ?? 0) === (option.movementIndex ?? 0))) : available;
  if(engineOptions && gd.regressionFixture!=="provisional-v1") {
    scoped=scoped.filter(option=>!["attach-pawn","attach-enemy","roll-delete","search","play-search","roll-movement","move-steps","play-move","reboot","play-reboot-card","play-reboot"].includes(String(option.type)));
    for(const {action,movement,maxSteps,targets} of engineOptions.filter(option=>["move-steps","play-move"].includes(option.action.type))) {
      const pawn=state.cybernet.pawnById(action.pawnId!)!,definition=pawnById(gd,action.pawnId!)!,option=effectiveMovementOptions(gd,definition,pawn.attachments)[action.movementIndex??0];
      scoped.push({...action,family:"movement",movement,maxSelectableSteps:maxSteps??0,targets:targets??[],label:action.type==="play-move"?`Play ${gd.cards.find(card=>card.id===action.cardId)?.name}: Move ${gd.cards.find(card=>card.id===action.cardId)?.movement}`:movementLabel(definition.name,option!,action.movementIndex??0)});
    }
    for(const {action,movement} of engineOptions.filter(option=>option.action.type==="roll-movement")) scoped.push({...action,family:"movement",movement,label:`Roll ${movement?.type}: Move ${gd.pawns.find(pawn=>pawn.id===action.pawnId)?.name}${action.movementIndex?` · option ${action.movementIndex}`:""}`});
    for(const {action} of engineOptions.filter(option=>["search","play-search"].includes(option.action.type))) scoped.push({...action,family:"search",label:action.cardId?`Play ${gd.cards.find(card=>card.id===action.cardId)?.name}: Search`:`Search with ${gd.pawns.find(pawn=>pawn.id===action.pawnId)?.name}`,revealsBlock:true});
    for(const {action} of engineOptions.filter(option=>option.action.type==="roll-delete")) scoped.push({...action,family:"combat",label:`${action.cardId?`Play ${gd.cards.find(card=>card.id===action.cardId)?.name}: Roll Delete`:`Roll Delete with ${gd.pawns.find(pawn=>pawn.id===action.pawnId)?.name}`}${action.joint?" · Joint attack":""}`});
    for(const {action} of engineOptions.filter(option=>["reboot","play-reboot-card","play-reboot"].includes(option.action.type))) {
      const block=state.cybernet.at(action.coord!),name=gd.blocks.find(b=>b.id===block?.blockId)?.name??"Core";
      scoped.push({...action,family:"reboot",label:`${action.type==="play-reboot"?"Play 4 cards":action.cardId?`Play ${gd.cards.find(c=>c.id===action.cardId)?.name}`:"Free activation"}: Reboot at ${name}`});
    }
    const groups=new Map<string,Record<string,unknown>>();
    for(const {action} of engineOptions.filter(option=>["attach-pawn","attach-enemy"].includes(option.action.type))) {
      const key=JSON.stringify([action.type,action.cardId,action.pawnId,action.slotRef]);
      const group=groups.get(key);
      if(group) (group.targetIds as string[]).push(action.targetId!);
      else groups.set(key,{type:action.type,cardId:action.cardId,...(action.pawnId?{pawnId:action.pawnId}:{}),slotRef:action.slotRef,targetIds:[action.targetId!],family:"attachments"});
    }
    for(const group of groups.values()) {
      const multiple=[...groups.values()].filter(other=>other.type===group.type && other.cardId===group.cardId && other.pawnId===group.pawnId).length>1;
      group.label=`Attach ${gd.cards.find(card=>card.id===group.cardId)?.name} to ${group.type==="attach-pawn"?"pawn":"enemy"}${multiple?` · ${String(group.slotRef).replace("pawn:","").split("/").join(" → ")} slot`:""}`;
      scoped.push(group);
    }
  }
  return { phase: state.phase, activePlayerId: player.id, actions: scenarioId ? scoped : scoped.filter(a => !["delete", "delete-multi", "play-delete", "play-delete-multi"].includes(String(a.type))), cardsInHand: player.hand };
}

function maxSelectableSteps(type: string, steps?: number): number {
  switch (type) {
    case "steps": return Math.max(0, steps ?? 0);
    case "d6": return 6;
    case "2d6": return 12;
    default: return 0;
  }
}

function cleanPath(path: unknown): SpaceRef[] {
  if (!Array.isArray(path)) throw new Error("movement path must be an array");
  return path.map((step) => {
    if (!step || typeof step !== "object") throw new Error("each movement step must name a space");
    const candidate = step as { coord?: { q?: unknown; r?: unknown }; spaceId?: unknown };
    if (!Number.isSafeInteger(candidate.coord?.q) || !Number.isSafeInteger(candidate.coord?.r) || typeof candidate.spaceId !== "string") {
      throw new Error("each movement step needs integer q/r coordinates and a space id");
    }
    return { coord: { q: candidate.coord.q, r: candidate.coord.r }, spaceId: candidate.spaceId };
  });
}

/**
 * Projects the next guided step without resolving dice or mutating a session.
 * Source die movement previews the committed result; pre-roll path requests reject.
 * Frozen regression retains its historical maximum-path/roll-on-execution preview.
 */
export function getMovementOptions(id: string, pawnId: string, rawPath: unknown, cardId?: string, movementIndex = 0) {
  const session = get(id);
  if (session.state.phase !== "action") throw new Error("movement is available only during the action phase");
  const player = currentPlayer(session.state);
  const pawn = session.state.cybernet.pawnById(pawnId);
  if (!pawn || pawn.ownerId !== player.id) throw new Error("choose an active player's pawn");
  if(session.state.pendingChoice) {
    const choice=session.state.pendingChoice;if(choice.kind!=="move-path" || choice.pawnId!==pawnId || cardId) throw new Error("resolve the pending decision before previewing other movement");
    const preview=movementChoicePreview(session.state,session.data,cleanPath(rawPath)),m=choice.movement!;return {...preview,maxSelectableSteps:preview.budget,exactBudgetKnown:true,movement:{type:"steps",steps:preview.budget,activation:"once-per-turn"},movementIndex:m.movementIndex,movementKey:m.movementKey,stealth:m.stealth};
  }
  const definition = pawnById(session.data, pawnId);
  if (!definition) throw new Error("unknown pawn");
  let maximum: number;
  let movement: { type: string; steps?: number; activation: string };
  let movementKey = "base";
  let stealth = false;
  if (cardId) {
    const card = session.data.cards.find((item) => item.id === cardId);
    if (!player.hand.includes(cardId) || !card || !Number.isInteger(card.movement) || card.movement! <= 0) {
      throw new Error("choose a movement-valued card in the active player's hand");
    }
    if (!effectiveMovementOptions(session.data, definition, pawn.attachments).length) throw new Error("pawn cannot move");
    maximum = Math.max(0, card.movement! + movementStepModifier(session.data, pawn));
    movement = { type: "steps", steps: maximum, activation: "card" };
  } else {
    const option = effectiveMovementOptions(session.data, definition, pawn.attachments)[movementIndex];
    if (!option) throw new Error(`movement option ${movementIndex} is unavailable for pawn "${pawnId}"`);
    if(session.data.regressionFixture!=="provisional-v1" && ["d6","2d6"].includes(option.movement.type)) throw new Error("roll movement before choosing its path");
    const previewState = cloneGameState(session.state);
    const gate = canActivateMovementOption(previewState, currentPlayer(previewState), pawnId, option);
    if (gate) throw new Error(gate);
    if (option.movement.type === "hex") throw new Error("guided path preview supports only space movement; use the hex move action");
    maximum = Math.max(0, maxSelectableSteps(option.movement.type, option.movement.steps) + movementStepModifier(session.data, pawn));
    movement = option.movement;
    movementKey = option.key;
    stealth = option.stealth;
  }
  const path = cleanPath(rawPath);
  if (path.length > maximum) throw new Error(`path exceeds the selectable maximum of ${maximum} steps`);
  let coord = pawn.coord;
  let spaceId = pawn.spaceId;
  for (const [index, step] of path.entries()) {
    const reachable = stepTargets(session.data, session.state.cybernet, coord, spaceId, pawnId);
    if (!reachable.some((target) => target.coord.q === step.coord.q && target.coord.r === step.coord.r && target.spaceId === step.spaceId)) {
      throw new Error(`step ${index + 1} is not adjacent to the preceding space`);
    }
    coord = step.coord;
    spaceId = step.spaceId;
  }
  const source=session.data.regressionFixture!=="provisional-v1";
  const payment=cardId??(movement.activation==="card"?player.hand.find(id=>(session.data.cards.find(card=>card.id===id)?.movement??0)>0):undefined);
  const result=source?applyActionWithEvents(cloneGameState(session.state),session.data,{type:cardId?"play-move":"move-steps",pawnId,...(payment?{cardId:payment}:{}),...(cardId?{}:{movementIndex}),path}):undefined;
  return {
    pawnId,
    movement,
    movementIndex,
    movementKey,
    stealth,
    maxSelectableSteps: maximum,
    exactBudgetKnown: movement.type === "steps",
    path,
    canFinish: source?!!result?.accepted:path.length > 0 && !canEndOn(session.data, session.state.cybernet, coord, spaceId, pawnId),
    endError: source?(result?.error??""):path.length ? canEndOn(session.data, session.state.cybernet, coord, spaceId, pawnId) : "Choose at least one space",
    nextTargets: path.length < maximum ? stepTargets(session.data, session.state.cybernet, coord, spaceId, pawnId) : [],
  };
}

function blockDataFor(gd: GameData, id: string) { return gd.blocks.find((block) => block.id === id); }

function view(session: PlaySession) {
  const state = JSON.parse(snapshot(session.state));
  const scenario = session.scenarioId ? scenarioById(session.scenarioId) : undefined;
  return {
    id: session.id,
    recoveryTrace: traceForSession(session),
    setup: session.setup,
    scenario: scenario ? { ...scenario, checkpoints: scenario.checkpoints.map((label, index) => ({ id: `${scenario.id}-${index + 1}`, label, complete: scenarioCheckpoint(session, index) })) } : null,
    dataChecksum: checksumFor(session.setup, session.scenarioId),
    playerView:playerView(session.state,session.data,session.state.pendingChoice?.playerId??session.state.pendingAttack?.playerId??currentPlayer(session.state).id),
    abilityControllers:!session.state.winnerId && !session.state.pendingChoice && !session.state.pendingAttack && !session.state.pendingThreats && !session.state.pendingPhase ? session.state.players.filter(p=>(p.id!==currentPlayer(session.state).id || session.state.phase!=="action") && session.state.cybernet.pawns.some(placed=>placed.ownerId===p.id && pawnById(session.data,placed.pawnId)?.abilityTurn==="any-player-turn")).map(p=>({id:p.id,name:p.name})):[],
    playerEvents:eventsForPlayer(session.state,session.events,session.state.pendingChoice?.playerId??session.state.pendingAttack?.playerId??currentPlayer(session.state).id),
    state,
    players: session.state.players.map((player) => ({ id: player.id, name: player.name, color: player.color, pawnId: player.pawnId, markersTotal: player.controlMarkersTotal, markersPlaced: player.controlMarkersPlaced, bonus: player.bonusCounters, hand: player.hand.map((id) => ({ id, name: session.data.cards.find((card) => card.id === id)?.name ?? id })) })),
    activePlayer: session.state.players[session.state.currentPlayer] ? { id: session.state.players[session.state.currentPlayer]!.id, name: session.state.players[session.state.currentPlayer]!.name, color: session.state.players[session.state.currentPlayer]!.color } : null,
    bonusPool:bonusCounterPool(session.state),
    counts: { deck: session.state.deck.length, discard: session.state.discard.length, blockPile: session.state.blockPile.length, eliminated: session.state.eliminated.length },
    pawnClasses:Object.fromEntries(session.state.cybernet.pawns.map(pawn=>[pawn.pawnId,effectivePawnClasses(session.data,pawn)])),
    pawnDefenseProfiles:Object.fromEntries(session.state.cybernet.pawns.map(pawn=>{try {return [pawn.pawnId,{dice:defenseProfile(session.state,session.data,pawn)}];}catch(error) {return [pawn.pawnId,{dice:[],error:error instanceof Error?error.message:"Unsupported defense space"}];}})),
    pawnSlots:Object.fromEntries(session.state.cybernet.pawns.map(pawn=>[pawn.pawnId,pawnAttachmentSlots(session.data,pawn)])),
    pawnIcebreakerModifiers:Object.fromEntries(session.state.cybernet.pawns.map(pawn=>[pawn.pawnId,effectiveIcebreakerModifier(session.data,pawn)])),
    pawnDeleteProfiles:Object.fromEntries(session.state.cybernet.pawns.map(pawn=>[pawn.pawnId,deleteProfile(session.data,pawnById(session.data,pawn.pawnId)!,pawn.attachments)])),
    data: readableData(session.data),
    layout,
    coverage: coverageSurface("play-workbench"),
    legalOptions: legalOptions(session.state, session.data, session.scenarioId),
    events: session.events,
    commandCount: session.commands.length,
  };
}

function scenarioCheckpoint(session: PlaySession, index: number): boolean {
  switch (session.scenarioId) {
    case "copyleft-bonus":return index===0?session.events.some(e=>e.type==="bonus-counter-placed"):index===1?!!session.state.cybernet.pawnById(session.state.players[0]!.pawnId)?.attachments?.some(a=>a.cardId==="phase-loop"):session.state.cybernet.bonusIcons.some(i=>i.collectedBy==="p1") && bonusCounterPool(session.state)?.reserve===0;
    case "emp-sacrifice":return index===0?session.state.cybernet.blocks.some(b=>b.blockId==="electromagnetic-pulse"):index===1?session.commands.some(c=>c.kind==="action" && c.action.optionId==="sacrifice"):!session.state.pendingBlockSacrifices && session.commands.filter(c=>c.kind==="action" && c.action.optionId==="sacrifice").length===2;
    case "antro-discard": return index===0 ? session.commands.some(c=>c.kind==="action" && c.action.type==="play-move") : index===1 ? session.commands.some(c=>c.kind==="action" && c.action.type==="resolve-choice") : !session.state.pendingChoice && session.commands.some(c=>c.kind==="action" && c.action.type==="resolve-choice");
    case "sprawl-discard": {const placed=session.state.cybernet.blocks.some(b=>b.blockId==="chiba-city"),commits=session.commands.filter(c=>c.kind==="action" && c.action.type==="resolve-choice" && c.action.optionId==="discard").length;return index===0?placed:index===1?commits>=1:placed && !session.state.pendingBlockDiscards && commits===2 && session.state.discard.filter(c=>c==="move-1").length===2 && session.state.discard.includes("worm");}
    case "internal-arrows": {const p=session.state.cybernet.pawnById(session.state.players[0]!.pawnId)!;return index===0?!!p.attachments?.some(a=>a.cardId==="octagon-dex"):p.spaceId==="rabbit";}
    case "idoru-marker-victory": return index===0?session.state.cybernet.pawnById("idoru")?.ownerId==="p1":index===1?session.state.winnerId==="p1":session.state.controlCardMarkers?.some(m=>m.playerId==="p1" && m.cardId==="idoru-control")??false;
    case "toyeku-neutral": {const neutral=session.state.cybernet.pawnById("idoru"),actor=session.state.cybernet.pawnById(session.state.players[0]!.pawnId)!,placed=session.state.cybernet.at(actor.coord);return index===0?!!neutral && !neutral.ownerId:index===1?placed?.blockId==="idoru" && actor.spaceId==="defense":placed?.blockId==="idoru" && actor.spaceId==="defense" && defenseProfile(session.state,session.data,actor).some(d=>d.value===1 && !d.shielded);}
    case "zero-step-movement": {const pawn=session.state.cybernet.pawnById(session.state.players[0]!.pawnId)!,used=useMarkerAllocations(session.state).some(m=>m.pawnId===pawn.pawnId && m.ability==="move"),paid=(session.state.playedCards??[]).includes("move-1");return index===0?used:index===1?paid:used && paid && pawn.coord.q===0 && pawn.coord.r===0 && pawn.spaceId==="core";}
    case "physical-use-markers": {const target=session.state.players[1]!.pawnId,captured=session.state.cybernet.pawnById(target)?.ownerId==="p1";return index===0?captured:index===1?captured && session.commands.some(c=>c.kind==="action" && c.action.type==="attach-enemy") : captured && session.events.some(e=>e.type==="ability-use-cleared" && e.pawnId===target);}
    case "rolled-movement": {const pawn= session.state.cybernet.pawnById(session.state.players[0]!.pawnId)!;return index===0 ? session.events.some(e=>e.type==="roll" && e.actionType==="roll-movement") : index===1 ? pawn.spaceId==="c" : !session.state.pendingChoice && useMarkerAllocations(session.state).some(m=>m.pawnId===pawn.pawnId && m.ability==="move");}
    case "source-search":return index===0 ? session.events.some(event=>event.type==="block-drawn") : index===1 ? session.events.some(event=>event.type==="block-placed") : session.state.cybernet.blocks.some(block=>block.blockId==="fixture-search-tile") && session.state.discard.length===1 && session.state.players[0]!.hand.length===1;
    case "trojan-reveal":return index===0 ? !!session.state.cybernet.pawnById(session.state.players[1]!.pawnId)?.attachments?.some(att=>att.cardId==="trojan") : playerView(session.state,session.data,"p1").players[1]!.hand.visibility==="face-up";
    case "virus-control": return index===0 ? session.state.cybernet.pawnById(session.state.players[1]!.pawnId)?.ownerId==="p1" : index===1 ? session.state.discard.includes("virus") && session.state.discard.includes("weapon-gunhed") && session.state.discard.includes("ak-12km") && session.state.discard.includes("biochip") : session.state.players[1]!.bonusCounters===4;
    case "lima-flag": return index===0 ? !!session.state.cybernet.pawnById(session.state.players[0]!.pawnId)?.attachments?.some(att=>att.cardId==="lima-flag") : index===1 ? session.state.cybernet.pawnById(session.state.players[0]!.pawnId)?.coord.q===2 : session.commands.some(command=>command.kind==="action" && command.action.type==="play-move") && !!session.state.cybernet.pawnById(session.state.players[0]!.pawnId)?.attachments?.some(att=>att.cardId==="lima-flag");
    case "printed-delete": {
      const pawn=session.state.cybernet.pawnById(session.state.players[0]!.pawnId),cards=pawn?.attachments?.map(att=>att.cardId)??[];
      const free=session.commands.findIndex(command=>command.kind==="action" && command.action.type==="roll-delete" && !command.action.cardId);
      return index===0 ? cards.includes("weapon-gunhed") : index===1 ? cards.includes("ak-12km") && cards.includes("servocanon") : index===2 ? free>=0 : session.commands.some((command,at)=>at>free && free>=0 && command.kind==="action" && command.action.type==="roll-delete" && !!command.action.cardId);
    }
    case "attachment-slots": return index===0 ? session.commands.some(command=>command.kind==="action" && command.action.cardId==="fixture-slot-gadget") : index===1 ? session.commands.some(command=>command.kind==="action" && command.action.cardId==="fixture-slot-module") : session.state.discard.includes("fixture-expiring-provider") && !session.state.cybernet.pawns.some(pawn=>pawn.attachments?.some(att=>att.slotRef?.startsWith("pawn:add-on/")));
    case "attachment-restrictions": return index===0 ? legalOptions(session.state,session.data,session.scenarioId).actions.filter(action=>action.type==="attach-enemy").every(action=>(action.targetIds as string[]).every(id=>id==="fixture-malware-target")) : index===1 ? !!session.state.cybernet.pawnById("fixture-malware-target")?.attachments?.length : effectivePawnClasses(session.data,session.state.cybernet.pawnById("fixture-malware-target")!).includes("malware");
    case "elimination-prevention": return index===0 ? session.events.some(e=>e.type==="choice-required") : index===1 ? session.events.some(e=>e.type==="choice-resolved") : session.events.some(e=>e.type==="elimination-prevented") && session.state.discard.includes("dummy");
    case "phase-jetpack": return index===0 ? session.events.some(e=>e.type==="choice-required") : index===1 ? session.state.discard.includes("jetpack") && session.state.players[0]!.bonusCounters===1 : session.state.phase==="action";
    case "phase-insider-trading": return index===0 ? session.events.some(e=>e.type==="choice-required") : index===1 ? session.commands.some(c=>c.kind==="action" && c.action.type==="resolve-choice") : session.state.phase==="action" && session.state.cybernet.pawns.some(p=>p.attachments?.some(a=>a.cardId==="insider-trading"));
    case "phase-electric-sheep": return index===0 ? session.state.eliminated.includes(session.state.players[0]!.pawnId) : index===1 ? session.state.players[0]!.hand.length===6 : session.state.phase==="action";
    case "phase-choices": return index===0 ? session.events.some(e=>e.type==="choice-required") : index===1 ? session.events.some(e=>e.type==="choice-resolved") : session.state.phase==="action" && Object.keys(session.state.players[0]!.oncePerTurnUsed).length===0;
    case "source-foundation": return index === 0 ? !!session.state.cybernet.pawnById("speedrunner-blue")?.attachments?.some(a=>a.cardId==="octagon-dex") : index === 1 ? session.state.cybernet.pawnById("speedrunner-blue")?.coord.q === 0 : session.commands.length>0;
    case "threat-combat": return index === 0 ? session.commands.some(c => c.kind === "action" && ["move-steps", "play-move"].includes(c.action.type)) : index === 1 ? session.commands.some(c => c.kind === "action" && c.action.type === "assign-delete") : session.state.threats?.some(t => t.status === "eliminated") || session.commands.some(c => c.kind === "action" && c.action.type === "assign-threat-attack");
    case "game-basics": return index === 0 ? session.commands.some((command) => command.kind === "action" && command.action.type === "play-icebreak-block") : Boolean(session.state.winnerId);
    case "search-and-move": return index === 0 ? session.state.cybernet.blocks.length > 1 : index === 1 ? session.state.cybernet.pawns.some((pawn) => pawn.pawnId === "speedrunner-red" && (pawn.coord.q !== 0 || pawn.coord.r !== 0)) : session.commands.length > 2;
    case "combat-and-control": return index === 0 ? session.commands.some((command) => command.kind === "action" && command.action.type === "play-delete") : index === 1 ? session.commands.some((command) => command.kind === "action" && (command.action.type === "delete-multi" || command.action.type === "play-delete-multi")) : index === 2 ? session.commands.some((command) => command.kind === "action" && command.action.type.startsWith("play-icebreak")) : session.events.some((event) => event.type === "roll");
    case "attachments": return index === 0 ? Boolean(session.state.cybernet.pawnById("speedrunner-red")?.attachments?.some((att) => att.cardId === "fixture-grant-stealth-steps")) : index === 1 ? Boolean(session.commands.some((command) => command.kind === "action" && command.action.type === "move-steps" && command.action.movementIndex === 1)) : !legalOptions(session.state, session.data, session.scenarioId).actions.some((action) => action.type === "play-icebreak-block");
    case "bonus-economy": return index === 0 ? Boolean(session.state.cybernet.bonusIcons?.length) : index === 1 ? Boolean(session.state.cybernet.bonusIcons?.some((icon) => icon.collectedBy === "p1")) : Boolean(session.state.cybernet.pawnById("speedrunner-yellow")?.attachments?.some((att) => att.cardId === "fixture-bonus-gadget"));
    case "effect-execution": return index === 0 ? Boolean(session.commands.some((command) => command.kind === "action" && command.action.type === "play-icebreak-block")) : index === 1 ? Boolean(session.state.cybernet.pawnById("cracker") && session.state.cybernet.pawnById("idoru")) : Boolean(session.events.filter((event) => event.type === "pawn-placed").some((event) => event.elementId === "cracker" || event.elementId === "idoru"));
    case "arms-industry": return index===0?session.events.some(e=>e.type==="block-drawn" && e.elementId==="arms-industry"):index===1?session.events.some(e=>e.type==="bonus-counter-placed" && e.element==="block" && e.elementId==="arms-industry"):index===2?session.commands.some(c=>c.kind==="action" && c.action.type==="play-move" && c.action.pawnId===session.state.players[0]!.pawnId && c.action.path?.at(-1)?.spaceId==="hand"):session.state.cybernet.at({q:1,r:0})?.bonusCounter?.collectedBy==="p1" && session.state.players[0]!.bonusCounters===24;
    case "drone-turret": return index===0?session.state.controlCards?.some(c=>c.subject.id==="drone-turret" && c.ownerId==="p1"):index===1?session.commands.some(c=>c.kind==="action" && c.action.type==="play-move" && c.action.pawnId===session.state.players[1]!.pawnId && c.action.path?.at(-1)?.spaceId==="drone-turret"):index===2?session.events.some(e=>e.type==="roll" && e.playerId==="p1" && e.actionType==="roll-delete"):session.commands.some(c=>c.kind==="action" && c.action.type==="assign-delete" && c.action.playerId==="p1") && session.state.currentPlayer===1;
    case "drone-probe": return index===0?session.state.controlCards?.some(c=>c.subject.id==="drone-probe" && c.ownerId==="p1"):index===1?session.events.some(e=>e.type==="block-drawn" && e.elementId==="engineering-war" && e.pawnId==="drone-probe"):index===2?session.events.some(e=>e.type==="block-placed" && e.elementId==="engineering-war" && e.pawnId==="drone-probe"):session.commands.some(c=>c.kind==="action" && c.action.type==="move-steps" && c.action.pawnId==="drone-probe") && session.state.cybernet.pawnById("drone-probe")?.coord.q===2;
    case "engineering-mk2": return index===0?session.events.some(e=>e.type==="block-placed" && e.elementId==="engineering-war"):index===1?session.state.controlCards?.some(c=>c.subject.id==="drone-mk-2" && c.ownerId==="p1"):index===2?session.commands.some(c=>c.kind==="action" && c.action.type==="move-steps" && c.action.pawnId==="drone-mk-2") && session.state.cybernet.pawnById("drone-mk-2")?.coord.q===0:session.events.some(e=>e.type==="elimination" && e.pawnId===session.state.players[1]!.pawnId);
    case "black-clinic": return index===0?session.events.some(e=>e.type==="control-changed" && e.element==="block" && e.toOwnerId==="p1"):index===1?session.events.some(e=>e.type==="block-attachments-discarded" && e.pawnId===session.state.players[0]!.pawnId && e.amount===3):index===2?session.state.cybernet.pawnById(session.state.players[0]!.pawnId)?.spaceId==="hand":session.commands.some(c=>c.kind==="action" && c.action.type==="recycle") && session.state.players[0]!.hand.length===4;
    case "corporate-scandal": return index===0?session.events.some(e=>e.type==="block-placed" && e.elementId==="corporate-scandal"):index===1?session.events.filter(e=>e.type==="block-hand-discarded").length===2:session.events.some(e=>e.type==="block-hand-discarded") && !!session.state.playedCards?.includes("worm");
    case "yakuza-attack": return index===0?session.state.cybernet.blocks.some(b=>b.blockId==="yakuza" && b.ownerId==="p1"):index===1?session.events.some(e=>e.type==="block-attack-targeted"):session.events.some(e=>e.type==="elimination-prevented" || e.type==="elimination");
    case "pink-control": {const p=session.state.cybernet.pawnById("gynoid");return index===0?session.events.some(e=>e.type==="block-placed" && e.elementId==="pink-district"):index===1?p?.ownerId==="p1" && p.spaceId==="gynoid":p?.spaceId==="gynoid";}
    case "gynoid-theft":return index===0?session.events.some(e=>e.type==="choice-required"):session.events.some(e=>e.type==="card-stolen" && e.fromOwnerId==="p2");
    case "broadcast-reboot": {const p=session.state.cybernet.pawnById(session.state.players[0]!.pawnId);return index===0?session.commands.some(c=>c.kind==="action" && c.action.coord?.q===1 && c.action.spaceId==="broadcast"):index===1?p?.spaceId==="broadcast" && p.coord.q===1:session.commands.length>0 && p?.spaceId==="broadcast";}
    case "reboot-and-turn": return index === 0 ? !session.state.eliminated.includes("speedrunner-red") : index === 1 ? session.state.turn > 1 : session.commands.length > 0;
    default: return false;
  }
}

export function createPlaySession(setup: PlaySetup) {
  const normalized = cleanSetup(setup);
  const sessionData = playDataForScenario(undefined, normalized.modeId);
  if (normalized.modeId === "speedrunners" && [...sessionData.blocks, ...sessionData.pawns, ...sessionData.cards].some(record=>record.provisional)) throw new Error("Official Speedrunners is not ready: source data and effects remain provisional. Choose Quick match.");
  if (normalized.modeId && controlMarkersFor(sessionData.mode, normalized.playerNames.length) > sessionData.blocks.filter((block) => !block.isCentralCore && block.iceValue !== "none").length) throw new Error("Official match needs more transcribed blocks to reach victory. Choose Quick match.");
  const state = newGame({ data: sessionData, ...normalized });
  const session: PlaySession = { id: `play-${hostIdentity}-${nextSessionID++}`, setup: normalized, commands: [], data: sessionData, state, events: [] };
  sessions.set(session.id, session);
  return view(session);
}

export function createPlayScenario(id: string, setup: PlaySetup = { playerNames: ["Ada", "Bea"], seed: 5 }) {
  const normalized = cleanSetup(setup);
  const sessionData = playDataForScenario(id);
  const state = fixtureState(id, normalized, sessionData);
  const session: PlaySession = { id: `play-${hostIdentity}-${nextSessionID++}`, setup: normalized, scenarioId: id, commands: [], data: sessionData, state, events: [] };
  sessions.set(session.id, session);
  return view(session);
}

export function resetPlaySession(id: string, setup?: PlaySetup) {
  const session = get(id);
  session.setup = cleanSetup(setup ?? session.setup);
  session.commands = [];
  const replayed = replay(session.setup, [], session.scenarioId);
  session.data = replayed.data;
  session.state = replayed.state;
  session.events = [];
  return view(session);
}

export function getPlayPlayerView(id:string,viewerId="") { const session=get(id);return {view:playerView(session.state,session.data,viewerId),events:eventsForPlayer(session.state,session.events,viewerId)}; }

export function getPlaySession(id: string) { return view(get(id)); }

export function submitPlayCommand(id: string, command: PlayCommand) {
  const session = get(id);
  const result = command.kind === "phase" ? advancePhase(session.state, session.data) : applyActionWithEvents(session.state, session.data, command.action);
  session.events.push(...result.events);
  if (result.accepted) session.commands.push(command);
  return { ...view(session), result };
}

export function undoPlayCommand(id: string) {
  const session = get(id);
  session.commands.pop();
  const replayed = replay(session.setup, session.commands, session.scenarioId);
  session.data = replayed.data;
  session.state = replayed.state;
  session.events = replayed.events;
  return view(session);
}

export function exportPlayTrace(id: string): PlayTrace {
  return traceForSession(get(id));
}

function traceForSession(session: PlaySession): PlayTrace {
  const trace: PlayTrace = session.scenarioId
    ? { format: "zaibatsu-speedrunners-trace/v2", setup: session.setup, scenarioId: session.scenarioId, dataChecksum: checksumFor(session.setup, session.scenarioId), commands: session.commands }
    : { format: "zaibatsu-speedrunners-trace/v1", setup: session.setup, dataChecksum: checksumFor(session.setup, session.scenarioId), commands: session.commands };
  return structuredClone(trace);
}

export function importPlayTrace(trace: PlayTrace) {
  if (trace?.format !== "zaibatsu-speedrunners-trace/v1" && trace?.format !== "zaibatsu-speedrunners-trace/v2") throw new Error("Unsupported play trace format");

  const setup = cleanSetup(trace.setup);
  if (!Array.isArray(trace.commands)) throw new Error("Trace commands must be an array");
  const scenarioId = trace.format === "zaibatsu-speedrunners-trace/v2" ? trace.scenarioId : undefined;
  if (scenarioId) scenarioById(scenarioId);
  if (trace.dataChecksum !== checksumFor(setup, scenarioId)) throw new Error("Trace data checksum does not match selected Speedrunners corpus or rules version");
  const replayed = replay(setup, trace.commands, scenarioId);
  const session: PlaySession = { id: `play-${hostIdentity}-${nextSessionID++}`, setup, scenarioId, commands: trace.commands, data: replayed.data, state: replayed.state, events: replayed.events };
  sessions.set(session.id, session);
  return view(session);
}

export const playDataChecksum = regressionChecksum;
