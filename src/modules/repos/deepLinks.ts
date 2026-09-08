import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { toast } from "sonner";
import { useAtlasStore } from "./store";
import { findByPath } from "./types";

/** Already validated on the Rust side (`src-tauri/src/links.rs`) — the webview
 *  never parses a URL that arrived from another process. */
type DeepLink = {
  action: "focus" | "map";
  path: string;
};

/** Act on one `nexis-atlas://` link.
 *
 *  A link can only ever *select* something Atlas already scanned: the path is
 *  matched against the repo list rather than handed to the backend, so no link
 *  can make Atlas read a directory it would not otherwise have looked at.
 *  If the repo is not in the list, the most likely reason is that it was added
 *  since the last scan, so rescan once before giving up. */
async function handle(link: DeepLink): Promise<void> {
  const s = useAtlasStore.getState();

  let repo = findByPath(s.repos, link.path);
  if (!repo) {
    await s.refresh();
    repo = findByPath(useAtlasStore.getState().repos, link.path);
  }

  if (!repo) {
    toast.error("Not a tracked repo", {
      description: `${link.path} is not in the scan. Add it to config.toml.`,
    });
    return;
  }

  const store = useAtlasStore.getState();
  if (link.action === "map") {
    await store.enterRepo(repo.path);
  } else {
    store.setMode("list");
    store.select(repo.path);
  }
}

/** Subscribe to `nexis-atlas://` links for the lifetime of the app.
 *
 *  Both arrival paths land on the same event: a link that starts Atlas is read
 *  out of argv during setup, and a link that arrives while it is already
 *  running comes in through single-instance. */
export function useDeepLinks(): void {
  useEffect(() => {
    const pending = listen<DeepLink>("atlas://deep-link", (event) => {
      void handle(event.payload);
    });
    return () => {
      void pending.then((unlisten) => unlisten());
    };
  }, []);
}
