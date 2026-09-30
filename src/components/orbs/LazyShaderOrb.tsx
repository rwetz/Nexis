// ╔══════════════════════════════════════╗
// ║  Ryan Wetzstein                      ║
// ║  Nexis                               ║
// ║  2026                                ║
// ╚══════════════════════════════════════╝

import { lazy, Suspense, type ComponentProps, type ReactNode } from "react";

const ShaderOrbImpl = lazy(() => import("./ShaderOrb").then((m) => ({ default: m.ShaderOrb })));

/**
 * `ShaderOrb` behind a dynamic import, so ogl and the shader sources load
 * with the first orb rather than at startup. `fallback` holds the orb's box
 * while the chunk loads, which keeps the layout from shifting.
 */
export function LazyShaderOrb({ fallback, ...props }: ComponentProps<typeof ShaderOrbImpl> & { fallback?: ReactNode }) {
  return (
    <Suspense fallback={fallback ?? <div style={{ width: props.size, height: props.size }} className="shrink-0" />}>
      <ShaderOrbImpl {...props} />
    </Suspense>
  );
}
