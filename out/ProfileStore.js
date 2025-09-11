"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileStore = void 0;
const PROFILES_KEY = 'codec.profiles';
const ACTIVE_PROFILE_KEY = 'codec.activeProfileId';
const secretKey = (id) => `codec.password:${id}`;
class ProfileStore {
    constructor(context) {
        this.context = context;
    }
    async listProfiles() {
        return this.context.globalState.get(PROFILES_KEY, []);
    }
    async getActiveProfileId() {
        return this.context.globalState.get(ACTIVE_PROFILE_KEY);
    }
    async setActiveProfileId(id) {
        await this.context.globalState.update(ACTIVE_PROFILE_KEY, id);
    }
    async getPassword(id) {
        return this.context.secrets.get(secretKey(id));
    }
    async addProfile(label, host, username, password) {
        const id = `${host}|${username}`;
        const profiles = await this.listProfiles();
        const exists = profiles.find(p => p.id === id);
        const profile = { id, label, host, username };
        const next = exists
            ? profiles.map(p => (p.id === id ? profile : p))
            : [...profiles, profile];
        await this.context.globalState.update(PROFILES_KEY, next);
        await this.context.secrets.store(secretKey(id), password);
        return profile;
    }
    async removeProfile(id) {
        const profiles = await this.listProfiles();
        const next = profiles.filter(p => p.id !== id);
        await this.context.globalState.update(PROFILES_KEY, next);
        await this.context.secrets.delete(secretKey(id));
        const active = await this.getActiveProfileId();
        if (active === id) {
            await this.setActiveProfileId(next[0]?.id ?? '');
        }
    }
    async updateProfile(originalId, updates, newPassword) {
        const profiles = await this.listProfiles();
        const existing = profiles.find(p => p.id === originalId);
        if (!existing) {
            throw new Error('Profile not found');
        }
        const updated = {
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
exports.ProfileStore = ProfileStore;
//# sourceMappingURL=ProfileStore.js.map