import * as vscode from 'vscode';

export interface CodecProfileInfo {
  id: string;
  label: string;
  host: string;
  username: string;
}

const PROFILES_KEY = 'codec.profiles';
const ACTIVE_PROFILE_KEY = 'codec.activeProfileId';
const secretKey = (id: string) => `codec.password:${id}`;

export class ProfileStore {
  constructor(private context: vscode.ExtensionContext) {}

  async listProfiles(): Promise<CodecProfileInfo[]> {
    return this.context.globalState.get<CodecProfileInfo[]>(PROFILES_KEY, []);
  }

  async getActiveProfileId(): Promise<string | undefined> {
    return this.context.globalState.get<string | undefined>(ACTIVE_PROFILE_KEY);
  }

  async setActiveProfileId(id: string): Promise<void> {
    await this.context.globalState.update(ACTIVE_PROFILE_KEY, id);
  }

  async getPassword(id: string): Promise<string | undefined> {
    return this.context.secrets.get(secretKey(id));
  }

  async addProfile(label: string, host: string, username: string, password: string): Promise<CodecProfileInfo> {
    const id = `${host}|${username}`;
    const profiles = await this.listProfiles();
    const exists = profiles.find(p => p.id === id);
    const profile: CodecProfileInfo = { id, label, host, username };
    const next = exists
      ? profiles.map(p => (p.id === id ? profile : p))
      : [...profiles, profile];
    await this.context.globalState.update(PROFILES_KEY, next);
    await this.context.secrets.store(secretKey(id), password);
    return profile;
  }

  async removeProfile(id: string): Promise<void> {
    const profiles = await this.listProfiles();
    const next = profiles.filter(p => p.id !== id);
    await this.context.globalState.update(PROFILES_KEY, next);
    await this.context.secrets.delete(secretKey(id));
    const active = await this.getActiveProfileId();
    if (active === id) {
      await this.setActiveProfileId(next[0]?.id ?? '');
    }
  }

  async updateProfile(
    originalId: string,
    updates: Partial<Omit<CodecProfileInfo, 'id'>> & { label?: string; host?: string; username?: string },
    newPassword?: string
  ): Promise<CodecProfileInfo> {
    const profiles = await this.listProfiles();
    const existing = profiles.find(p => p.id === originalId);
    if (!existing) {
      throw new Error('Profile not found');
    }
    const updated: CodecProfileInfo = {
      ...existing,
      label: updates.label ?? existing.label,
      host: updates.host ?? existing.host,
      username: updates.username ?? existing.username
    };
    const newId = `${updated.host}|${updated.username}`;
    updated.id = newId;

    // Update profiles array (handle id change)
    const withoutOriginal = profiles.filter(p => p.id !== originalId);
    const next = [...withoutOriginal.filter(p => p.id !== newId), updated];
    await this.context.globalState.update(PROFILES_KEY, next);

    // Move/update password
    const currentSecret = await this.getPassword(originalId);
    const passwordToStore = newPassword !== undefined ? newPassword : currentSecret ?? '';
    await this.context.secrets.store(secretKey(newId), passwordToStore);
    if (originalId !== newId) {
      await this.context.secrets.delete(secretKey(originalId));
      const active = await this.getActiveProfileId();
      if (active === originalId) {
        await this.setActiveProfileId(newId);
      }
    }
    return updated;
  }
}


