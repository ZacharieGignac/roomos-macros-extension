import * as vscode from 'vscode';
import type { MacroManager } from '../MacroManager';

type ConnectionState = ReturnType<MacroManager['getState']>;

export class StatusBarService {
  private statusBar: vscode.StatusBarItem;
  private unbind: (() => void) | null = null;

  constructor() {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBar.name = 'RoomOS Macros';
    this.statusBar.command = 'ciscoCodec.manageProfiles';
    this.statusBar.text = '$(debug-disconnect) RoomOS: Disconnected';
    this.statusBar.tooltip = 'Manage codec profiles';
    this.statusBar.show();
  }

  bind(manager: MacroManager, host: string) {
    if (this.unbind) this.unbind();
    const update = () => this.updateFromState(manager.getState(), host);
    update();
    const off = manager.onStateChange(() => update());
    this.unbind = () => {
      off();
      this.unbind = null;
    };
  }

  private updateFromState(state: ConnectionState, host: string) {
    const setConnectedContext = (connected: boolean) => {
      vscode.commands.executeCommand('setContext', 'codec.connected', connected);
    };
    if (state === 'ready') {
      this.statusBar.text = '$(check) RoomOS: Connected';
      this.statusBar.tooltip = `Connected to ${host}`;
      setConnectedContext(true);
    } else if (state === 'connecting') {
      this.statusBar.text = '$(sync~spin) RoomOS: Connecting…';
      this.statusBar.tooltip = `Connecting to ${host}`;
      setConnectedContext(false);
    } else if (state === 'reconnecting') {
      this.statusBar.text = '$(sync~spin) RoomOS: Reconnecting…';
      this.statusBar.tooltip = `Reconnecting to ${host}`;
      setConnectedContext(false);
    } else if (state === 'disconnected') {
      this.statusBar.text = '$(debug-disconnect) RoomOS: Disconnected';
      this.statusBar.tooltip = 'Manage codec profiles';
      setConnectedContext(false);
    } else if (state === 'error') {
      this.statusBar.text = '$(error) RoomOS: Error';
      this.statusBar.tooltip = `Connection error for ${host}`;
      setConnectedContext(false);
    } else {
      this.statusBar.text = '$(gear) RoomOS';
      this.statusBar.tooltip = 'RoomOS Macros';
      setConnectedContext(false);
    }
  }

  dispose() {
    if (this.unbind) this.unbind();
    this.statusBar.dispose();
  }
}


