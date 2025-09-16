import * as vscode from 'vscode';

export class CodecConfig {
  private get cfg() { return vscode.workspace.getConfiguration('codec'); }

  get autoRestartOnSave(): boolean { return this.cfg.get<boolean>('autoRestartOnSave', false); }
  set autoRestartOnSave(v: boolean) { this.cfg.update('autoRestartOnSave', !!v, vscode.ConfigurationTarget.Global); }

  get autoRestartOnActivateDeactivate(): boolean { return this.cfg.get<boolean>('autoRestartOnActivateDeactivate', false); }
  set autoRestartOnActivateDeactivate(v: boolean) { this.cfg.update('autoRestartOnActivateDeactivate', !!v, vscode.ConfigurationTarget.Global); }

  get confirmMacroDelete(): boolean { return this.cfg.get<boolean>('confirmMacroDelete', true); }
  set confirmMacroDelete(v: boolean) { this.cfg.update('confirmMacroDelete', !!v, vscode.ConfigurationTarget.Global); }

  get confirmFrameworkRestart(): boolean { return this.cfg.get<boolean>('confirmFrameworkRestart', true); }
  set confirmFrameworkRestart(v: boolean) { this.cfg.update('confirmFrameworkRestart', !!v, vscode.ConfigurationTarget.Global); }

  get applySchemaToIntellisense(): boolean { return this.cfg.get<boolean>('applySchemaToIntellisense', true); }
  set applySchemaToIntellisense(v: boolean) { this.cfg.update('applySchemaToIntellisense', !!v, vscode.ConfigurationTarget.Global); }

  get forcedProduct(): string { return this.cfg.get<string>('forcedProduct', 'auto') || 'auto'; }
  async setForcedProduct(value: string) { await this.cfg.update('forcedProduct', value, vscode.ConfigurationTarget.Global); }
}


