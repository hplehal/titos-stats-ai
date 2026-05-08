"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  homeName: string;
  awayName: string;
  onPick: (side: "home" | "away") => void;
  onCancel: () => void;
};

export function EndRallyDialog({
  open,
  homeName,
  awayName,
  onPick,
  onCancel,
}: Props) {
  // Hotkey support inside the dialog: H / A pick the side, Esc cancels.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        onPick("home");
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        onPick("away");
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onPick, onCancel]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle>Who won this point?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button onClick={() => onPick("home")} className="h-16 text-base">
            <span className="flex flex-col items-center gap-0.5">
              <span>{homeName}</span>
              <span className="text-xs opacity-70">Home — press H</span>
            </span>
          </Button>
          <Button onClick={() => onPick("away")} className="h-16 text-base">
            <span className="flex flex-col items-center gap-0.5">
              <span>{awayName}</span>
              <span className="text-xs opacity-70">Away — press A</span>
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
