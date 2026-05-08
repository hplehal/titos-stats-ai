"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PlayerFormDialog } from "@/components/players/player-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";

const TIER_UNSET = "_unset_";

type Team = {
  id: string;
  season_id: string;
  name: string;
  current_tier: number | null;
  players: { id: string; team_id: string; name: string; jersey_number: number }[];
};

export default function TeamPage() {
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const queryClient = useQueryClient();
  const queryKey = ["teams", teamId] as const;

  const { data: team, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Team> => {
      const { data, error } = await api.GET("/teams/{team_id}", {
        params: { path: { team_id: teamId } },
      });
      if (error) throw new Error("Failed to load team");
      return data!;
    },
  });

  const updateTeamMut = useMutation({
    mutationFn: async (patch: {
      name?: string;
      current_tier?: number | null;
    }) => {
      const { data, error, response } = await api.PATCH("/teams/{team_id}", {
        params: { path: { team_id: teamId } },
        body: patch,
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("update failed");
      }
      return data!;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Team>(queryKey);
      if (prev) {
        queryClient.setQueryData<Team>(queryKey, { ...prev, ...patch });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
    onSuccess: () => toast.success("Team updated"),
  });

  const deletePlayerMut = useMutation({
    mutationFn: async (playerId: string) => {
      const { error, response } = await api.DELETE("/players/{player_id}", {
        params: { path: { player_id: playerId } },
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("delete failed");
      }
    },
    onMutate: async (playerId) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<Team>(queryKey);
      if (prev) {
        queryClient.setQueryData<Team>(queryKey, {
          ...prev,
          players: prev.players.filter((p) => p.id !== playerId),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
    onSuccess: () => toast.success("Player removed"),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!team) return <p className="text-muted-foreground">Team not found.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/seasons/${team.season_id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Season
        </Link>
        <TeamHeader team={team} onPatch={(p) => updateTeamMut.mutate(p)} />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Roster</h2>
          <PlayerFormDialog mode="create" teamId={team.id} />
        </div>

        {team.players.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No players yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.players.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">
                      #{p.jersey_number}
                    </TableCell>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="text-right">
                      <PlayerFormDialog
                        mode="edit"
                        teamId={team.id}
                        player={p}
                        trigger={
                          <Button variant="ghost" size="icon">
                            <Pencil className="size-4" />
                          </Button>
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deletePlayerMut.mutate(p.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>
    </div>
  );
}

function TeamHeader({
  team,
  onPatch,
}: {
  team: Team;
  onPatch: (patch: { name?: string; current_tier?: number | null }) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(team.name);

  // Keep local draft synced if server data changes (e.g., after refetch).
  useEffect(() => {
    setDraftName(team.name);
  }, [team.name]);

  const tierValue =
    team.current_tier === null || team.current_tier === undefined
      ? TIER_UNSET
      : String(team.current_tier);

  function commitName() {
    const next = draftName.trim();
    if (next === team.name || next.length === 0) {
      setDraftName(team.name);
      setEditingName(false);
      return;
    }
    onPatch({ name: next });
    setEditingName(false);
  }

  return (
    <div className="mt-2 space-y-3">
      {editingName ? (
        <Input
          autoFocus
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") {
              setDraftName(team.name);
              setEditingName(false);
            }
          }}
          className="text-2xl font-semibold tracking-tight h-auto"
        />
      ) : (
        <button
          type="button"
          className="text-2xl font-semibold tracking-tight hover:underline decoration-dotted underline-offset-4"
          onClick={() => setEditingName(true)}
        >
          {team.name}
        </button>
      )}

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Current tier</span>
        <Select
          value={tierValue}
          onValueChange={(v) =>
            onPatch({
              current_tier:
                v === null || v === TIER_UNSET ? null : Number(v),
            })
          }
        >
          <SelectTrigger className="w-32">
            <SelectValue>
              {(v: string | null) =>
                !v || v === TIER_UNSET ? "Unset" : `Tier ${v}`
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TIER_UNSET}>Unset</SelectItem>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <SelectItem key={n} value={String(n)}>
                Tier {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
