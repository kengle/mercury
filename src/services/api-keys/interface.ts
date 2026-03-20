import type { ApiKeyEntity } from "./models.js";

export interface ApiKeyInfo {
  id: number;
  name: string;
  keyPrefix: string;
  createdAt: number;
  revokedAt: number | null;
}

export interface ApiKeyService {
  create(name: string): { key: string; info: ApiKeyInfo };
  list(): ApiKeyInfo[];
  revoke(id: number): boolean;
  validate(key: string): boolean;
}
