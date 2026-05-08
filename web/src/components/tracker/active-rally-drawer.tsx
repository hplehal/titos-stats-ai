"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { components } from "@/lib/api-types";
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";
import { formatTimecode } from "@/lib/format";

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

const RESULTS: { key: string; result: PlayResult; label: string }[] = [
  { key: "S", result: "SUCCESS", label: "Success" },
  { key: "X", result: "ERROR", label: "Error" },
  { key: "C", result: "CONTINUED", label: "Continued" },
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
};

export function ActiveRallyDrawer({
  rally,
  homeTeam,
  awayTeam,
  matchId,
  ralliesKey,
  endDialogOpen,
  onEndRally,
}: Props) {
  const queryClient = useQueryClient();

  const [side, setSide] = useState<"home" | "away" | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PlayAction | null>(null);
  const partialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeRoster =
    side === "home" ? homeTeam.players : side === "away" ? awayTeam.players : [];

  // Reset player when team flips, clear pending whenever rally changes.
  useEffect(() => {
    setPlayerId(null);
  }, [side]);
  useEffect(() => {
    setPendingAction(null);
    setSide(null);
    setPlayerId(null);
  }, [rally.id]);

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
    const sequence =
      rally.plays.length > 0
        ? Math.max(...rally.plays.map((p) => p.sequence)) + 1
        : 1;
    createPlayMut.mutate({
      action,
      result,
      team: side,
      player_id: playerId,
      sequence,
    });
    setPendingAction(null);
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

        {/* Team toggle */}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={side === "home" ? "default" : "outline"}
            size="sm"
            onClick={() => setSide("home")}
          >
            {homeTeam.name}{" "}
            <kbd className="ml-1 text-[10px] opacity-70">H</kbd>
          </Button>
          <Button
            variant={side === "away" ? "default" : "outline"}
            size="sm"
            onClick={() => setSide("away")}
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

        {/* Action row */}
        <div className="grid grid-cols-7 gap-1">
          {ACTIONS.map((a) => (
            <Button
              key={a.action}
              variant={pendingAction === a.action ? "default" : "outline"}
              size="xs"
              onClick={() => setPendingAction(a.action)}
              disabled={!side || !playerId}
            >
              <span className="flex flex-col items-center leading-tight">
                <span>{a.label}</span>
                <kbd className="text-[10px] opacity-70">{a.key}</kbd>
              </span>
            </Button>
          ))}
        </div>

        {/* Result row */}
        <div className="grid grid-cols-3 gap-1">
          {RESULTS.map((r) => (
            <Button
              key={r.result}
              variant="outline"
              size="xs"
              onClick={() => pendingAction && commit(r.result, pendingAction)}
              disabled={!pendingAction}
            >
              <span className="flex flex-col items-center leading-tight">
                <span>{r.label}</span>
                <kbd className="text-[10px] opacity-70">{r.key}</kbd>
              </span>
            </Button>
          ))}
        </div>

        {pendingAction && (
          <p className="text-xs text-muted-foreground">
            <Badge variant="secondary" className="mr-1.5">
              {pendingAction}
            </Badge>
            staged — press S / X / C to commit (or pick another action). Clears
            after 10s of idle.
          </p>
        )}

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
                  return (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 text-xs"
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
                          <span className="text-muted-foreground">
                            (no player)
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
