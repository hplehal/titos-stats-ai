"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { NewTeamDialog } from "@/components/teams/new-team-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { components } from "@/lib/api-types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Match = components["schemas"]["MatchRead"];
type Rally = components["schemas"]["RallyRead"];

type MatchStatus = "finished" | "in_progress" | "ready" | "scheduled";

// Sentinel for matches without a week_number / tier — keeps them visible.
const NO_WEEK = "__no_week__";
const NO_TIER = "__no_tier__";

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

  const { data: matches = [] } = useQuery({
    queryKey: ["matches", { season_id: seasonId }],
    queryFn: async () => {
      const { data, error } = await api.GET("/matches", {
        params: { query: { season_id: seasonId } },
      });
      if (error) throw new Error("Failed to load matches");
      return data!;
    },
  });

  // Parallel rally fetches — one per match. Cheap individually; cached after
  // first load so navigating into the tracker and back is instant.
  const rallyQueries = useQueries({
    queries: matches.map((m) => ({
      queryKey: ["matches", m.id, "rallies"],
      queryFn: async () => {
        const { data, error } = await api.GET("/matches/{match_id}/rallies", {
          params: { path: { match_id: m.id } },
        });
        if (error) throw new Error("rallies");
        return data!;
      },
      staleTime: 60_000,
    })),
  });

  const ralliesByMatch = new Map<string, Rally[]>();
  matches.forEach((m, i) => {
    ralliesByMatch.set(m.id, (rallyQueries[i]?.data as Rally[] | undefined) ?? []);
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!season) return <p className="text-muted-foreground">Season not found.</p>;

  // ── Group matches by week → tier ────────────────────────────────────
  const weekBuckets = new Map<string, Match[]>();
  for (const m of matches) {
    const k = m.week_number == null ? NO_WEEK : String(m.week_number);
    if (!weekBuckets.has(k)) weekBuckets.set(k, []);
    weekBuckets.get(k)!.push(m);
  }

  // Order weeks by max played_at desc — "most recent" expanded by default.
  // NO_WEEK bucket always renders last so legacy matches don't hide the
  // current week.
  const weeks = [...weekBuckets.entries()]
    .map(([key, ms]) => ({
      key,
      ms,
      maxPlayed: Math.max(...ms.map((m) => Date.parse(m.played_at))),
    }))
    .sort((a, b) => {
      if (a.key === NO_WEEK) return 1;
      if (b.key === NO_WEEK) return -1;
      return b.maxPlayed - a.maxPlayed;
    });

  const mostRecentKey = weeks.find((w) => w.key !== NO_WEEK)?.key ?? null;

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

      {/* Teams — collapsed by default since matches are now primary view. */}
      <section>
        <details className="group">
          <summary className="flex items-center justify-between gap-3 cursor-pointer rounded-md border bg-card px-4 py-3 hover:bg-muted/50">
            <span className="font-medium">
              Teams ({season.teams.length})
            </span>
            <span className="flex items-center gap-2">
              <span onClick={(e) => e.preventDefault()}>
                <NewTeamDialog seasonId={season.id} />
              </span>
              <Chevron />
            </span>
          </summary>
          <div className="mt-3 grid gap-2">
            {season.teams.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-muted-foreground">
                  No teams yet.
                </CardContent>
              </Card>
            ) : (
              season.teams.map((team) => (
                <Link key={team.id} href={`/teams/${team.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="py-3 flex items-center justify-between">
                      <span className="font-medium">{team.name}</span>
                      {team.current_tier != null && (
                        <Badge variant="secondary">Tier {team.current_tier}</Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))
            )}
          </div>
        </details>
      </section>

      {/* Matches — grouped by week, then tier. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Matches</h2>
          <Link href={`/matches/new?seasonId=${seasonId}`}>
            <Button>New Match</Button>
          </Link>
        </div>

        {matches.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No matches yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {weeks.map(({ key, ms, maxPlayed }) => (
              <WeekBlock
                key={key}
                weekKey={key}
                matches={ms}
                ralliesByMatch={ralliesByMatch}
                maxPlayed={maxPlayed}
                defaultOpen={key === mostRecentKey}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WeekBlock({
  weekKey,
  matches,
  ralliesByMatch,
  maxPlayed,
  defaultOpen,
}: {
  weekKey: string;
  matches: Match[];
  ralliesByMatch: Map<string, Rally[]>;
  maxPlayed: number;
  defaultOpen: boolean;
}) {
  const label =
    weekKey === NO_WEEK
      ? "Unscheduled (no week set)"
      : `Week ${weekKey}`;
  const dateLabel = Number.isFinite(maxPlayed)
    ? new Date(maxPlayed).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Group within the week by tier ascending; "no tier" last.
  const tierBuckets = new Map<string, Match[]>();
  for (const m of matches) {
    const k = m.tier == null ? NO_TIER : String(m.tier);
    if (!tierBuckets.has(k)) tierBuckets.set(k, []);
    tierBuckets.get(k)!.push(m);
  }
  const tiers = [...tierBuckets.entries()].sort(([a], [b]) => {
    if (a === NO_TIER) return 1;
    if (b === NO_TIER) return -1;
    return Number(a) - Number(b);
  });

  return (
    <details
      key={weekKey}
      open={defaultOpen}
      className="group rounded-md border bg-card"
    >
      <summary className="flex items-center justify-between cursor-pointer px-4 py-3 hover:bg-muted/50">
        <span className="flex items-baseline gap-2">
          <span className="font-medium">{label}</span>
          {dateLabel && (
            <span className="text-sm text-muted-foreground">· {dateLabel}</span>
          )}
          <span className="text-xs text-muted-foreground">
            ({matches.length} {matches.length === 1 ? "match" : "matches"})
          </span>
        </span>
        <Chevron />
      </summary>
      <div className="px-4 pb-4 space-y-5">
        {tiers.map(([tierKey, tierMatches]) => (
          <TierGroup
            key={tierKey}
            tierKey={tierKey}
            matches={tierMatches}
            ralliesByMatch={ralliesByMatch}
          />
        ))}
      </div>
    </details>
  );
}

function TierGroup({
  tierKey,
  matches,
  ralliesByMatch,
}: {
  tierKey: string;
  matches: Match[];
  ralliesByMatch: Map<string, Rally[]>;
}) {
  // Distinct non-null courts in this tier — joined when there are multiple.
  const courts = [
    ...new Set(matches.map((m) => m.court).filter((c): c is string => !!c)),
  ];
  const courtLabel =
    courts.length === 0 ? "" : courts.length === 1 ? courts[0] : courts.join(" / ");

  const tierLabel = tierKey === NO_TIER ? "No tier" : `Tier ${tierKey}`;

  // Set N labeling: within this tier, group by unordered team pair, then
  // by ascending played_at — first match of a pair is Set 1, second is Set 2.
  const sorted = [...matches].sort(
    (a, b) => Date.parse(a.played_at) - Date.parse(b.played_at),
  );
  const pairCount = new Map<string, number>();
  const pairTotal = new Map<string, number>();
  for (const m of sorted) {
    const k = pairKey(m);
    pairTotal.set(k, (pairTotal.get(k) ?? 0) + 1);
  }
  const setIndexByMatch = new Map<string, number>();
  for (const m of sorted) {
    const k = pairKey(m);
    const next = (pairCount.get(k) ?? 0) + 1;
    pairCount.set(k, next);
    setIndexByMatch.set(m.id, next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {tierLabel}
        </h3>
        {courtLabel && (
          <span className="text-xs text-muted-foreground">· {courtLabel}</span>
        )}
      </div>
      <div className="grid gap-1.5">
        {sorted.map((m) => {
          const rallies = ralliesByMatch.get(m.id) ?? [];
          const total = pairTotal.get(pairKey(m)) ?? 1;
          const setIndex = setIndexByMatch.get(m.id);
          return (
            <MatchRow
              key={m.id}
              match={m}
              rallies={rallies}
              setLabel={total > 1 && setIndex ? `Set ${setIndex}` : null}
            />
          );
        })}
      </div>
    </div>
  );
}

function MatchRow({
  match,
  rallies,
  setLabel,
}: {
  match: Match;
  rallies: Rally[];
  setLabel: string | null;
}) {
  const status = computeStatus(match, rallies);
  const home = rallies.filter((r) => r.point_won_by === "home").length;
  const away = rallies.filter((r) => r.point_won_by === "away").length;
  const showScore = rallies.length > 0;

  return (
    <Link href={`/matches/${match.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardContent className="py-2.5 px-3 flex items-center gap-3">
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{match.home_team.name}</span>
            {showScore ? (
              <span className="font-mono tabular-nums text-sm">
                {home} – {away}
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">vs</span>
            )}
            <span className="font-medium truncate">{match.away_team.name}</span>
            {setLabel && (
              <span className="text-xs text-muted-foreground">· {setLabel}</span>
            )}
          </div>
          <StatusPill status={status} />
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusPill({ status }: { status: MatchStatus }) {
  const config: Record<MatchStatus, { label: string; cls: string }> = {
    finished: {
      label: "finished",
      cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 border-emerald-300/60",
    },
    in_progress: {
      label: "in progress",
      cls: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border-amber-300/60",
    },
    ready: {
      label: "ready to track",
      cls: "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 border-blue-300/60",
    },
    scheduled: {
      label: "scheduled",
      cls: "bg-muted text-muted-foreground border-border",
    },
  };
  const { label, cls } = config[status];
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 0 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function pairKey(m: Match): string {
  return [m.home_team.id, m.away_team.id].sort().join("|");
}

function computeStatus(match: Match, rallies: Rally[]): MatchStatus {
  if (rallies.length > 0) {
    if (rallies.every((r) => r.point_won_by !== null)) return "finished";
    return "in_progress";
  }
  if (match.video_assets.length > 0) return "ready";
  return "scheduled";
}
