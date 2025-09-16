// Types for messages exchanged between the Profiles webview and the extension

export type ProfilesOutMsg =
  | { type: 'add'; label: string; host: string; username: string; password: string }
  | { type: 'setActive'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'update'; originalId: string; updates: { label: string; host: string; username: string }; password?: string }
  | { type: 'setAutoRestart'; value: boolean }
  | { type: 'setAutoRestartOnActivateDeactivate'; value: boolean }
  | { type: 'refreshSchema' }
  | { type: 'showSchemaJson' }
  | { type: 'setConfirmMacroDelete'; value: boolean }
  | { type: 'setConfirmFrameworkRestart'; value: boolean }
  | { type: 'setForcedProduct'; value: string }
  | { type: 'setApplySchema'; value: boolean };

export type KnownProduct = { code: string; label: string };

export type ProfilesInState = {
  profiles: Array<{ id: string; label: string; host: string; username: string }>;
  activeId?: string;
  autoRestart: boolean;
  autoRestartOnActivateDeactivate: boolean;
  applySchema: boolean;
  schemaStatus: any;
  confirmMacroDelete: boolean;
  confirmFrameworkRestart: boolean;
  forcedProduct: string;
  knownProducts: KnownProduct[];
};

export type ProfilesInMsg = { type: 'state'; } & ProfilesInState;


