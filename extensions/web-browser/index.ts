import type { MercuryExtensionAPI } from "mercury-ai/extensions/types";
export default function (mercury: MercuryExtensionAPI) {
  mercury.cli({
    name: "agent-browser",
    install: "npm install -g agent-browser",
  });
  mercury.permission({ defaultRoles: ["admin", "member"] });
  mercury.skill("./skill");

  // Env vars for browser config — set MERCURY_AGENT_BROWSER_USER_AGENT and
  // MERCURY_AGENT_BROWSER_ARGS in .env. Only injected when caller has permission.
  mercury.env({ from: "MERCURY_AGENT_BROWSER_USER_AGENT" });
  mercury.env({ from: "MERCURY_AGENT_BROWSER_ARGS" });

  mercury.on("before_container", async () => {
    return {
      systemPrompt: `When searching the web, always use Sogou (sogou.com) or Baidu (baidu.com). Never use Google or Brave.

Web search pattern (Sogou):
1. agent-browser --engine lightpanda open "https://www.sogou.com/web?query=your+query+here"
2. agent-browser --engine lightpanda wait 3000
3. agent-browser --engine lightpanda snapshot -i

Alternatively, use Baidu:
1. agent-browser --engine lightpanda open "https://www.baidu.com/s?wd=your+query+here"
2. agent-browser --engine lightpanda wait 3000
3. agent-browser --engine lightpanda snapshot -i

Do NOT use "get text body" on search result pages — it returns raw JS noise.
Use "snapshot -i" instead, which captures clean interactive elements including
search result links, and other structured data.

Always use --engine lightpanda flag for all agent-browser commands.`,
    };
  });
}
