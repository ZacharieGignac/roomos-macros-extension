// Types for messages exchanged between the Profiles webview and the extension

export type ProfilesOutMsg =
  // Note: connectionMethod is accepted but currently all connections are treated as WSS due to a temporary SSH bug
  | { type: 'add'; label: string; host: string; username: string; password: string; connectionMethod: 'ssh' | 'wss' }
  | { type: 'setActive'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'update'; originalId: string; updates: { label: string; host: string; username: string; connectionMethod: 'ssh' | 'wss' }; password?: string }
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
  // connectionMethod reflects user selection, but effective transport is WSS for now
  profiles: Array<{ id: string; label: string; host: string; username: string; connectionMethod: 'ssh' | 'wss' }>;
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


