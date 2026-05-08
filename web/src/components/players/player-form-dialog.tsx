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
import { showApiError } from "@/lib/api-error";
import { api } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  jersey_number: z
    .number({ message: "Jersey number is required" })
    .int("Must be a whole number")
    .min(0, "Min 0")
    .max(99, "Max 99"),
});

type PlayerLite = {
  id: string;
  team_id: string;
  name: string;
  jersey_number: number;
};

type Props =
  | {
      mode: "create";
      teamId: string;
      trigger?: React.ReactElement;
    }
  | {
      mode: "edit";
      teamId: string;
      player: PlayerLite;
      trigger?: React.ReactElement;
    };

export function PlayerFormDialog(props: Props) {
  const isEdit = props.mode === "edit";
  const initial = isEdit
    ? { name: props.player.name, jersey: String(props.player.jersey_number) }
    : { name: "", jersey: "" };

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [jersey, setJersey] = useState(initial.jersey);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const createMut = useMutation({
    mutationFn: async (vars: { name: string; jersey_number: number }) => {
      const { data, error, response } = await api.POST("/players", {
        body: {
          name: vars.name,
          team_id: props.teamId,
          jersey_number: vars.jersey_number,
        },
      });
      if (error) {
        showApiError(response.status, error, {
          jerseyNumber: vars.jersey_number,
        });
        throw new Error("create failed");
      }
      return data!;
    },
    onSuccess: () => {
      toast.success("Player added");
      queryClient.invalidateQueries({ queryKey: ["teams", props.teamId] });
      setName("");
      setJersey("");
      setFormError(null);
      setOpen(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { name: string; jersey_number: number }) => {
      if (!isEdit) throw new Error("update called in create mode");
      const { data, error, response } = await api.PATCH(
        "/players/{player_id}",
        {
          params: { path: { player_id: props.player.id } },
          body: { name: vars.name, jersey_number: vars.jersey_number },
        },
      );
      if (error) {
        showApiError(response.status, error, {
          jerseyNumber: vars.jersey_number,
        });
        throw new Error("update failed");
      }
      return data!;
    },
    onSuccess: () => {
      toast.success("Player updated");
      queryClient.invalidateQueries({ queryKey: ["teams", props.teamId] });
      setFormError(null);
      setOpen(false);
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const jerseyNum = jersey === "" ? Number.NaN : Number(jersey);
    const parsed = schema.safeParse({ name, jersey_number: jerseyNum });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setFormError(null);
    if (isEdit) updateMut.mutate(parsed.data);
    else createMut.mutate(parsed.data);
  }

  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={props.trigger ?? <Button />}>
        {props.trigger ? null : "Add Player"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Player" : "Add Player"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="player-name">Name</Label>
            <Input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Last name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="player-jersey">Jersey number</Label>
            <Input
              id="player-jersey"
              inputMode="numeric"
              value={jersey}
              onChange={(e) => setJersey(e.target.value)}
              placeholder="0–99"
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive">{formError}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
