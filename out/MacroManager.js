"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MacroManager = void 0;
const jsxapi_1 = require("jsxapi");
class MacroManager {
    constructor(host, username, password) {
        this.host = host;
        this.username = username;
        this.password = password;
    }
    async connect() {
        this.xapi = await (0, jsxapi_1.connect)({
            host: this.host,
            username: this.username,
            password: this.password,
            protocol: 'wss:'
        });
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
}
exports.MacroManager = MacroManager;
//# sourceMappingURL=MacroManager.js.map