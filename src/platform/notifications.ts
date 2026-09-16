import { toast } from "sonner";

export type Notification = {
  message: string;
  detail?: string;
  kind?: "info" | "error" | "success";
  id?: string;
};

/** A shared severity/detail contract; callers can replace an existing notice
 * with a stable id instead of accumulating duplicates during retries. */
export function notify({
  message,
  detail,
  kind = "info",
  id,
}: Notification): void {
  toast[kind](message, { description: detail, id });
}
