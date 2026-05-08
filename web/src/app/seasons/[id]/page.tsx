"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { NewTeamDialog } from "@/components/teams/new-team-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function SeasonPage() {
  const params = useParams<{ id: string }>();
  const seasonId = params.id;

  const { data: season, isLoading } = useQuery({
    queryKey: ["seasons", seasonId],
    queryFn: async () => {
      const { data, error } = await api.GET("/seasons/{season_id}", {
        params: { path: { season_id: seasonId } },
      });
      if (error) throw new Error("Failed to load season");
      return data!;
    },
  });

  const { data: matches } = useQuery({
    queryKey: ["matches", { season_id: seasonId }],
    queryFn: async () => {
      const { data, error } = await api.GET("/matches", {
        params: { query: { season_id: seasonId } },
      });
      if (error) throw new Error("Failed to load matches");
      return data!;
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!season) return <p className="text-muted-foreground">Season not found.</p>;

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Seasons
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {season.name}
        </h1>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Teams</h2>
          <NewTeamDialog seasonId={season.id} />
        </div>
        {season.teams.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No teams yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {season.teams.map((team) => (
              <Link key={team.id} href={`/teams/${team.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-4 flex items-center justify-between">
                    <span className="font-medium">{team.name}</span>
                    {team.current_tier !== null && team.current_tier !== undefined && (
                      <Badge variant="secondary">Tier {team.current_tier}</Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Matches</h2>
          <Link href={`/matches/new?seasonId=${seasonId}`}>
            <Button>New Match</Button>
          </Link>
        </div>
        {!matches || matches.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No matches yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {matches.map((m) => (
              <Link key={m.id} href={`/matches/${m.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.home_team.name}</span>
                      <span className="text-muted-foreground">vs</span>
                      <span className="font-medium">{m.away_team.name}</span>
                      {m.tier !== null && m.tier !== undefined && (
                        <Badge variant="secondary">Tier {m.tier}</Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(m.played_at).toLocaleDateString()}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
