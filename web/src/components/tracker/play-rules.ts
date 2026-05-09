// Constraint engine for play tagging.
//
// Source of truth for transitions: TAGGING_RULES.md "PREVIOUS PLAY → NEXT
// CONTACT". The engine is intentionally strict on CONTINUED transitions (where
// the next contact is deterministic) and permissive on rally-ending results
// (SUCCESS/ERROR) because simultaneous events on one contact — stuff blocks,
// jousts, overpass-kills — legitimately need follow-up tags. See edge cases
// 1, 2, and 4 in TAGGING_RULES.md.

import type { components } from "@/lib/api-types";

type PlayAction = components["schemas"]["PlayAction"];
type PlayResult = components["schemas"]["PlayResult"];

export type Side = "home" | "away";

export type PlaySnapshot = {
  action: PlayAction;
  result: PlayResult;
  team: Side | null;
};

export type ActionConstraints = {
  allowedActions: ReadonlySet<PlayAction>;
  expectedTeam: Side | null;
  reason: string;
};

const ALL_ACTIONS: ReadonlySet<PlayAction> = new Set([
  "SERVE",
  "PASS",
  "SET",
  "ATTACK",
  "BLOCK",
  "DIG",
  "FREEBALL",
]);

const opp = (s: Side): Side => (s === "home" ? "away" : "home");

export function getActionConstraints(
  plays: ReadonlyArray<PlaySnapshot>,
): ActionConstraints {
  if (plays.length === 0) {
    return {
      allowedActions: new Set(["SERVE"]),
      expectedTeam: null,
      reason: "Rally starts with a serve.",
    };
  }
  const last = plays[plays.length - 1];

  // Rally-ending results: keep all actions reachable so taggers can record
  // simultaneous events (stuff block + attack error, joust, overpass-kill).
  // The hint signals "rally probably ended."
  if (last.result !== "CONTINUED") {
    return {
      allowedActions: ALL_ACTIONS,
      expectedTeam: null,
      reason: "Rally appears ended — press R to close it (or tag a simultaneous event).",
    };
  }

  // CONTINUED → next contact is deterministic per TAGGING_RULES.md.
  const team = last.team;
  switch (last.action) {
    case "SERVE":
      return {
        allowedActions: new Set(["PASS"]),
        expectedTeam: team ? opp(team) : null,
        reason: "After SERVE → PASS by receiving team.",
      };
    case "FREEBALL":
      return {
        allowedActions: new Set(["PASS"]),
        expectedTeam: team ? opp(team) : null,
        reason: "After FREEBALL → PASS by receiving team.",
      };
    case "ATTACK":
      // Block is a legal alternative to dig when the defender is at net above tape.
      return {
        allowedActions: new Set(["DIG", "BLOCK"]),
        expectedTeam: team ? opp(team) : null,
        reason: "After ATTACK → DIG (or BLOCK above tape) by defending team.",
      };
    case "BLOCK":
      // Block deflection can land on either side — attacking team digs the
      // ricochet, or defending team's back row digs the soft block.
      return {
        allowedActions: new Set(["DIG"]),
        expectedTeam: null,
        reason: "After BLOCK → DIG by whichever side recovers.",
      };
    case "PASS":
      return {
        allowedActions: new Set(["SET"]),
        expectedTeam: team,
        reason: "After PASS → SET (same team).",
      };
    case "DIG":
      return {
        allowedActions: new Set(["SET"]),
        expectedTeam: team,
        reason: "After DIG → SET (same team).",
      };
    case "SET":
      return {
        allowedActions: new Set(["ATTACK"]),
        expectedTeam: team,
        reason: "After SET → ATTACK (same team).",
      };
  }
  return { allowedActions: ALL_ACTIONS, expectedTeam: null, reason: "" };
}

// suggestWinner: who won the rally based on the last play. Used by the End
// Rally dialog to pre-highlight the implied winner (Phase A step 3).
export function suggestWinner(
  plays: ReadonlyArray<PlaySnapshot>,
): Side | null {
  if (plays.length === 0) return null;
  const last = plays[plays.length - 1];
  if (last.team !== "home" && last.team !== "away") return null;
  const team = last.team;
  const other = opp(team);

  if (last.action === "ATTACK" && last.result === "SUCCESS") return team;
  if (last.action === "ATTACK" && last.result === "ERROR") return other;
  if (last.action === "SERVE" && last.result === "SUCCESS") return team;
  if (last.action === "SERVE" && last.result === "ERROR") return other;
  if (last.action === "BLOCK" && last.result === "SUCCESS") return team;
  if (last.action === "BLOCK" && last.result === "ERROR") return other;
  if (last.action === "FREEBALL" && last.result === "SUCCESS") return team;
  if (last.action === "FREEBALL" && last.result === "ERROR") return other;
  if (last.action === "PASS" && last.result === "ERROR") return other;
  if (last.action === "DIG" && last.result === "ERROR") return other;
  if (last.action === "SET" && last.result === "ERROR") return other;
  return null;
}
