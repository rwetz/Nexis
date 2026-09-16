import { Lifetime, type Disposable } from "./lifetime";
import type { WorkspaceContext } from "./workspace";

export type Command<Args extends object, Result> = {
  readonly name: string;
  readonly scope: "host" | "workspace";
  /** Type witness; never serialized. */
  readonly types?: { args: Args; result: Result };
};

export function defineCommand<Args extends object, Result>(
  name: string,
  scope: "host" | "workspace",
): Command<Args, Result> {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw new Error(`Invalid IPC command: ${name}`);
  return Object.freeze({ name, scope });
}

export type PlatformTransport = {
  invoke<Result>(name: string, args: Record<string, unknown>): Promise<Result>;
  listen<Payload>(
    name: string,
    receive: (payload: Payload) => void,
  ): Promise<() => void>;
  emit<Payload>(name: string, payload: Payload): Promise<void>;
};

export type PlatformEvent<Payload> = {
  readonly name: string;
  readonly payloadType?: Payload;
};

export function defineEvent<Payload>(name: string): PlatformEvent<Payload> {
  if (!name.trim()) throw new Error("Event name must not be empty");
  return Object.freeze({ name });
}

export interface PlatformIpc {
  call<Args extends object, Result>(
    command: Command<Args, Result>,
    args: NoInfer<Args>,
  ): Promise<Result>;
  events(): EventScope;
  emit<Payload>(
    event: PlatformEvent<Payload>,
    payload: NoInfer<Payload>,
  ): Promise<void>;
}

export interface EventScope extends Disposable {
  listen<Payload>(
    event: PlatformEvent<Payload>,
    receive: (payload: NoInfer<Payload>) => void,
  ): Promise<Disposable>;
}

export function createPlatformIpc(
  transport: PlatformTransport,
  workspace?: WorkspaceContext,
): PlatformIpc {
  return {
    call(command, args) {
      // Scope is selected by the contract, never by an accidental caller field.
      if ("workspace" in args)
        throw new Error("Workspace is owned by the IPC command scope");
      if (command.scope === "workspace" && !workspace)
        throw new Error("Workspace command requires a workspace context");
      const payload =
        command.scope === "workspace"
          ? { ...args, workspace: workspace!.snapshot().environment }
          : { ...args };
      return transport.invoke(command.name, payload as Record<string, unknown>);
    },
    events() {
      const lifetime = new Lifetime();
      return {
        listen<Payload>(
          event: PlatformEvent<Payload>,
          receive: (payload: Payload) => void,
        ) {
          if (lifetime.disposed)
            return Promise.reject(new Error("Event scope is disposed"));
          let active = true;
          return lifetime.own(
            transport
              .listen<Payload>(event.name, (payload) => {
                if (active && !lifetime.disposed) receive(payload);
              })
              .then((unlisten) => () => {
                active = false;
                unlisten();
              }),
          );
        },
        dispose: () => lifetime.dispose(),
      };
    },
    emit: (event, payload) => transport.emit(event.name, payload),
  };
}
