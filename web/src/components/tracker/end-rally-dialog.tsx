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
  /** Auto-suggested winner from the last play; highlighted and Enter accepts. */
  suggested: "home" | "away" | null;
  /**
   * Human-readable description of the play the suggestion was inferred from,
   * e.g. "ATTACK+SUCCESS by Lin (#8)". Shown as a subtitle so the user can
   * sanity-check the suggestion without scanning the play list.
   */
  suggestedReason: string | null;
  onPick: (side: "home" | "away") => void;
  onCancel: () => void;
};

export function EndRallyDialog({
  open,
  homeName,
  awayName,
  suggested,
  suggestedReason,
  onPick,
  onCancel,
}: Props) {
  // Hotkey support inside the dialog: H / A pick the side; Enter accepts the
  // suggested winner if there is one; Esc cancels.
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
      } else if (e.key === "Enter" && suggested) {
        e.preventDefault();
        onPick(suggested);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, suggested, onPick, onCancel]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent initialFocus={false}>
        <DialogHeader>
          <DialogTitle>Who won this point?</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button
            variant={suggested === "home" ? "default" : "outline"}
            onClick={() => onPick("home")}
            className="h-16 text-base"
          >
            <span className="flex flex-col items-center gap-0.5">
              <span>{homeName}</span>
              <span className="text-xs opacity-70">
                Home — press H{suggested === "home" ? " or Enter" : ""}
              </span>
            </span>
          </Button>
          <Button
            variant={suggested === "away" ? "default" : "outline"}
            onClick={() => onPick("away")}
            className="h-16 text-base"
          >
            <span className="flex flex-col items-center gap-0.5">
              <span>{awayName}</span>
              <span className="text-xs opacity-70">
                Away — press A{suggested === "away" ? " or Enter" : ""}
              </span>
            </span>
          </Button>
        </div>
        {suggested && suggestedReason && (
          <p className="text-xs text-muted-foreground pt-1">
            Inferred from: {suggestedReason}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
