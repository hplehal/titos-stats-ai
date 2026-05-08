"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

const schema = z.object({
  name: z.string().min(1).max(120),
  current_tier: z.number().int().min(1).max(8).nullable(),
});

const TIER_UNSET = "_unset_";

export function NewTeamDialog({ seasonId }: { seasonId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [tier, setTier] = useState<string>(TIER_UNSET);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (vars: { name: string; current_tier: number | null }) => {
      const { data, error, response } = await api.POST("/teams", {
        body: {
          name: vars.name,
          season_id: seasonId,
          current_tier: vars.current_tier,
        },
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("create failed");
      }
      return data!;
    },
    onSuccess: () => {
      toast.success("Team created");
      queryClient.invalidateQueries({ queryKey: ["seasons", seasonId] });
      setName("");
      setTier(TIER_UNSET);
      setFormError(null);
      setOpen(false);
    },
  });

  function submit() {
    const tierNum = tier === TIER_UNSET ? null : Number(tier);
    const parsed = schema.safeParse({ name, current_tier: tierNum });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setFormError(null);
    mutation.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New Team</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Team</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tito Sharks"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-tier">Current Tier</Label>
            <Select value={tier} onValueChange={(v) => setTier(v ?? TIER_UNSET)}>
              <SelectTrigger id="team-tier">
                <SelectValue />
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
          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}
          <DialogFooter>
            <Button onClick={submit} disabled={mutation.isPending}>
              {mutation.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
