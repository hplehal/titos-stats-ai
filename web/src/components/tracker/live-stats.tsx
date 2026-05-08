"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

type Props = { matchId: string };

export function LiveStats({ matchId }: Props) {
  const [open, setOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["matches", matchId, "stats"],
    queryFn: async () => {
      const { data, error } = await api.GET("/matches/{match_id}/stats", {
        params: { path: { match_id: matchId } },
      });
      if (error) throw new Error("Failed to load stats");
      return data!;
    },
  });

  if (!stats) return null;

  const topKills = [...stats.players]
    .filter((p) => p.kills > 0)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 5);
  const topDigs = [...stats.players]
    .filter((p) => p.digs > 0)
    .sort((a, b) => b.digs - a.digs)
    .slice(0, 5);

  return (
    <Card>
      <CardContent className="py-3 space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-between"
          onClick={() => setOpen((v) => !v)}
        >
          <span>Live stats</span>
          {open ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
        {open && (
          <div className="space-y-3">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-left">Team</th>
                  <th>Pts</th>
                  <th>K</th>
                  <th>E</th>
                  <th>Aces</th>
                  <th>SE</th>
                  <th>B</th>
                  <th>D</th>
                  <th>RE</th>
                  <th>A</th>
                </tr>
              </thead>
              <tbody>
                {[stats.home, stats.away].map((t) => (
                  <tr key={t.side} className="tabular-nums">
                    <td className="text-left font-medium">{t.name}</td>
                    <td className="text-center">{t.score}</td>
                    <td className="text-center">{t.kills}</td>
                    <td className="text-center">{t.attack_errors}</td>
                    <td className="text-center">{t.aces}</td>
                    <td className="text-center">{t.service_errors}</td>
                    <td className="text-center">{t.blocks}</td>
                    <td className="text-center">{t.digs}</td>
                    <td className="text-center">{t.reception_errors}</td>
                    <td className="text-center">{t.assists}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground mb-1">Top kills</p>
                {topKills.length === 0 ? (
                  <p className="text-muted-foreground italic">—</p>
                ) : (
                  <ul>
                    {topKills.map((p) => (
                      <li key={p.player_id} className="tabular-nums">
                        #{p.jersey_number} {p.name}{" "}
                        <span className="text-muted-foreground">
                          ({p.kills})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Top digs</p>
                {topDigs.length === 0 ? (
                  <p className="text-muted-foreground italic">—</p>
                ) : (
                  <ul>
                    {topDigs.map((p) => (
                      <li key={p.player_id} className="tabular-nums">
                        #{p.jersey_number} {p.name}{" "}
                        <span className="text-muted-foreground">
                          ({p.digs})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
