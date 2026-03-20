import type { ExtensionRegistry } from "../../extensions/loader.js";
import type { ExtensionInfo, ExtensionListService } from "./interface.js";

export function createExtensionListService(registry: ExtensionRegistry): ExtensionListService {
  return {
    list(): ExtensionInfo[] {
      return registry.list().map((ext) => ({
        name: ext.name,
        hasCli: ext.clis.length > 0,
        hasSkill: !!ext.skillDir,
        permission: ext.permission ? ext.name : null,
      }));
    },
  };
}
