// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

export { ThemeProvider, useTheme, type Theme, type ThemeModePref } from "./ThemeProvider";
export { listBuiltinThemes, listNexisThemes, listCommunityThemes, getBuiltinTheme, getDefaultTheme, migrateThemeId } from "./themes";
export { validateTheme, type ValidationResult } from "./validateTheme";
export { writeThemeFile, deleteThemeFile, themeFilePath, emitThemeEdit, onThemeEdit, starterTheme, type ThemeEditRequest } from "./themeFiles";
export { saveCustomTheme, deleteCustomTheme, listCustomThemes, onCustomThemesChange } from "./customThemes";
export { DEFAULT_THEME_ID, type ThemeColors, type TerminalPalette, type ThemeVariant } from "./types";
export { getFolderColor } from "./folderColor";
