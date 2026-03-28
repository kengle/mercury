import type { Context } from "hono";
import type { ExtensionRegistry } from "../extensions/loader.js";
import type { ConfigService } from "../services/config/interface.js";
import type { ConfigRegistry } from "../services/config/registry.js";
import type { ConversationService } from "../services/conversations/interface.js";
import type { MessageService } from "../services/messages/interface.js";
import type { MuteService } from "../services/mutes/interface.js";
import type { PolicyService } from "../services/policy/interface.js";
import type { RoleService } from "../services/roles/interface.js";
import type { TaskService } from "../services/tasks/interface.js";
import type { UserService } from "../services/users/interface.js";
import type { WorkspaceService } from "../services/workspaces/interface.js";
import type { AppConfig } from "./config.js";
import type { Agent } from "./runtime/agent-interface.js";
import type { AgentQueue } from "./runtime/queue.js";

export interface Services {
  conversations: ConversationService;
  messages: MessageService;
  tasks: TaskService;
  roles: RoleService;
  config: ConfigService;
  mutes: MuteService;
  users: UserService;
  policy: PolicyService;
  workspaces: WorkspaceService;
}

export interface ApiContext {
  services: Services;
  appConfig: AppConfig;
  agent: Agent;
  queue: AgentQueue;
  registry: ExtensionRegistry;
  configRegistry: ConfigRegistry;
}

export interface AuthContext {
  callerId: string;
  role: string;
  workspaceId: number;
  workspaceName: string;
}

export type Env = {
  Variables: {
    auth: AuthContext;
    apiCtx: ApiContext;
  };
};

export const getAuth = (c: Context<Env>): AuthContext => c.get("auth");
export const getApiCtx = (c: Context<Env>): ApiContext => c.get("apiCtx");

export const checkPerm = (
  c: Context<Env>,
  permission: string,
): Response | null => {
  const { role } = c.get("auth");
  const { services } = c.get("apiCtx");

  if (!services.roles.hasPermission(role, permission)) {
    return c.json(
      { error: `Forbidden: requires '${permission}' permission` },
      403,
    );
  }
  return null;
};
