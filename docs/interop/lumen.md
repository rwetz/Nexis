# Nexis ↔ Lumen interop contract (v1)

As of 2026-09-24, Lumen is a browser based WebGL wallpaper generator with a palette of 2–8 hex colors, generator id, seed, numeric parameters and export controls. Nexis is a Tauri desktop workbench with host stored preferences, validated custom themes, workspace authorization and live PTY and tool sessions. Their runtime stores are independent.

## Portable config and theme

The shared palette artifact is a UTF-8 JSON file with this envelope:

```json
{
  "format": "nexis-lumen-palette",
  "version": 1,
  "palette": { "name": "Example", "colors": ["#102030", "#aabbcc"] }
}
```

`format` and `version` are required. Importers reject unknown versions. `name` is nonempty, at most 80 characters; `colors` has 2–8 six-digit `#RRGGBB` values. Extra fields have no meaning in v1. The file contains no app preferences, paths, credentials, generated image, or executable content. Lumen exports and opens the current palette. Nexis exports the active theme’s resolved background, primary, secondary, muted and foreground colors as an ordered Lumen palette. Nexis also imports a Lumen palette as a new custom theme, mapping the first color to background and the second to primary/ring; it chooses black or white foreground for each based on contrast. This is a lossy conversion and remains editable in Nexis. A new unique theme id makes repeat imports reversible and avoids replacing an existing theme. Deleting that custom theme removes the import. Palette export does not change either app’s state.

Nexis `.nexis-theme` files and Lumen's internal `Palette` objects remain their own formats. The shared envelope is the portable boundary. A future general config envelope must use a new format/version or explicitly defined fields, never serialize either app's entire settings store. Whitelist portable values only; exclude API keys, local machine paths and background process state.

## Workspace handoff (v1)

Lumen’s **Save Workspace Handoff** exports a UTF-8 JSON file with `format: "nexis-lumen-workspace"`, `version: 1`, a `workspace` object (`label`, `scenePath`) and an embedded portable `scene` snapshot. `scenePath` is restricted to `lumen/<safe-name>.nexis-lumen-scene.json`; it is relative and cannot traverse upward. The label is for display, never path resolution. Lumen can reopen this handoff and restore the embedded scene.

Nexis’s **Import Lumen handoff** asks for the JSON and then opens a native folder picker. The user chooses the local host folder that will receive the scene. Nexis validates the envelope, makes the `lumen` child directory, refuses to overwrite an existing scene, writes the embedded scene file there, and imports the palette as an editable custom theme. Cancellation changes nothing. The selected folder is explicit user input; a path in the JSON never authorizes a workspace. This v1 action is host scoped. WSL workspace destinations require a future environment aware picker and are not silently routed through the host filesystem.

## Portable scene snapshot (v1)

Lumen can save and open a `.nexis-lumen-scene.json` file. It uses `format: "nexis-lumen-scene"`, `version: 1`, the same `palette` object above, and a `scene` object:

```json
{ "generator": "fluid", "seed": 1000, "params": { "u_scale": 0.8, "u_warp": 1, "u_speed": 1, "u_contrast": 1 }, "mouseStrength": 0.5 }
```

Lumen validates the generator id against its installed registry, every parameter against that generator's names and ranges, a nonnegative integer seed, and a mouse strength from 0 to 1. It restores the declarative controls only. Animation time, playback state, GPU resources and exported files are not captured. Nexis accepts the palette portion of this file as a new custom theme; it does not execute or restore the scene. Keep the file to reopen the scene in Lumen. Unsupported versions are rejected.

## Session boundary

The scene snapshot above is the v1 session handoff: Lumen restores a new rendering session from declarative state. Nexis stores that snapshot in the selected folder for later opening in Lumen, and consumes its palette as a theme. It never attempts to run a WebGL renderer inside Nexis. Terminal process ids, PTY buffers, credentials, running commands, GPU handles and animation time never cross this boundary. A future Nexis document reference would need its own versioned contract.

## Evolution

Readers reject unsupported `format`/`version`; writers emit v1 until a migration is explicitly built. Import is a deliberate file selection in Nexis Settings → Themes or Lumen’s Color controls. There is no background sync or shared storage directory. Preserve the source file so users can move it between machines. Remove an imported custom theme and the folder scene file separately to roll back both effects of a workspace handoff.
