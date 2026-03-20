export function inferConversationKind(
  platform: string,
  externalId: string,
  isDM: boolean,
): string {
  if (isDM) return "dm";

  switch (platform) {
    case "whatsapp":
      return "group";
    case "discord":
      return externalId.includes(":") ? "thread" : "channel";
    case "slack":
      return "channel";
    case "teams":
      return "channel";
    default:
      return "group";
  }
}
