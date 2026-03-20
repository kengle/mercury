import type { AppConfig } from "../../core/config.js";
import type { IngressMessage } from "../../core/types.js";
import type { RoleService } from "../roles/interface.js";
import type { ConfigService } from "../config/interface.js";
import type { MuteService } from "../mutes/interface.js";
import { loadTriggerConfig, matchTrigger } from "../../core/ingress/trigger.js";
import { RateLimiter } from "../../core/runtime/rate-limiter.js";
import type { PolicyResult, PolicyService } from "./interface.js";

export function createPolicyService(
  appConfig: AppConfig,
  roles: RoleService,
  config: ConfigService,
  mutes: MuteService,
  rateLimiter?: RateLimiter,
): PolicyService {
  const defaultPatterns = appConfig.triggerPatterns
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    evaluate(message: IngressMessage): PolicyResult {
      const text = message.text.trim();
      if (!text) return { action: "ignore" };

      // Resolve role
      const role = roles.resolveRole(message.callerId);

      // Trigger matching
      const triggerConfig = loadTriggerConfig(config, {
        patterns: defaultPatterns,
        match: appConfig.triggerMatch,
      });

      const result = matchTrigger(text, triggerConfig, message.isDM);
      const isReplyTrigger = message.isReplyToBot && !message.isDM;
      if (!result.matched && !isReplyTrigger) return { action: "ignore" };

      const prompt = result.matched ? result.prompt : text;

      // Permission check
      const promptPerm = message.isDM ? "prompt.dm" : "prompt.group";
      if (!roles.hasPermission(role, promptPerm)) {
        return {
          action: "deny",
          reason: message.isDM
            ? "You don't have permission to DM the agent."
            : "You don't have permission to use the agent.",
        };
      }

      // Mute check
      if (mutes.isMuted(message.callerId)) {
        return { action: "ignore" };
      }

      // Rate limit check
      if (rateLimiter) {
        const rateLimitOverride = config.get("rate_limit");
        const effectiveLimit = rateLimitOverride
          ? Number.parseInt(rateLimitOverride, 10)
          : appConfig.rateLimitPerUser;

        if (effectiveLimit > 0 && !rateLimiter.isAllowed(message.callerId, effectiveLimit)) {
          return { action: "deny", reason: "Rate limit exceeded. Try again shortly." };
        }
      }

      return { action: "process", prompt, callerId: message.callerId, role };
    },
  };
}
