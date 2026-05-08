"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const { data: match, isLoading } = useQuery({
    queryKey: ["matches", matchId],
    queryFn: async () => {
      const { data, error } = await api.GET("/matches/{match_id}", {
        params: { path: { match_id: matchId } },
      });
      if (error) throw new Error("Failed to load match");
      return data!;
    },
  });

  const rawVideo = match?.video_assets.find((v) => v.kind === "raw");

  const { data: videoUrl } = useQuery({
    queryKey: ["videos", rawVideo?.id, "url"],
    queryFn: async () => {
      if (!rawVideo) return null;
      const { data, error } = await api.GET("/videos/{video_id}/url", {
        params: { path: { video_id: rawVideo.id } },
      });
      if (error) throw new Error("Failed to load video URL");
      return data!.url;
    },
    enabled: Boolean(rawVideo),
    // Refresh before the 1hr presigned-URL TTL expires, in case the user
    // leaves the tab open while watching.
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!match) return <p className="text-muted-foreground">Match not found.</p>;

  return (
    <div className="space-y-6">
      <Link
        href={`/seasons/${match.season_id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Season
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {match.home_team.name}{" "}
            <span className="text-muted-foreground font-normal">vs</span>{" "}
            {match.away_team.name}
          </h1>
          {match.tier !== null && match.tier !== undefined && (
            <Badge variant="secondary">Tier {match.tier}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {new Date(match.played_at).toLocaleString()}
        </p>
      </div>

      <Card>
        <CardContent className="py-4">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className="w-full rounded aspect-video bg-black"
            />
          ) : (
            <div className="aspect-video bg-muted rounded flex items-center justify-center text-muted-foreground">
              Loading video…
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Tracker UI lands in Session 6.
        </CardContent>
      </Card>
    </div>
  );
}
