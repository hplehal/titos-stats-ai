import { toast } from "sonner";

type ApiErrorBody = {
  detail?: string;
  constraint?: string | null;
};

export function showApiError(
  status: number,
  body: unknown,
  context?: { jerseyNumber?: number },
): void {
  const detail = (body as ApiErrorBody | undefined)?.detail;
  const constraint = (body as ApiErrorBody | undefined)?.constraint;

  if (status === 401) {
    toast.error("Authentication failed — check NEXT_PUBLIC_API_KEY.");
    return;
  }
  if (status === 503) {
    toast.error("Server has no API_KEY configured (mutations refused).");
    return;
  }
  if (status === 409 && constraint === "uq_players_team_jersey") {
    toast.error(
      context?.jerseyNumber !== undefined
        ? `Jersey #${context.jerseyNumber} is already taken on this team.`
        : "Jersey number is already taken on this team.",
    );
    return;
  }
  if (status === 409) {
    toast.error(detail ?? "Conflict with existing data.");
    return;
  }
  if (status === 422) {
    toast.error(detail ?? "Invalid input.");
    return;
  }
  toast.error(detail ?? `Error ${status}`);
}
