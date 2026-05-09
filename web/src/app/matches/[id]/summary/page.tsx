"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { components } from "@/lib/api-types";
import { api } from "@/lib/api";

type PlayerStats = components["schemas"]["PlayerStats"];
type TeamStats = components["schemas"]["TeamStats"];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function MatchSummaryPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const { data: match, isLoading: matchLoading } = useQuery({
    queryKey: ["matches", matchId],
    queryFn: async () => {
      const { data, error } = await api.GET("/matches/{match_id}", {
        params: { path: { match_id: matchId } },
      });
      if (error) throw new Error("Failed to load match");
      return data!;
    },
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["matches", matchId, "stats"],
    queryFn: async () => {
      const { data, error } = await api.GET("/matches/{match_id}/stats", {
        params: { path: { match_id: matchId } },
      });
      if (error) throw new Error("Failed to load stats");
      return data!;
    },
  });

  if (matchLoading || statsLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!match || !stats) {
    return <p className="text-muted-foreground">Match not found.</p>;
  }

  const playedDate = new Date(match.played_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const homePlayers = stats.players
    .filter((p) => p.team === "home")
    .sort((a, b) => a.jersey_number - b.jersey_number);
  const awayPlayers = stats.players
    .filter((p) => p.team === "away")
    .sort((a, b) => a.jersey_number - b.jersey_number);

  const exportHref = `${API_BASE}/matches/${matchId}/export.zip`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href={`/matches/${matchId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Tracker
        </Link>
        <a
          href={exportHref}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-4" />
          Export CSV
        </a>
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">
          {match.home_team.name}{" "}
          <span className="text-muted-foreground font-normal">vs</span>{" "}
          {match.away_team.name}
        </h1>
        <span className="text-2xl font-mono tabular-nums">
          {stats.home.score} – {stats.away.score}
        </span>
        <span className="text-sm text-muted-foreground">{playedDate}</span>
        {match.tier !== null && match.tier !== undefined && (
          <Badge variant="secondary">Tier {match.tier}</Badge>
        )}
      </div>

      <Card>
        <CardContent className="py-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TeamHeaderCells />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TeamRow team={stats.home} />
              <TeamRow team={stats.away} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PlayerTable
        title={match.home_team.name}
        players={homePlayers}
        empty="No plays recorded for this team."
      />
      <PlayerTable
        title={match.away_team.name}
        players={awayPlayers}
        empty="No plays recorded for this team."
      />
    </div>
  );
}

function TeamHeaderCells() {
  return (
    <>
      <TableHead className="text-center">Pts</TableHead>
      <TableHead className="text-center">K</TableHead>
      <TableHead className="text-center">E</TableHead>
      <TableHead className="text-center">Aces</TableHead>
      <TableHead className="text-center">SE</TableHead>
      <TableHead className="text-center">B</TableHead>
      <TableHead className="text-center">D</TableHead>
      <TableHead className="text-center">RE</TableHead>
    </>
  );
}

function TeamRow({ team }: { team: TeamStats }) {
  // Team "Pts" mirrors player points definition: K + Aces + Blocks.
  const points = team.kills + team.aces + team.blocks;
  return (
    <TableRow className="tabular-nums">
      <TableCell className="font-medium">{team.name}</TableCell>
      <TableCell className="text-center">{points}</TableCell>
      <TableCell className="text-center">{team.kills}</TableCell>
      <TableCell className="text-center">{team.attack_errors}</TableCell>
      <TableCell className="text-center">{team.aces}</TableCell>
      <TableCell className="text-center">{team.service_errors}</TableCell>
      <TableCell className="text-center">{team.blocks}</TableCell>
      <TableCell className="text-center">{team.digs}</TableCell>
      <TableCell className="text-center">{team.reception_errors}</TableCell>
    </TableRow>
  );
}

function PlayerTable({
  title,
  players,
  empty,
}: {
  title: string;
  players: PlayerStats[];
  empty: string;
}) {
  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {players.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">Pts</TableHead>
                <TableHead className="text-center">K</TableHead>
                <TableHead className="text-center">E</TableHead>
                <TableHead className="text-center">Aces</TableHead>
                <TableHead className="text-center">SE</TableHead>
                <TableHead className="text-center">B</TableHead>
                <TableHead className="text-center">D</TableHead>
                <TableHead className="text-center">RE</TableHead>
                <TableHead className="text-center">A</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((p) => (
                <TableRow key={p.player_id} className="tabular-nums">
                  <TableCell className="font-mono">{p.jersey_number}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="text-center">{p.points}</TableCell>
                  <TableCell className="text-center">{p.kills}</TableCell>
                  <TableCell className="text-center">{p.attack_errors}</TableCell>
                  <TableCell className="text-center">{p.aces}</TableCell>
                  <TableCell className="text-center">{p.service_errors}</TableCell>
                  <TableCell className="text-center">{p.blocks}</TableCell>
                  <TableCell className="text-center">{p.digs}</TableCell>
                  <TableCell className="text-center">{p.reception_errors}</TableCell>
                  <TableCell className="text-center">{p.assists}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
