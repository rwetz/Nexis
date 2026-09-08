import { useEffect, useState } from "react";
import { hasNexis } from "./api";

/** Whether an installed Nexis was found.
 *
 *  Asked once per mount rather than kept in the store: it cannot change while
 *  the app is open, and the answer only decides whether to render the action at
 *  all — a missing Nexis should hide the button, not offer one that can only
 *  fail. */
export function useNexisInstalled(): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    let live = true;
    void hasNexis()
      .then((v) => live && setInstalled(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return installed;
}
