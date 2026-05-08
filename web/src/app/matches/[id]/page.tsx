"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { EndRallyDialog } from "@/components/tracker/end-rally-dialog";
import { HotkeyBar } from "@/components/tracker/hotkey-bar";
import { type Rally, RallyPanel } from "@/components/tracker/rally-panel";
import {
  VideoPlayer,
  type VideoPlayerHandle,
} from "@/components/tracker/video-player";
import { Badge } from "@/components/ui/badge";
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";

export default function TrackerPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const queryClient = useQueryClient();
  const videoRef = useRef<VideoPlayerHandle>(null);

  const [endDialogOpen, setEndDialogOpen] = useState(false);

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

  const ralliesKey = ["matches", matchId, "rallies"] as const;
  const { data: rallies = [] } = useQuery({
    queryKey: ralliesKey,
    queryFn: async () => {
      const { data, error } = await api.GET("/matches/{match_id}/rallies", {
        params: { path: { match_id: matchId } },
      });
      if (error) throw new Error("Failed to load rallies");
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
    staleTime: 50 * 60 * 1000,
    refetchInterval: 50 * 60 * 1000,
  });

  // Active = first rally with no end_time. Score = count by point_won_by.
  const activeRally = rallies.find((r) => r.end_time === null) ?? null;
  const homeScore = rallies.filter((r) => r.point_won_by === "home").length;
  const awayScore = rallies.filter((r) => r.point_won_by === "away").length;

  const createRallyMut = useMutation({
    mutationFn: async (start_time: number) => {
      const { data, error, response } = await api.POST(
        "/matches/{match_id}/rallies",
        {
          params: { path: { match_id: matchId } },
          body: { start_time },
        },
      );
      if (error) {
        showApiError(response.status, error);
        throw new Error("create failed");
      }
      return data!;
    },
    onMutate: async (start_time) => {
      await queryClient.cancelQueries({ queryKey: ralliesKey });
      const prev = queryClient.getQueryData<Rally[]>(ralliesKey);
      const temp: Rally = {
        id: `temp-${Date.now()}`,
        match_id: matchId,
        start_time,
        end_time: null,
        point_won_by: null,
        ai_proposed: false,
        ai_confirmed: false,
        plays: [],
      };
      queryClient.setQueryData<Rally[]>(ralliesKey, [...(prev ?? []), temp]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ralliesKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ralliesKey }),
  });

  const endRallyMut = useMutation({
    mutationFn: async (vars: {
      rally_id: string;
      end_time: number;
      point_won_by: "home" | "away";
    }) => {
      const { data, error, response } = await api.PATCH("/rallies/{rally_id}", {
        params: { path: { rally_id: vars.rally_id } },
        body: { end_time: vars.end_time, point_won_by: vars.point_won_by },
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("end failed");
      }
      return data!;
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ralliesKey });
      const prev = queryClient.getQueryData<Rally[]>(ralliesKey);
      queryClient.setQueryData<Rally[]>(
        ralliesKey,
        (prev ?? []).map((r) =>
          r.id === vars.rally_id
            ? { ...r, end_time: vars.end_time, point_won_by: vars.point_won_by }
            : r,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ralliesKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ralliesKey }),
  });

  const deleteRallyMut = useMutation({
    mutationFn: async (rally_id: string) => {
      const { error, response } = await api.DELETE("/rallies/{rally_id}", {
        params: { path: { rally_id } },
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("delete failed");
      }
    },
    onMutate: async (rally_id) => {
      await queryClient.cancelQueries({ queryKey: ralliesKey });
      const prev = queryClient.getQueryData<Rally[]>(ralliesKey);
      queryClient.setQueryData<Rally[]>(
        ralliesKey,
        (prev ?? []).filter((r) => r.id !== rally_id),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(ralliesKey, ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ralliesKey }),
  });

  function handleStartRally() {
    const t = videoRef.current?.getCurrentTime() ?? 0;
    createRallyMut.mutate(t);
  }
  function handleOpenEndDialog() {
    if (!activeRally) return;
    setEndDialogOpen(true);
  }
  function handleEndRallyPick(side: "home" | "away") {
    if (!activeRally) return;
    const t = videoRef.current?.getCurrentTime() ?? activeRally.start_time;
    endRallyMut.mutate({
      rally_id: activeRally.id,
      end_time: Math.max(t, activeRally.start_time),
      point_won_by: side,
    });
    setEndDialogOpen(false);
  }

  // Top-level hotkeys: Space, ←/→, R. Skipped while inputs are focused or
  // the end-rally dialog owns its own H/A handlers.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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

      if (e.code === "Space") {
        e.preventDefault();
        videoRef.current?.togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        videoRef.current?.seekRelative(-2);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        videoRef.current?.seekRelative(2);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        if (activeRally) handleOpenEndDialog();
        else handleStartRally();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // handlers close over activeRally via the lookup at call time,
    // and we only need to re-bind when the active rally (or dialog state) flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRally?.id, endDialogOpen]);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!match) return <p className="text-muted-foreground">Match not found.</p>;

  return (
    <div className="space-y-4">
      <Link
        href={`/seasons/${match.season_id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Season
      </Link>

      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">
          {match.home_team.name}{" "}
          <span className="text-muted-foreground font-normal">vs</span>{" "}
          {match.away_team.name}
        </h1>
        <span className="text-2xl font-mono tabular-nums">
          {homeScore} – {awayScore}
        </span>
        {match.tier !== null && match.tier !== undefined && (
          <Badge variant="secondary">Tier {match.tier}</Badge>
        )}
      </div>

      <div className="grid grid-cols-[3fr_2fr] gap-6 items-start">
        <VideoPlayer ref={videoRef} src={videoUrl ?? null} />
        <RallyPanel
          rallies={rallies}
          activeRally={activeRally}
          homeName={match.home_team.name}
          awayName={match.away_team.name}
          onStart={handleStartRally}
          onEnd={handleOpenEndDialog}
          onDelete={(id) => deleteRallyMut.mutate(id)}
        />
      </div>

      <HotkeyBar />

      <EndRallyDialog
        open={endDialogOpen}
        homeName={match.home_team.name}
        awayName={match.away_team.name}
        onPick={handleEndRallyPick}
        onCancel={() => setEndDialogOpen(false)}
      />
    </div>
  );
}
