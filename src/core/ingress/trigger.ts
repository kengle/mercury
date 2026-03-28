import type { ConfigService } from "../../services/config/interface.js";
import type { TriggerConfig, TriggerMatch } from "../types.js";

export interface TriggerResult {
  matched: boolean;
  prompt: string; // text with trigger stripped
}

const VALID_MATCHES: Set<string> = new Set(["prefix", "mention", "always"]);

export function loadTriggerConfig(
  config: ConfigService,
  defaults: { patterns: string[]; match: string },
  workspaceId: number,
): TriggerConfig {
  const match = config.get(workspaceId, "trigger.match") as TriggerMatch | null;
  const patternsRaw = config.get(workspaceId, "trigger.patterns");
  const caseSensitive = config.get(workspaceId, "trigger.case_sensitive");

  const defaultMatch = VALID_MATCHES.has(defaults.match)
    ? (defaults.match as TriggerMatch)
    : "mention";

  const patterns = patternsRaw
    ? patternsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : defaults.patterns;

  return {
    match: match && VALID_MATCHES.has(match) ? match : defaultMatch,
    patterns: patterns.length > 0 ? patterns : defaults.patterns,
    caseSensitive: caseSensitive === "true",
  };
}

export function matchTrigger(
  text: string,
  config: TriggerConfig,
  isDM: boolean,
): TriggerResult {
  const trimmed = text.trim();
  if (!trimmed) return { matched: false, prompt: "" };

  if (config.match === "always") {
    return { matched: true, prompt: trimmed };
  }

  // DMs: trigger is optional — try to match and strip, but if no match, use full text
  if (isDM) {
    const stripped = tryMatch(trimmed, config);
    return { matched: true, prompt: stripped ?? trimmed };
  }

  // Groups: trigger is required
  const stripped = tryMatch(trimmed, config);
  if (stripped !== null) return { matched: true, prompt: stripped };
  return { matched: false, prompt: "" };
}

/**
 * Try to match any of the patterns against the text using the configured mode.
 * Returns the prompt with the matched pattern removed, or null if no match.
 * Patterns are tried longest-first to avoid partial matches (e.g. "@Pi" before "Pi").
 */
function tryMatch(text: string, config: TriggerConfig): string | null {
  const sorted = [...config.patterns].sort((a, b) => b.length - a.length);

  for (const pattern of sorted) {
    const result = matchSinglePattern(text, pattern, config);
    if (result !== null) return result;
  }

  return null;
}

function matchSinglePattern(
  text: string,
  pattern: string,
  config: TriggerConfig,
): string | null {
  switch (config.match) {
    case "prefix":
      return stripPrefix(text, pattern, config.caseSensitive);

    case "mention": {
      const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const flags = config.caseSensitive ? "" : "i";
      // Match pattern with optional @ prefix and trailing punctuation
      const regex = new RegExp(
        `(?:^|(?<=\\s))@?${escaped}[?!.,;:]*(?=\\s|$)`,
        flags,
      );
      const match = regex.exec(text);
      if (!match) return null;
      const before = text.slice(0, match.index).trim();
      const after = text.slice(match.index + match[0].length).trim();
      return [before, after].filter(Boolean).join(" ") || text;
    }

    default:
      return null;
  }
}

function stripPrefix(
  text: string,
  prefix: string,
  caseSensitive: boolean,
): string | null {
  const textCmp = caseSensitive ? text : text.toLowerCase();
  const prefixCmp = caseSensitive ? prefix : prefix.toLowerCase();

  if (!textCmp.startsWith(prefixCmp)) return null;
  const rest = text.slice(prefix.length);
  // For prefix mode, require a space or end-of-string after the pattern
  // to avoid "Pixel art" matching "Pi"
  if (rest.length > 0 && rest[0] !== " ") return null;
  return rest.trim();
}
