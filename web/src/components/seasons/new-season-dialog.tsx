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

const schema = z.object({ name: z.string().min(1).max(120) });

export function NewSeasonDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (n: string) => {
      const { data, error, response } = await api.POST("/seasons", {
        body: { name: n },
      });
      if (error) {
        showApiError(response.status, error);
        throw new Error("create failed");
      }
      return data!;
    },
    onSuccess: () => {
      toast.success("Season created");
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      setName("");
      setFormError(null);
      setOpen(false);
    },
  });

  function submit() {
    const parsed = schema.safeParse({ name });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setFormError(null);
    mutation.mutate(parsed.data.name);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>New Season</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Season</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="season-name">Name</Label>
            <Input
              id="season-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sunday Mens S7"
              autoFocus
            />
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
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
