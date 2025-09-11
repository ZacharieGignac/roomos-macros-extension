import { connect, XAPI } from 'jsxapi';

export class MacroManager {
  private xapi!: XAPI;

  constructor(
    private host: string,
    private username: string,
    private password: string
  ) {}

  async connect(): Promise<void> {
    this.xapi = await connect({
      host: this.host,
      username: this.username,
      password: this.password,
      protocol: 'wss:'
    });
  }

  async list(): Promise<any[]> {
    const res = await this.xapi.Command.Macros.Macro.Get({});
    return res.Macro || [];
  }


  async get(name: string): Promise<string> {
    const res = await this.xapi.Command.Macros.Macro.Get({ Name: name, Content: true });
    const macroArr = res.Macro || [];
    const match = macroArr.find((m: any) => m.Name === name);
    return match?.Content ?? '';
  }

  async save(name: string, content: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Save(
      { Name: name, Overwrite: true },
      content
    );
  }

  async create(name: string, content: string = ''): Promise<void> {
    await this.xapi.Command.Macros.Macro.Save(
      { Name: name, Overwrite: false, Transpile: true },
      content
    );
  }

  async delete(name: string): Promise<void> {
    // Back-compat: route delete to Remove
    await this.xapi.Command.Macros.Macro.Remove({ Name: name });
  }

  async remove(name: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Remove({ Name: name });
  }

  async activate(name: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Activate({ Name: name });
  }

  async deactivate(name: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Deactivate({ Name: name });
  }

  async activateById(id: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Activate({ Id: id });
  }

  async deactivateById(id: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Deactivate({ Id: id });
  }

  async restartFramework(): Promise<void> {
    await this.xapi.Command.Macros.Runtime.Restart({});
  }

  async rename(oldName: string, newName: string): Promise<void> {
    await this.xapi.Command.Macros.Macro.Rename({ Name: oldName, NewName: newName });
  }

  async verifyConnection(): Promise<void> {
    // Perform a simple read that requires valid credentials
    await (this.xapi as any).Status.SystemUnit.ProductId.get();
  }
}
