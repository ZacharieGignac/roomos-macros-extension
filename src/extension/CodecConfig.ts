import * as vscode from 'vscode';

export class CodecConfig {
  private get cfg() { return vscode.workspace.getConfiguration('codec'); }

  get autoRestartOnSave(): boolean { return this.cfg.get<boolean>('autoRestartOnSave', false); }
  async setAutoRestartOnSave(v: boolean): Promise<void> { await this.cfg.update('autoRestartOnSave', !!v, vscode.ConfigurationTarget.Global); }

  get autoRestartOnActivateDeactivate(): boolean { return this.cfg.get<boolean>('autoRestartOnActivateDeactivate', false); }
  async setAutoRestartOnActivateDeactivate(v: boolean): Promise<void> { await this.cfg.update('autoRestartOnActivateDeactivate', !!v, vscode.ConfigurationTarget.Global); }

  get confirmMacroDelete(): boolean { return this.cfg.get<boolean>('confirmMacroDelete', true); }
  async setConfirmMacroDelete(v: boolean): Promise<void> { await this.cfg.update('confirmMacroDelete', !!v, vscode.ConfigurationTarget.Global); }

  get confirmFrameworkRestart(): boolean { return this.cfg.get<boolean>('confirmFrameworkRestart', true); }
  async setConfirmFrameworkRestart(v: boolean): Promise<void> { await this.cfg.update('confirmFrameworkRestart', !!v, vscode.ConfigurationTarget.Global); }

  get applySchemaToIntellisense(): boolean { return this.cfg.get<boolean>('applySchemaToIntellisense', true); }
  async setApplySchemaToIntellisense(v: boolean): Promise<void> { await this.cfg.update('applySchemaToIntellisense', !!v, vscode.ConfigurationTarget.Global); }

  get forcedProduct(): string { return this.cfg.get<string>('forcedProduct', 'auto') || 'auto'; }
  async setForcedProduct(value: string) { await this.cfg.update('forcedProduct', value, vscode.ConfigurationTarget.Global); }
}


