"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";
import { readVideoDuration, uploadToR2 } from "@/lib/upload";

const TIER_UNSET = "_unset_";
type Phase = "idle" | "presigning" | "uploading" | "creating";

export default function NewMatchPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <NewMatchPageInner />
    </Suspense>
  );
}

function NewMatchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const querySeasonId = searchParams.get("seasonId") ?? "";

  const [seasonId, setSeasonId] = useState(querySeasonId);
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [playedAt, setPlayedAt] = useState(() => defaultPlayedAt());
  const [tier, setTier] = useState<string>(TIER_UNSET);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);

  const { data: seasons } = useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await api.GET("/seasons");
      if (error) throw new Error("Failed to load seasons");
      return data!;
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["seasons", seasonId, "teams"],
    queryFn: async () => {
      const { data, error } = await api.GET("/seasons/{season_id}/teams", {
        params: { path: { season_id: seasonId } },
      });
      if (error) throw new Error("Failed to load teams");
      return data!;
    },
    enabled: Boolean(seasonId),
  });

  // Reset team selections if the season changes.
  useEffect(() => {
    setHomeTeamId("");
    setAwayTeamId("");
  }, [seasonId]);

  const awayTeams = useMemo(
    () => (teams ?? []).filter((t) => t.id !== homeTeamId),
    [teams, homeTeamId],
  );

  const canSubmit =
    phase === "idle" &&
    seasonId &&
    homeTeamId &&
    awayTeamId &&
    homeTeamId !== awayTeamId &&
    playedAt &&
    file !== null;

  async function submit() {
    if (!file) {
      toast.error("Pick an MP4 file first.");
      return;
    }
    if (file.type !== "video/mp4") {
      toast.error("Only MP4 (video/mp4) is supported.");
      return;
    }

    try {
      // 1. Read duration locally (best-effort; null is fine).
      const duration = await readVideoDuration(file);

      // 2. Presign.
      setPhase("presigning");
      const presignResult = await api.POST("/uploads/presign", {
        body: { filename: file.name, content_type: file.type },
      });
      if (presignResult.error) {
        showApiError(presignResult.response.status, presignResult.error);
        setPhase("idle");
        return;
      }
      const { upload_url, key } = presignResult.data!;

      // 3. PUT to R2 with progress.
      setPhase("uploading");
      setProgress(0);
      await uploadToR2(file, upload_url, setProgress);

      // 4. Create the Match + raw VideoAsset.
      setPhase("creating");
      const tierNum = tier === TIER_UNSET ? null : Number(tier);
      const createResult = await api.POST("/matches", {
        body: {
          season_id: seasonId,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          played_at: new Date(playedAt).toISOString(),
          tier: tierNum,
          video_key: key,
          video_duration: duration,
        },
      });
      if (createResult.error) {
        showApiError(createResult.response.status, createResult.error);
        setPhase("idle");
        return;
      }

      toast.success("Match created");
      router.push(`/matches/${createResult.data!.id}`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setPhase("idle");
    }
  }

  const phaseLabel: Record<Phase, string> = {
    idle: "Create Match",
    presigning: "Preparing upload…",
    uploading: `Uploading ${progress.toFixed(0)}%…`,
    creating: "Creating match…",
  };

  return (
    <div className="space-y-6">
      <div>
        {querySeasonId && (
          <Link
            href={`/seasons/${querySeasonId}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Season
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New Match</h1>
      </div>

      <Card>
        <CardContent className="py-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="season">Season</Label>
            <Select value={seasonId} onValueChange={(v) => setSeasonId(v ?? "")}>
              <SelectTrigger id="season">
                <SelectValue placeholder="Pick a season">
                  {(v: string | null) =>
                    v
                      ? (seasons ?? []).find((s) => s.id === v)?.name ?? v
                      : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(seasons ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="home">Home team</Label>
              <Select
                value={homeTeamId}
                onValueChange={(v) => setHomeTeamId(v ?? "")}
                disabled={!seasonId}
              >
                <SelectTrigger id="home">
                  <SelectValue placeholder="Pick home team">
                    {(v: string | null) =>
                      v
                        ? (teams ?? []).find((t) => t.id === v)?.name ?? v
                        : null
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(teams ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="away">Away team</Label>
              <Select
                value={awayTeamId}
                onValueChange={(v) => setAwayTeamId(v ?? "")}
                disabled={!homeTeamId}
              >
                <SelectTrigger id="away">
                  <SelectValue placeholder="Pick away team">
                    {(v: string | null) =>
                      v
                        ? (teams ?? []).find((t) => t.id === v)?.name ?? v
                        : null
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {awayTeams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="played-at">Played at</Label>
              <Input
                id="played-at"
                type="datetime-local"
                value={playedAt}
                onChange={(e) => setPlayedAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tier">Tier</Label>
              <Select
                value={tier}
                onValueChange={(v) => setTier(v ?? TIER_UNSET)}
              >
                <SelectTrigger id="tier">
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

          <div className="space-y-2">
            <Label htmlFor="video">Match video (MP4)</Label>
            <Input
              id="video"
              type="file"
              accept="video/mp4"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-muted-foreground">
                {file.name} — {(file.size / 1_000_000).toFixed(1)} MB
              </p>
            )}
          </div>

          {phase === "uploading" && (
            <div className="h-2 w-full bg-muted rounded">
              <div
                className="h-2 bg-primary rounded transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={submit} disabled={!canSubmit}>
              {phaseLabel[phase]}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function defaultPlayedAt(): string {
  // Round to nearest hour, format as YYYY-MM-DDTHH:MM in LOCAL time
  const d = new Date();
  d.setMinutes(0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
