// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import type { Theme } from "../types";

export const nexisDefault: Theme = {
  id: "nexis-default",
  name: "Nexis Default",
  description: "The default Nexis look — clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  variants: {
    light: {},
    dark: {},
  },
};
