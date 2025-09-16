import * as vscode from 'vscode';
import type { MacroManager } from '../MacroManager';

export class MacroLogService {
  private unbind: (() => void) | null = null;
  private readonly output: vscode.OutputChannel;

  constructor(channelName: string = 'RoomOS Macro Logs') {
    this.output = vscode.window.createOutputChannel(channelName);
  }

  getChannel(): vscode.OutputChannel { return this.output; }

  bind(manager: MacroManager) {
    if (this.unbind) this.unbind();
    const formatLog = (val: any): string => {
      try {
        if (val && typeof val === 'object' && (val.Message || val.Level || val.Macro)) {
          const tsRaw = typeof val.Timestamp === 'string' ? val.Timestamp : undefined;
          const time = tsRaw ? tsRaw.slice(11, 23) : new Date().toISOString().slice(11, 23);
          const level = String(val.Level || '').toUpperCase();
          const macro = String(val.Macro || '');
          const message = String(val.Message || '').trim();
          const badge = level.includes('ERR') ? '🔴' : level.includes('WARN') ? '🟡' : '🟢';
          const macStr = macro ? `[${macro}]` : '';
          const parts = macStr ? [time, badge, macStr] : [time, badge];
          return `${parts.join(' ')} - ${message}`;
        }
      } catch {}
      return `${typeof val === 'string' ? val : JSON.stringify(val, null, 2)}`;
    };
    const off = manager.onMacroLog((value: any) => {
      const line = formatLog(value);
      this.output.appendLine(line);
    });
    this.unbind = () => { off(); this.unbind = null; };
  }

  dispose() {
    if (this.unbind) this.unbind();
    this.output.dispose();
  }
}


