import { connect, XAPI } from 'jsxapi';

type ConnectionState = 'idle' | 'connecting' | 'ready' | 'reconnecting' | 'disconnected' | 'error';

export class MacroManager {
  private xapi!: XAPI;
  private state: ConnectionState = 'idle';
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private explicitDisconnect = false;
  private stateListeners: Array<(s: ConnectionState) => void> = [];

  constructor(
    private host: string,
    private username: string,
    private password: string
  ) {}

  async connect(): Promise<void> {
    this.explicitDisconnect = false;
    this.setState(this.state === 'disconnected' || this.state === 'idle' ? 'connecting' : 'reconnecting');
    const x = await connect({
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

  onStateChange(listener: (s: ConnectionState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      const idx = this.stateListeners.indexOf(listener);
      if (idx >= 0) this.stateListeners.splice(idx, 1);
    };
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'ready';
  }

  async disconnect(): Promise<void> {
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
    } catch {}
    this.setState('disconnected');
  }

  private setState(s: ConnectionState) {
    this.state = s;
    for (const fn of this.stateListeners) {
      try { fn(s); } catch {}
    }
  }

  private attachXapi(x: XAPI) {
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
    x.on('error', (_err: any) => {
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

  private scheduleReconnect() {
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
      } catch {
        // Keep trying; next attempt will back off further
        this.scheduleReconnect();
      }
    }, delay);
  }
}
