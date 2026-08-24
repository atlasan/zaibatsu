# Editor handoff — ActionCardRecord fields

The action-card **schema** (`spec/schema/action-card.schema.json`) was enriched to
the full source-reviewed card shape (see `DOCS/component-model.md`). The block
editor's `ActionCardRecord` (`tools/block-editor/model.ts`) is the human-authoring
interface and must mirror it so a reviewer can enter every field. This is the
target shape to sync (the editor record = the schema fields **plus** the editor's
own `expansion`; everything except `id`/`name` is optional).

```ts
export type AbilityName = "search" | "delete" | "reboot" | "icebreaker";
export type GrantableAbility = AbilityName | "move";

export interface MovementValue {
  type: "fixed" | "d6" | "2d6" | "hex"; // fixed steps / 1d6 / 2d6 / one whole hex (SR-MOVE-001)
  amount?: number;                       // step count for `fixed` (or bonus added to a dice roll)
  stealth?: boolean;                     // Shadowraiders: no threat wake (SH-PAWN-001)
}

export interface AbilityUse {
  ability: GrantableAbility;
  perTurn?: number;                      // a fixed number of uses per turn
  dice?: "d6";                           // or the per-turn count is a d6 roll
  activation?: "card" | "once-per-turn"; // or card / once-per-turn activated
}

export interface ActionCardRecord {
  id: string;
  name: string;                          // title
  type?: "add-on" | "gadget" | "weapon" | "armor" | "module"
       | "mission" | "action" | "movement" | "event";
  expansion: Expansion;                  // editor-only (data-org), not in the schema
  copies: number;
  summary?: string;
  movement?: number;                     // legacy simple = one { type:"fixed", amount }
  movements?: MovementValue[];           // 0+ action-part movement options
  activates?: AbilityName[];             // 0+ (normally one) action
  attach?: {
    as?: "pawn" | "enemy" | "block";
    slot?: "add-on" | "gadget" | "weapon" | "armor" | "module" | "mission";
    class?: string[];                    // TARGET class restriction
    grants?: GrantableAbility[];
    removes?: GrantableAbility[];
    grantsMovement?: MovementValue[];    // movement options given to the target
    abilityUses?: AbilityUse[];          // how a granted ability/move is used
    iceModifier?: { faces?: number[]; deltaDice?: number; black?: boolean };
    drawModifier?: number;               // cards drawn per turn (+/-)
    handModifier?: number;               // max hand size (+/-)
    blockSpace?: { shape?: "circle" | "hex" }; // when as="block": a mini-block
    effectText?: string;
    effectTrigger?: "on-attach" | "begin-turn" | "end-turn"
                  | "on-control" | "on-icebreak" | "continuous";
    cost?: number;                       // bonus-counter cost (1+)
  };
  assetRefs: string[];
  provisional: boolean;
}
```

Notes for the editor UI:
- **Two-part authoring:** the *action part* (`movements`, `activates`) and the
  *card part* (`attach`) are independent — a card usually has both. See the
  "two independent parts" section in `DOCS/component-model.md`.
- The current action-card editor exposes every field above through structured
  controls. Its JSON preview is derived/read-only and exists only to show the
  normalized record that validation/export will use.
- The vision prefill (`tools/hexvision/cards.py` → `proposals`) already suggests
  `activates`, `attach.slot`/`as`/`class`, and flags `removes` via the ✕ marker;
  the rest (movements, iceModifier, effect timing, …) are human-entered.
- `buildActionCardPatch` writes `document.actionCard` verbatim to
  `spec/data/<expansion>/action-cards.json` — no field mapping needed once the
  record matches the schema.
