// Runs a demo Speedrunners game to completion using the shared data in
// spec/data. The TS mirror of impl/go/cmd/zaibatsu/main.go.

import { loadDefault } from "./data/index.ts";
import { newGame, runTurn, winner } from "./engine/index.ts";

const data = loadDefault("speedrunners");

const s = newGame({
  data,
  playerNames: ["Arasaka", "Militech"],
  seed: 42,
});

console.log(`Zaibatsu — ${data.mode.name} demo (TypeScript/Bun)`);
s.players.forEach((p, i) => {
  console.log(
    `  Player ${i + 1}: ${p.name.padEnd(10)} pawn=${p.pawnId.padEnd(18)} markers=${p.controlMarkersTotal} hand=${p.hand.length}`,
  );
});
console.log("Playing: each player places one control marker per turn...");

let guard = 0;
while (!winner(s)) {
  if (++guard > 10000) throw new Error("game failed to terminate");
  runTurn(s, data, [{ type: "place-marker" }]);
}

const win = winner(s);
const p = s.players.find((pl) => pl.id === win)!;
console.log(
  `Winner: ${p.name} (${p.id}) on turn ${s.turn} — ${p.controlMarkersPlaced}/${p.controlMarkersTotal} control markers placed.`,
);
