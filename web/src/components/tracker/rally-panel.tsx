"use client";

import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { components } from "@/lib/api-types";
import { formatTimecode } from "@/lib/format";

export type Rally = components["schemas"]["RallyRead"];

type Props = {
  rallies: Rally[];
  activeRally: Rally | null;
  homeName: string;
  awayName: string;
  onStart: () => void;
  onEnd: () => void;
  onDelete: (rallyId: string) => void;
};

export function RallyPanel({
  rallies,
  activeRally,
  homeName,
  awayName,
  onStart,
  onEnd,
  onDelete,
}: Props) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Rallies</h2>

      {activeRally ? (
        <Card className="border-primary">
          <CardContent className="py-3 flex items-center justify-between">
            <span className="text-sm">
              Active rally — start at{" "}
              <span className="font-mono">
                {formatTimecode(activeRally.start_time)}
              </span>
            </span>
            <Button onClick={onEnd} size="sm">
              End Rally (R)
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={onStart} className="w-full">
          Start Rally (R)
        </Button>
      )}

      {rallies.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No rallies yet.
        </p>
      ) : (
        <ul className="space-y-1 max-h-[420px] overflow-y-auto">
          {rallies.map((r, i) => (
            <li key={r.id}>
              <Card>
                <CardContent className="py-2 flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground tabular-nums w-8">
                    #{i + 1}
                  </span>
                  <span className="font-mono tabular-nums text-xs flex-1">
                    {formatTimecode(r.start_time)}
                    {r.end_time !== null && (
                      <> → {formatTimecode(r.end_time)}</>
                    )}
                  </span>
                  {r.point_won_by ? (
                    <Badge variant="secondary">
                      {r.point_won_by === "home" ? homeName : awayName}
                    </Badge>
                  ) : (
                    <Badge variant="outline">live</Badge>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                    {r.plays.length} {r.plays.length === 1 ? "play" : "plays"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDelete(r.id)}
                    aria-label="Delete rally"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
