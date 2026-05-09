"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/lib/api-types";
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";

type Rally = components["schemas"]["RallyRead"];
type Play = components["schemas"]["PlayRead"];
type Player = components["schemas"]["PlayerRead"];

export type UnattributedRow = {
  rallyId: string;
  rallyNumber: number;
  play: Play;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  rows: UnattributedRow[];
  homePlayers: Player[];
  awayPlayers: Player[];
};

export function ResolveAttributionDialog({
  open,
  onOpenChange,
  matchId,
  rows,
  homePlayers,
  awayPlayers,
}: Props) {
  const queryClient = useQueryClient();
  // play_id → chosen player_id (or unset)
  const [picks, setPicks] = useState<Record<string, string | undefined>>({});

  const mut = useMutation({
    mutationFn: async (assignments: { play_id: string; player_id: string }[]) => {
      // Run patches in parallel; failures bubble up to onError so user can retry.
      const out = await Promise.allSettled(
        assignments.map(({ play_id, player_id }) =>
          api.PATCH("/plays/{play_id}", {
            params: { path: { play_id } },
            body: { player_id },
          }),
        ),
      );
      const failed: string[] = [];
      for (let i = 0; i < out.length; i++) {
        const r = out[i];
        if (r.status === "rejected" || (r.value && r.value.error)) {
          failed.push(assignments[i].play_id);
          if (r.status === "fulfilled" && r.value.error) {
            showApiError(r.value.response.status, r.value.error);
          }
        }
      }
      if (failed.length) {
        throw new Error(`${failed.length} attribution(s) failed`);
      }
    },
    onSuccess: () => {
      toast(
        `Attributed ${
          Object.values(picks).filter(Boolean).length
        } play(s)`,
      );
      setPicks({});
      onOpenChange(false);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["matches", matchId, "rallies"],
      });
      queryClient.invalidateQueries({
        queryKey: ["matches", matchId, "stats"],
      });
    },
  });

  function handleSave() {
    const assignments = Object.entries(picks)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([play_id, player_id]) => ({ play_id, player_id }));
    if (assignments.length === 0) {
      toast("Pick at least one player to assign.");
      return;
    }
    mut.mutate(assignments);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" initialFocus={false}>
        <DialogHeader>
          <DialogTitle>Resolve unattributed plays</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              All plays are already attributed.
            </p>
          ) : (
            rows.map(({ rallyId, rallyNumber, play }) => {
              const roster =
                play.team === "home"
                  ? homePlayers
                  : play.team === "away"
                    ? awayPlayers
                    : [...homePlayers, ...awayPlayers];
              return (
                <div
                  key={play.id}
                  data-rally-id={rallyId}
                  className="rounded-md border bg-card p-3 text-sm space-y-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">
                      R{rallyNumber} · seq {play.sequence}
                    </Badge>
                    <span className="font-mono text-xs">
                      {play.action}+{play.result}
                    </span>
                    <span className="text-xs text-muted-foreground uppercase">
                      {play.team ?? "—"}
                    </span>
                  </div>
                  <Select
                    value={picks[play.id] ?? ""}
                    onValueChange={(v) =>
                      setPicks((prev) => ({ ...prev, [play.id]: v || undefined }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pick player">
                        {(v: string | null) => {
                          const player =
                            v && roster.find((p) => p.id === v);
                          return player
                            ? `#${player.jersey_number} ${player.name}`
                            : "Pick player";
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {roster
                        .slice()
                        .sort((a, b) => a.jersey_number - b.jersey_number)
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            #{p.jersey_number} {p.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={mut.isPending || rows.length === 0}>
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper: walk rallies (sorted by start_time) and return one row per
// unattributed play. Used by the summary page to seed the dialog.
export function buildUnattributedRows(
  rallies: Rally[],
): UnattributedRow[] {
  const sorted = [...rallies].sort((a, b) => a.start_time - b.start_time);
  const rows: UnattributedRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rally = sorted[i];
    const rallyNumber = i + 1;
    for (const play of [...rally.plays].sort(
      (a, b) => a.sequence - b.sequence,
    )) {
      if (play.player_id === null) {
        rows.push({ rallyId: rally.id, rallyNumber, play });
      }
    }
  }
  return rows;
}
