export interface ExtensionInfo {
  name: string;
  hasCli: boolean;
  hasSkill: boolean;
  permission: string | null;
}

export interface ExtensionListService {
  list(): ExtensionInfo[];
}
