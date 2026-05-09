"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { components } from "@/lib/api-types";
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTimecode } from "@/lib/format";
import {
  getActionConstraints,
  isRallyEndingPlay,
  type PlaySnapshot,
  type Side,
} from "./play-rules";

type Rally = components["schemas"]["RallyRead"];
type Play = components["schemas"]["PlayRead"];
type Team = components["schemas"]["TeamRead"];
type Player = components["schemas"]["PlayerRead"];
type PlayAction = components["schemas"]["PlayAction"];
type PlayResult = components["schemas"]["PlayResult"];

const ACTIONS: { key: string; action: PlayAction; label: string }[] = [
  { key: "Q", action: "SERVE", label: "Serve" },
  { key: "W", action: "PASS", label: "Pass" },
  { key: "E", action: "SET", label: "Set" },
  { key: "F", action: "ATTACK", label: "Attack" },
  { key: "T", action: "BLOCK", label: "Block" },
  { key: "Y", action: "DIG", label: "Dig" },
  { key: "U", action: "FREEBALL", label: "Freeball" },
];

// Row 1 = offensive sequence (serve→pass→set→attack); row 2 = defensive +
// emergency. Two grids instead of cols-7 wrap so each cell is finger-targetable.
const ACTIONS_ROW_1 = ACTIONS.slice(0, 4);
const ACTIONS_ROW_2 = ACTIONS.slice(4);

// Color identity helps muscle memory during real-time tracking.
// All class strings are literal so Tailwind's JIT picks them up.
const ACTION_STYLES: Record<
  PlayAction,
  { enabled: string; disabled: string; ring: string }
> = {
  SERVE: {
    enabled: "bg-blue-500 text-white hover:bg-blue-600",
    disabled: "bg-blue-500/15 text-blue-900/60 dark:text-blue-200/50",
    ring: "ring-blue-500",
  },
  PASS: {
    enabled: "bg-emerald-500 text-white hover:bg-emerald-600",
    disabled: "bg-emerald-500/15 text-emerald-900/60 dark:text-emerald-200/50",
    ring: "ring-emerald-500",
  },
  SET: {
    enabled: "bg-amber-500 text-white hover:bg-amber-600",
    disabled: "bg-amber-500/15 text-amber-900/70 dark:text-amber-200/50",
    ring: "ring-amber-500",
  },
  ATTACK: {
    enabled: "bg-red-500 text-white hover:bg-red-600",
    disabled: "bg-red-500/15 text-red-900/60 dark:text-red-200/50",
    ring: "ring-red-500",
  },
  BLOCK: {
    enabled: "bg-purple-500 text-white hover:bg-purple-600",
    disabled: "bg-purple-500/15 text-purple-900/60 dark:text-purple-200/50",
    ring: "ring-purple-500",
  },
  DIG: {
    enabled: "bg-orange-500 text-white hover:bg-orange-600",
    disabled: "bg-orange-500/15 text-orange-900/60 dark:text-orange-200/50",
    ring: "ring-orange-500",
  },
  FREEBALL: {
    enabled: "bg-slate-500 text-white hover:bg-slate-600",
    disabled: "bg-slate-500/15 text-slate-900/60 dark:text-slate-200/50",
    ring: "ring-slate-500",
  },
};

const RESULTS: { key: string; result: PlayResult; label: string; bg: string }[] = [
  {
    key: "S",
    result: "SUCCESS",
    label: "Success",
    bg: "bg-emerald-500 hover:bg-emerald-600",
  },
  {
    key: "X",
    result: "ERROR",
    label: "Error",
    bg: "bg-red-500 hover:bg-red-600",
  },
  {
    key: "C",
    result: "CONTINUED",
    label: "Continued",
    bg: "bg-blue-500 hover:bg-blue-600",
  },
];

const ACTION_KEY_MAP = new Map(
  ACTIONS.map((a) => [a.key.toLowerCase(), a.action]),
);
const RESULT_KEY_MAP = new Map(
  RESULTS.map((r) => [r.key.toLowerCase(), r.result]),
);

const PARTIAL_TIMEOUT_MS = 10_000;

type Props = {
  rally: Rally;
  homeTeam: Team & { players: Player[] };
  awayTeam: Team & { players: Player[] };
  matchId: string;
  ralliesKey: readonly unknown[];
  endDialogOpen: boolean;
  onEndRally: () => void;
  /** Fired after a rally-ending play commits — page schedules the 1s grace. */
  onAutoCloseRequest?: () => void;
  /** Reads video.currentTime at commit time. */
  getVideoTime: () => number;
};

export function ActiveRallyDrawer({
  rally,
  homeTeam,
  awayTeam,
  matchId,
  ralliesKey,
  endDialogOpen,
  onEndRally,
  onAutoCloseRequest,
  getVideoTime,
}: Props) {
  const queryClient = useQueryClient();

  const [side, setSide] = useState<"home" | "away" | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PlayAction | null>(null);
  const [pulseTeam, setPulseTeam] = useState<Side | null>(null);
  // One-shot "skip player" flag set by the ? hotkey. While true, action buttons
  // bypass the playerId requirement and the next commit sends player_id=null.
  // Resets after commit or rally change.
  const [unattributedNext, setUnattributedNext] = useState(false);
  const partialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPlaysCountRef = useRef(rally.plays.length);

  const activeRoster =
    side === "home" ? homeTeam.players : side === "away" ? awayTeam.players : [];

  const playsSorted: PlaySnapshot[] = [...rally.plays]
    .sort((a, b) => a.sequence - b.sequence)
    .map((p) => ({
      action: p.action,
      result: p.result,
      team: p.team === "home" || p.team === "away" ? p.team : null,
    }));
  const constraints = getActionConstraints(playsSorted);

  // Reset player when team flips, clear pending whenever rally changes.
  useEffect(() => {
    setPlayerId(null);
  }, [side]);
  useEffect(() => {
    setPendingAction(null);
    setSide(null);
    setPlayerId(null);
    setUnattributedNext(false);
  }, [rally.id]);

  // Auto-flip team toggle when a play just committed and the engine expects
  // a different side next (FIX 1). H/A hotkeys still override; we only fire
  // on commit (plays-count increased), so manual overrides aren't undone.
  useEffect(() => {
    const justCommitted = rally.plays.length > prevPlaysCountRef.current;
    prevPlaysCountRef.current = rally.plays.length;
    if (!justCommitted) return;
    const want = constraints.expectedTeam;
    if (want && want !== side) {
      setSide(want);
      setPulseTeam(want);
      setTimeout(() => setPulseTeam(null), 300);
    }
    // side intentionally omitted: we react to commits, not to manual flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rally.plays.length, constraints.expectedTeam]);

  // Manage the 10s partial-state timeout.
  useEffect(() => {
    if (partialTimerRef.current) clearTimeout(partialTimerRef.current);
    if (pendingAction === null) return;
    partialTimerRef.current = setTimeout(() => {
      setPendingAction(null);
    }, PARTIAL_TIMEOUT_MS);
    return () => {
      if (partialTimerRef.current) clearTimeout(partialTimerRef.current);
    };
  }, [pendingAction]);

  const createPlayMut = useMutation({
    mutationFn: async (vars: {
      action: PlayAction;
      result: PlayResult;
      team: "home" | "away" | null;
      player_id: string | null;
      sequence: number;
      play_time_seconds: number;
    }) => {
      const { data, error, response } = await api.POST(
        "/rallies/{rally_id}/plays",
        {
          params: { path: { rally_id: rally.id } },
          body: {
            action: vars.action,
            result: vars.result,
            team: vars.team,
            player_id: vars.player_id,
            sequence: vars.sequence,
            play_time_seconds: vars.play_time_seconds,
          },
        },
      );
      if (error) {
        showApiError(response.status, error);
        throw new Error("create play failed");
      }
      return data!;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ralliesKey });
      const prev = queryClient.getQueryData<Rally[]>(ralliesKey);
      const tempPlay: Play = {
        id: `temp-${Date.now()}`,
        rally_id: rally.id,
        player_id: vars.player_id,
        action: vars.action,
        result: vars.result,
        sequence: vars.sequence,
        play_time_seconds: vars.play_time_seconds,
        team: vars.team,
        position: null,
        ai_suggested: false,
        ai_confidence: null,
        notes: null,
      };
      queryClient.setQueryData<Rally[]>(
        ralliesKey,
        (prev ?? []).map((r) =>
          r.id === rally.id ? { ...r, plays: [...r.plays, tempPlay] } : r,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ralliesKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ralliesKey });
      queryClient.invalidateQueries({
        queryKey: ["matches", matchId, "stats"],
      });
    },
  });

  const deletePlayMut = useMutation({
    mutationFn: async (play_id: string) => {
      const { error, response } = await api.DELETE("/plays/{play_id}", {
        params: { path: { play_id } },
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("delete play failed");
      }
    },
    onMutate: async (play_id) => {
      await queryClient.cancelQueries({ queryKey: ralliesKey });
      const prev = queryClient.getQueryData<Rally[]>(ralliesKey);
      queryClient.setQueryData<Rally[]>(
        ralliesKey,
        (prev ?? []).map((r) =>
          r.id === rally.id
            ? { ...r, plays: r.plays.filter((p) => p.id !== play_id) }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ralliesKey, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ralliesKey });
      queryClient.invalidateQueries({
        queryKey: ["matches", matchId, "stats"],
      });
    },
  });

  function commit(result: PlayResult, action: PlayAction) {
    const priorPlaysCount = rally.plays.length;
    const sequence =
      priorPlaysCount > 0
        ? Math.max(...rally.plays.map((p) => p.sequence)) + 1
        : 1;
    createPlayMut.mutate({
      action,
      result,
      team: side,
      player_id: unattributedNext ? null : playerId,
      sequence,
      play_time_seconds: getVideoTime(),
    });
    setPendingAction(null);
    setUnattributedNext(false);

    // Auto-close grace (Phase C). Skip when this is the first play of the
    // rally — Refinement 1: a rally-ending key combo on play 1 is almost
    // always a misfire (e.g., F-S before the serve was tagged).
    if (priorPlaysCount > 0 && isRallyEndingPlay(action, result)) {
      onAutoCloseRequest?.();
    }
  }

  // Drawer-scoped hotkeys: H/A team, 1-9 player, Q/W/E/F/T/Y/U action,
  // S/X/C result. Bails out for inputs and while end-rally dialog is open.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (endDialogOpen) return;
      const k = e.key.toLowerCase();

      // ? toggles "next play is unattributed" — bypasses the playerId
      // requirement on action buttons and forces player_id=null on commit.
      // Match by key char (`?`) and by shift+slash to be portable across
      // browser keyboard-layout normalizations.
      if (e.key === "?" || (e.shiftKey && e.code === "Slash")) {
        e.preventDefault();
        setUnattributedNext((v) => !v);
        return;
      }

      if (k === "h") {
        e.preventDefault();
        setSide("home");
        return;
      }
      if (k === "a") {
        e.preventDefault();
        setSide("away");
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const idx = Number(k) - 1;
        if (side && activeRoster[idx]) {
          e.preventDefault();
          setPlayerId(activeRoster[idx].id);
        }
        return;
      }
      const maybeAction = ACTION_KEY_MAP.get(k);
      if (maybeAction) {
        e.preventDefault();
        // Block hotkey staging for actions ruled out by the constraint engine.
        if (!constraints.allowedActions.has(maybeAction)) return;
        setPendingAction(maybeAction);
        return;
      }
      const maybeResult = RESULT_KEY_MAP.get(k);
      if (maybeResult && pendingAction) {
        e.preventDefault();
        commit(maybeResult, pendingAction);
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    side,
    playerId,
    pendingAction,
    rally.id,
    rally.plays.length,
    endDialogOpen,
    activeRoster,
    constraints.allowedActions,
    unattributedNext,
  ]);

  return (
    <Card className="border-primary">
      <CardContent className="space-y-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">
            Active rally — start at{" "}
            <span className="font-mono">
              {formatTimecode(rally.start_time)}
            </span>
          </span>
          <Button onClick={onEndRally} size="sm">
            End Rally (R)
          </Button>
        </div>

        {/* Team toggle — auto-flip pulses for 300ms; expected team also gets
            a faint static halo when not yet selected. */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={side === "home" ? "default" : "outline"}
            size="sm"
            onClick={() => setSide("home")}
            className={cn(
              "transition-shadow duration-300",
              pulseTeam === "home" && "ring-4 ring-primary",
              constraints.expectedTeam === "home" &&
                side !== "home" &&
                pulseTeam !== "home" &&
                "ring-2 ring-primary/40",
            )}
          >
            {homeTeam.name}{" "}
            <kbd className="ml-1 text-[10px] opacity-70">H</kbd>
          </Button>
          <Button
            variant={side === "away" ? "default" : "outline"}
            size="sm"
            onClick={() => setSide("away")}
            className={cn(
              "transition-shadow duration-300",
              pulseTeam === "away" && "ring-4 ring-primary",
              constraints.expectedTeam === "away" &&
                side !== "away" &&
                pulseTeam !== "away" &&
                "ring-2 ring-primary/40",
            )}
          >
            {awayTeam.name}{" "}
            <kbd className="ml-1 text-[10px] opacity-70">A</kbd>
          </Button>
        </div>

        {/* Player picker */}
        {side ? (
          <div className="flex flex-wrap gap-1">
            {activeRoster.map((p, i) => (
              <Button
                key={p.id}
                variant={playerId === p.id ? "default" : "outline"}
                size="xs"
                onClick={() => setPlayerId(p.id)}
              >
                <span className="font-mono">#{p.jersey_number}</span> {p.name}
                {i < 9 && (
                  <kbd className="ml-1 text-[10px] opacity-70">{i + 1}</kbd>
                )}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Press H or A to pick a team.
          </p>
        )}

        {/* Unattributed-mode banner — set by ? hotkey; one-shot until commit. */}
        {unattributedNext && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-yellow-400/60 bg-yellow-50 dark:border-yellow-700/60 dark:bg-yellow-950/30 px-3 py-2 text-xs">
            <span>
              <span className="font-semibold">Unattributed</span> — next commit
              skips the player. Press <kbd className="px-1 py-0.5 rounded bg-background border text-[10px]">?</kbd> again to cancel.
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setUnattributedNext(false)}
              aria-label="Cancel unattributed mode"
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {/* Action grid — color-coded; row 1 offensive (Q W E F), row 2 defensive (T Y U). */}
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2">
            {ACTIONS_ROW_1.map((a) => (
              <ActionBtn
                key={a.action}
                a={a}
                disabled={
                  !side ||
                  (!playerId && !unattributedNext) ||
                  !constraints.allowedActions.has(a.action)
                }
                allowed={constraints.allowedActions.has(a.action)}
                staged={pendingAction === a.action}
                reason={constraints.reason}
                onPick={() => setPendingAction(a.action)}
              />
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {ACTIONS_ROW_2.map((a) => (
              <ActionBtn
                key={a.action}
                a={a}
                disabled={
                  !side ||
                  (!playerId && !unattributedNext) ||
                  !constraints.allowedActions.has(a.action)
                }
                allowed={constraints.allowedActions.has(a.action)}
                staged={pendingAction === a.action}
                reason={constraints.reason}
                onPick={() => setPendingAction(a.action)}
              />
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {constraints.reason}
        </p>

        {/* Staged indicator — only when an action is picked and waiting on result. */}
        {pendingAction && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300/60 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/30 px-3 py-2 text-xs">
            <span>
              Staged:{" "}
              <span className="font-semibold">{pendingAction}</span> by{" "}
              {(() => {
                if (unattributedNext) return "(unattributed)";
                const player = activeRoster.find((p) => p.id === playerId);
                return player
                  ? `#${player.jersey_number} ${player.name}`
                  : "(no player)";
              })()}{" "}
              ({side ?? "—"}) — pick result
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setPendingAction(null)}
              aria-label="Clear staged action"
            >
              <X className="size-3" />
            </Button>
          </div>
        )}

        {/* Result row — full-width 3-col, lit up only when an action is staged. */}
        <div className="grid grid-cols-3 gap-2">
          {RESULTS.map((r) => {
            const disabled = !pendingAction;
            return (
              <button
                type="button"
                key={r.result}
                onClick={() =>
                  pendingAction && commit(r.result, pendingAction)
                }
                disabled={disabled}
                className={cn(
                  "relative h-12 rounded-md text-sm font-semibold transition-all",
                  disabled
                    ? "cursor-not-allowed bg-muted text-muted-foreground/60"
                    : `${r.bg} text-white hover:-translate-y-0.5 hover:shadow-md animate-pulse`,
                )}
              >
                {r.label}
                <span className="absolute top-1 right-1 rounded bg-black/25 px-1 font-mono text-[10px] tracking-wide text-white">
                  {r.key}
                </span>
              </button>
            );
          })}
        </div>

        {/* Plays in rally */}
        {rally.plays.length > 0 && (
          <div className="border-t pt-2 space-y-1">
            <p className="text-xs text-muted-foreground">
              Plays in this rally
            </p>
            <ul className="space-y-1">
              {[...rally.plays]
                .sort((a, b) => a.sequence - b.sequence)
                .map((p) => {
                  const player =
                    [...homeTeam.players, ...awayTeam.players].find(
                      (x) => x.id === p.player_id,
                    ) ?? null;
                  const unattributed = p.player_id === null;
                  return (
                    <li
                      key={p.id}
                      title={
                        unattributed ? "Needs attribution" : undefined
                      }
                      className={cn(
                        "flex items-center gap-2 text-xs px-1 rounded",
                        unattributed &&
                          "border-l-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20",
                      )}
                    >
                      <span className="text-muted-foreground tabular-nums w-5">
                        {p.sequence}
                      </span>
                      <span className="flex-1">
                        {player ? (
                          <>
                            <span className="font-mono">
                              #{player.jersey_number}
                            </span>{" "}
                            {player.name}
                          </>
                        ) : (
                          <span className="text-yellow-700 dark:text-yellow-300 font-medium">
                            needs attribution
                          </span>
                        )}{" "}
                        — {p.action} {p.result}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => deletePlayMut.mutate(p.id)}
                        aria-label="Delete play"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionBtn({
  a,
  disabled,
  allowed,
  staged,
  reason,
  onPick,
}: {
  a: { key: string; action: PlayAction; label: string };
  disabled: boolean;
  allowed: boolean;
  staged: boolean;
  reason: string;
  onPick: () => void;
}) {
  const style = ACTION_STYLES[a.action];
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      title={!allowed ? reason : undefined}
      className={cn(
        "relative h-12 rounded-md text-sm font-semibold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        disabled
          ? cn("cursor-not-allowed", style.disabled)
          : cn(style.enabled, "hover:-translate-y-0.5 hover:shadow-md"),
        staged && cn("ring-2 ring-offset-2 animate-pulse", style.ring),
      )}
    >
      {a.label}
      <span
        className={cn(
          "absolute top-1 right-1 rounded px-1 font-mono text-[10px] tracking-wide",
          disabled ? "bg-foreground/10 text-foreground/60" : "bg-black/25 text-white",
        )}
      >
        {a.key}
      </span>
    </button>
  );
}
