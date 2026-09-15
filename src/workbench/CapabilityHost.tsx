import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { createPluginAPI } from "@/lib/plugins/registry";
import { Lifetime } from "@/platform/lifetime";
import type { CapabilityContext, CapabilityDefinition } from "./capability";

const Context = createContext<CapabilityContext | null>(null);

export function useCapabilityContext(): CapabilityContext {
  const context = useContext(Context);
  if (!context) throw new Error("Capability requires a workbench host");
  return context;
}

export function CapabilityHost({ definitions, context, children }: {
  definitions: readonly CapabilityDefinition[];
  context: CapabilityContext;
  children: ReactNode;
}) {
  const latest = useRef(context);
  useEffect(() => { latest.current = context; }, [context]);
  useEffect(() => {
    const lifetime = new Lifetime();
    const api = createPluginAPI();
    try {
      for (const definition of definitions) {
        for (const panel of definition.panels) lifetime.add(api.registerPanel(panel).dispose);
        for (const command of definition.commands?.(() => latest.current) ?? []) {
          lifetime.add(api.registerCommand(command).dispose);
        }
      }
    } catch (error) {
      lifetime.dispose();
      throw error;
    }
    return () => lifetime.dispose();
  }, [definitions]);
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
