import { defineCommand } from "./ipc";
import { hostIpc } from "./tauri";

const getSecret = defineCommand<
  { service: string; account: string },
  string | null
>("secrets_get", "host");
const setSecret = defineCommand<
  { service: string; account: string; password: string },
  void
>("secrets_set", "host");
const deleteSecret = defineCommand<{ service: string; account: string }, void>(
  "secrets_delete",
  "host",
);
const getAllSecrets = defineCommand<
  { service: string; accounts: string[] },
  (string | null)[]
>("secrets_get_all", "host");

/** Host keychain access scoped to one application service name. */
export function createSecretStore(service: string) {
  if (!service.trim()) throw new Error("Secret service must not be empty");
  return {
    get: (account: string) => hostIpc.call(getSecret, { service, account }),
    set: (account: string, password: string) =>
      hostIpc.call(setSecret, { service, account, password }),
    delete: (account: string) =>
      hostIpc.call(deleteSecret, { service, account }),
    getAll: (accounts: string[]) =>
      hostIpc.call(getAllSecrets, { service, accounts }),
  };
}
