"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacroManager = void 0;
const jsxapi_1 = require("jsxapi");
class MacroManager {
    constructor(host, username, password) {
        this.host = host;
        this.username = username;
        this.password = password;
        this.state = 'idle';
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.explicitDisconnect = false;
        this.stateListeners = [];
    }
    async connect() {
        this.explicitDisconnect = false;
        this.setState(this.state === 'disconnected' || this.state === 'idle' ? 'connecting' : 'reconnecting');
        const x = await (0, jsxapi_1.connect)({
            host: this.host,
            username: this.username,
            password: this.password,
            protocol: 'wss:'
        });
        this.attachXapi(x);
        this.xapi = x;
        this.reconnectAttempts = 0;
        this.setState('ready');
    }
    async list() {
        const res = await this.xapi.Command.Macros.Macro.Get({});
        return res.Macro || [];
    }
    async get(name) {
        const res = await this.xapi.Command.Macros.Macro.Get({ Name: name, Content: true });
        const macroArr = res.Macro || [];
        const match = macroArr.find((m) => m.Name === name);
        return match?.Content ?? '';
    }
    async save(name, content) {
        await this.xapi.Command.Macros.Macro.Save({ Name: name, Overwrite: true }, content);
    }
    async create(name, content = '') {
        await this.xapi.Command.Macros.Macro.Save({ Name: name, Overwrite: false, Transpile: true }, content);
    }
    async delete(name) {
        // Back-compat: route delete to Remove
        await this.xapi.Command.Macros.Macro.Remove({ Name: name });
    }
    async remove(name) {
        await this.xapi.Command.Macros.Macro.Remove({ Name: name });
    }
    async activate(name) {
        await this.xapi.Command.Macros.Macro.Activate({ Name: name });
    }
    async deactivate(name) {
        await this.xapi.Command.Macros.Macro.Deactivate({ Name: name });
    }
    async activateById(id) {
        await this.xapi.Command.Macros.Macro.Activate({ Id: id });
    }
    async deactivateById(id) {
        await this.xapi.Command.Macros.Macro.Deactivate({ Id: id });
    }
    async restartFramework() {
        await this.xapi.Command.Macros.Runtime.Restart({});
    }
    async rename(oldName, newName) {
        await this.xapi.Command.Macros.Macro.Rename({ Name: oldName, NewName: newName });
    }
    onStateChange(listener) {
        this.stateListeners.push(listener);
        return () => {
            const idx = this.stateListeners.indexOf(listener);
            if (idx >= 0)
                this.stateListeners.splice(idx, 1);
        };
    }
    getState() {
        return this.state;
    }
    isConnected() {
        return this.state === 'ready';
    }
    async disconnect() {
        this.explicitDisconnect = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        try {
            if (this.xapi) {
                // Remove listeners by closing; new connections will re-attach
                this.xapi.close();
            }
        }
        catch { }
        this.setState('disconnected');
    }
    setState(s) {
        this.state = s;
        for (const fn of this.stateListeners) {
            try {
                fn(s);
            }
            catch { }
        }
    }
    attachXapi(x) {
        // Ensure previous timers are cleared
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        // Ready transition is handled after connect resolution, but keep in case of reconnect flows
        x.on('ready', () => {
            this.reconnectAttempts = 0;
            this.setState('ready');
        });
        x.on('error', (_err) => {
            // Keep state informative; actual UI will classify errors centrally
            if (!this.explicitDisconnect) {
                // No immediate state flip; wait for close to schedule reconnect
            }
        });
        x.on('close', () => {
            if (this.explicitDisconnect) {
                this.setState('disconnected');
                return;
            }
            this.scheduleReconnect();
        });
    }
    scheduleReconnect() {
        this.reconnectAttempts += 1;
        const base = 1000;
        const max = 30000;
        const delay = Math.min(max, base * Math.pow(2, this.reconnectAttempts - 1));
        this.setState('reconnecting');
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(async () => {
            try {
                await this.connect();
            }
            catch {
                // Keep trying; next attempt will back off further
                this.scheduleReconnect();
            }
        }, delay);
    }
}
exports.MacroManager = MacroManager;
//# sourceMappingURL=MacroManager.js.map