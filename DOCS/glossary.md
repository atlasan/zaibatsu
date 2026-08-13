# Glossary

Shared vocabulary for the codebase and docs. Terms are the game's own; we keep
them verbatim so code, data, and rulebook line up.

| Term | Meaning |
|------|---------|
| **Zaibatsu** | A player — a megacorporation controlling pawns. |
| **Cybernet** | The board: a growing hex layout of information blocks, seeded by the Central Core. |
| **Information block** | A hexagonal tile forming the Cybernet; has seven standard internal placement hexes, gameplay spaces, ICE, effects, and bonus fragments. |
| **Central Core** | The starting block at the center; all pawns begin here. Shadowraiders adds **Central Core 02** with a direction die. |
| **Space** | A gameplay location mapping one or more of a block's seven standardized placement hexes; capacity is explicit (legacy `double` means 2). |
| **Pawn** | An agent under (or free of) player control; a piece (position) + control card (attributes). |
| **Class-type** | A pawn/card category (operative, drone, bot, cyborg, …); some effects target specific classes. |
| **Control card** | Represents control of a specific pawn or block; kept face-up in a player's control zone. |
| **Action card** | A card from the shared action deck; **multi-use** — one use chosen per play. |
| **Control marker** | A player's claim token. **Placing all of yours wins the game.** |
| **Bonus counter** | Currency for paying card costs; always returned to its owner, never destroyed. |
| **Bonus icon** | Formed by three ⅓ **bonus fragments** from adjacent blocks; yields a bonus counter. |
| **Start-of-turn marker** | Marks a once-per-turn ability as spent; cleared in the owner's beginning phase. |
| **ICE value** | A block's or pawn's defense against **Icebreaker**: low (3 dice) / medium (2) / high (1) / **Black ICE**. |
| **Black ICE** | Aggressive ICE: failing an Icebreak against it eliminates the attacking pawn. |
| **Defense dice** | A pawn's resistance: **shielded** (black, blocks) vs **unshielded** (white, vulnerable). |
| **Skull icon** | Attack power: one attack d6 per skull on the Delete ability. |
| **Search / Delete / Reboot / Icebreaker** | The four core abilities (place block / kill pawn / respawn / take control). |
| **Movement attribute** | How a pawn moves: fixed steps, `d6`, `2d6`, or `hex` (whole block). |
| **Attachment slot** | Where cards attach to a pawn: add-on / gadget / weapon / armor / module / mission. |
| **Threat** *(SR)* | Anything in the Cybernet with an attack die: drone threat, threat token, mark, or chaos. |
| **Threat token** *(SR)* | Replaces bonus counters in Shadowraiders; sits on event spaces; collectible as a bonus counter once cleared. |
| **Event space** *(SR)* | A block space that holds a threat token. |
| **Mission card** *(SR)* | Attached to a mission slot; completing it grants medals or control of a pawn. |
| **Medal** *(SR)* | Mission reward; each medal lets you place one control marker. |
| **Mark / Cargo** *(SR)* | Mission tags: a Mark is a target to eliminate; Cargo is an object/companion to escort. |
| **Shadowraider** *(SR)* | The upgraded starting pawn in Shadowraiders; has a mission slot. |
| **Stealth movement** *(SR)* | Movement that passes threats without activating them. |

*(SR)* = introduced by the Shadowraiders expansion.
