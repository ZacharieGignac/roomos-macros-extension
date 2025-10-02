"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacroManager = void 0;
const jsxapi_1 = require("jsxapi");
class MacroManager {
    logDebug(message, details) {
        const prefix = `[MacroManager][${this.host}]`;
        if (details !== undefined) {
            // eslint-disable-next-line no-console
            console.debug(prefix, message, details);
        }
        else {
            // eslint-disable-next-line no-console
            console.debug(prefix, message);
        }
        for (const fn of this.debugListeners) {
            try {
                fn(message, details);
            }
            catch { }
        }
    }
    constructor(host, username, password, connectionMethod = 'wss') {
        this.host = host;
        this.username = username;
        this.password = password;
        this.connectionMethod = connectionMethod;
        this.state = 'idle';
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.reconnectScheduled = false;
        this.explicitDisconnect = false;
        this.stateListeners = [];
        this.macroLogListeners = [];
        this.debugListeners = [];
        this.probeTimer = null;
    }
    async connect() {
        this.explicitDisconnect = false;
        this.reconnectScheduled = false;
        this.logDebug('connect() called');
        this.setState(this.state === 'disconnected' || this.state === 'idle' ? 'connecting' : 'reconnecting');
        this.logDebug('attempting jsxapi connect', { host: this.host, username: this.username, method: this.connectionMethod, note: 'forcing WSS due to temporary SSH bug' });
        // Temporarily force WSS for all connections while SSH save bug is investigated
        const protocol = 'wss:';
        const x = await (0, jsxapi_1.connect)({
            host: this.host,
            username: this.username,
            password: this.password,
            protocol
        });
        this.logDebug('jsxapi connect resolved');
        this.attachXapi(x);
        this.xapi = x;
        this.reconnectAttempts = 0;
        this.reconnectScheduled = false;
        // Do not set ready here; wait for xapi 'ready' event to ensure full readiness
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
        await this.xapi.Command.Macros.Macro.Save({ Name: name, Overwrite: true, transpile: false }, content);
    }
    async create(name, content = '') {
        await this.xapi.Command.Macros.Macro.Save({ Name: name, Overwrite: false, Transpile: false }, content);
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
        this.logDebug('disconnect() called');
        this.explicitDisconnect = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
            this.logDebug('cleared pending reconnect timer');
        }
        this.stopHealthProbe();
        try {
            if (this.xapi) {
                // Remove listeners by closing; new connections will re-attach
                this.logDebug('closing current xapi connection');
                this.xapi.close();
            }
        }
        catch { }
        this.reconnectScheduled = false;
        this.setState('disconnected');
    }
    setState(s) {
        const prev = this.state;
        this.state = s;
        this.logDebug('state change', { from: prev, to: s });
        for (const fn of this.stateListeners) {
            try {
                fn(s);
            }
            catch { }
        }
    }
    // Public subscription for macro log events
    onMacroLog(listener) {
        this.macroLogListeners.push(listener);
        return () => {
            const idx = this.macroLogListeners.indexOf(listener);
            if (idx >= 0)
                this.macroLogListeners.splice(idx, 1);
        };
    }
    // Public subscription for internal debug logs
    onDebug(listener) {
        this.debugListeners.push(listener);
        return () => {
            const idx = this.debugListeners.indexOf(listener);
            if (idx >= 0)
                this.debugListeners.splice(idx, 1);
        };
    }
    attachXapi(x) {
        // Ensure previous timers are cleared
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.logDebug('attaching jsxapi listeners');
        // Ready transition is handled after connect resolution, but keep in case of reconnect flows
        x.on('ready', () => {
            this.logDebug('xapi event: ready');
            this.reconnectAttempts = 0;
            this.reconnectScheduled = false;
            this.setState('ready');
            this.startHealthProbe();
        });
        x.on('error', (_err) => {
            this.logDebug('xapi event: error', _err);
            if (this.explicitDisconnect)
                return;
            const message = typeof _err === 'string' ? _err : (_err?.message || String(_err));
            // Treat websocket closed errors as an immediate disconnect and start reconnect flow
            if (/websocket closed/i.test(message) || /code\s*:?\s*1006/i.test(message)) {
                if (!this.reconnectScheduled) {
                    this.stopHealthProbe();
                    this.setState('disconnected');
                    this.scheduleReconnect();
                }
            }
        });
        x.on('close', (code, reason) => {
            this.logDebug('xapi event: close', { code, reason, explicitDisconnect: this.explicitDisconnect });
            if (this.explicitDisconnect) {
                this.setState('disconnected');
                return;
            }
            this.stopHealthProbe();
            this.scheduleReconnect();
        });
        // Forward macro log events to registered listeners
        try {
            x.Event.Macros.Log.on((value) => {
                for (const fn of this.macroLogListeners) {
                    try {
                        fn(value);
                    }
                    catch { }
                }
            });
        }
        catch { }
    }
    scheduleReconnect() {
        if (this.explicitDisconnect)
            return;
        if (this.reconnectScheduled) {
            this.logDebug('reconnect already scheduled; skipping duplicate');
            return;
        }
        this.reconnectScheduled = true;
        this.reconnectAttempts += 1;
        const base = 1000;
        const max = 30000;
        const delay = Math.min(max, base * Math.pow(2, this.reconnectAttempts - 1));
        this.logDebug('scheduling reconnect', { attempt: this.reconnectAttempts, delayMs: delay });
        this.setState('reconnecting');
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(async () => {
            this.logDebug('reconnect timer fired', { attempt: this.reconnectAttempts });
            try {
                await this.connect();
            }
            catch {
                this.logDebug('reconnect attempt failed; will back off and retry');
                // Keep trying; next attempt will back off further
                this.scheduleReconnect();
            }
        }, delay);
    }
    startHealthProbe() {
        this.stopHealthProbe();
        this.logDebug('starting health probe interval');
        this.probeTimer = setInterval(async () => {
            try {
                // Probe a lightweight status field; failures indicate connection problems
                const name = await this.xapi.Config.SystemUnit.Name.get();
                this.logDebug('probe ok', { systemUnitName: name });
            }
            catch (err) {
                this.logDebug('probe failed', err);
                if (!this.explicitDisconnect && !this.reconnectScheduled) {
                    this.stopHealthProbe();
                    this.setState('disconnected');
                    this.scheduleReconnect();
                }
            }
        }, 5000);
    }
    stopHealthProbe() {
        if (this.probeTimer) {
            clearInterval(this.probeTimer);
            this.probeTimer = null;
            this.logDebug('stopped health probe interval');
        }
    }
}
exports.MacroManager = MacroManager;
//# sourceMappingURL=MacroManager.js.map