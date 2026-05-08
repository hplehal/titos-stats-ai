"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { NewSeasonDialog } from "@/components/seasons/new-season-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function HomePage() {
  const { data: seasons, isLoading } = useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await api.GET("/seasons");
      if (error) throw new Error("Failed to load seasons");
      return data!;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Seasons</h1>
        <NewSeasonDialog />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : !seasons || seasons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No seasons yet. Create your first one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {seasons.map((season) => (
            <Link key={season.id} href={`/seasons/${season.id}`}>
              <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle>{season.name}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
