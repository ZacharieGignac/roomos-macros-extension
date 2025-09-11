import { connect, XAPI } from 'jsxapi';

export class MacroManager {
  private xapi: XAPI | null = null;

  constructor(
    private host: string,
    private username: string,
    private password: string
  ) {}

  async connect(): Promise<void> {
    if (this.xapi) return;
    const xapi = await connect({
      host: this.host,
      username: this.username,
      password: this.password,
      protocol: 'wss:'
    });
    // Attach basic lifecycle handlers following jsxapi examples
    try {
      (xapi as any).on?.('close', () => {
        this.xapi = null;
      });
      (xapi as any).on?.('error', (_err: unknown) => {
        // Keep reference; commands will fail and callers can handle
      });
    } catch {}
    this.xapi = xapi;
  }

  isConnected(): boolean {
    return !!this.xapi;
  }

  private async ensureConnected(): Promise<XAPI> {
    if (!this.xapi) {
      await this.connect();
    }
    const x = this.xapi as XAPI;
    return x;
  }

  async list(): Promise<any[]> {
    const xapi = await this.ensureConnected();
    const res = await xapi.Command.Macros.Macro.Get({});
    return res.Macro || [];
  }


  async get(name: string): Promise<string> {
    const xapi = await this.ensureConnected();
    const res = await xapi.Command.Macros.Macro.Get({ Name: name, Content: true });
    const macroArr = res.Macro || [];
    const match = macroArr.find((m: any) => m.Name === name);
    return match?.Content ?? '';
  }

  async save(name: string, content: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Save(
      { Name: name, Overwrite: true },
      content
    );
  }

  async create(name: string, content: string = ''): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Save(
      { Name: name, Overwrite: false, Transpile: true },
      content
    );
  }

  async delete(name: string): Promise<void> {
    // Back-compat: route delete to Remove
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Remove({ Name: name });
  }

  async remove(name: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Remove({ Name: name });
  }

  async activate(name: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Activate({ Name: name });
  }

  async deactivate(name: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Deactivate({ Name: name });
  }

  async activateById(id: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Activate({ Id: id });
  }

  async deactivateById(id: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Deactivate({ Id: id });
  }

  async restartFramework(): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Runtime.Restart({});
  }

  async rename(oldName: string, newName: string): Promise<void> {
    const xapi = await this.ensureConnected();
    await xapi.Command.Macros.Macro.Rename({ Name: oldName, NewName: newName });
  }

  async verifyConnection(): Promise<void> {
    const xapi = await this.ensureConnected();
    try {
      // Lightweight read that validates auth and connectivity
      await (xapi as any).Status.SystemUnit.ProductId.get();
    } catch (err: any) {
      // Normalize error with a code where possible for upstream categorization
      const error: any = new Error(err?.message || 'Failed to verify xAPI connection');
      error.code = err?.code || err?.errno || err?.cause?.code || undefined;
      throw error;
    }
  }
}
