import * as vscode from 'vscode';

type SchemaIndexNode = {
  children: Record<string, SchemaIndexNode>;
  meta?: any; // leaf metadata from latest schema object
  products?: Set<string>; // union of products that include this node
};
type SchemaIndex = {
  Command: SchemaIndexNode;
  Config: SchemaIndexNode;
  Status: SchemaIndexNode;
  Event: SchemaIndexNode;
};

type PersistedIndexV1 = SchemaIndex; // legacy
type PersistedIndexV2 = {
  index: SchemaIndex;
  savedAt: number;
  objectsCount: number;
  leafCount: number;
};

export class SchemaService {
  private indexCache: Map<string, SchemaIndex> = new Map();
  private lastUpdatedMs: number | null = null;
  private latestObjectsCount: number = 0;
  private indexedNodeCount: number = 0;
  private lastError: string | null = null;
  private activeProductInternal: string | null = null;
  private debugIdentifiers: { platform?: string | null; productId?: string | null } = {};

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Fetch the root schema JSON from RoomOS docs and cache by version key.
   * Uses VS Code globalState for persistence across sessions.
   */
  async getRootSchema(versionKey: string = 'latest'): Promise<SchemaIndex | null> {
    const mem = this.indexCache.get(versionKey);
    if (mem) return mem;
    const raw = this.context.globalState.get(this.key(versionKey)) as PersistedIndexV2 | PersistedIndexV1 | undefined;
    if (raw) {
      if (this.isValidIndex((raw as PersistedIndexV1))) {
        const persisted = this.rehydrateIndex(raw as PersistedIndexV1);
        this.indexCache.set(versionKey, persisted);
        const { leafCount } = this.computeIndexStats(persisted);
        this.indexedNodeCount = leafCount;
        this.latestObjectsCount = leafCount;
        // No timestamp in legacy; set to now so UI shows a time instead of '—'
        this.lastUpdatedMs = this.lastUpdatedMs ?? Date.now();
        return persisted;
      }
      const wrapped = raw as PersistedIndexV2;
      if (wrapped && this.isValidIndex(wrapped.index)) {
        const idx = this.rehydrateIndex(wrapped.index);
        this.indexCache.set(versionKey, idx);
        this.indexedNodeCount = wrapped.leafCount || 0;
        this.latestObjectsCount = wrapped.objectsCount || wrapped.leafCount || 0;
        this.lastUpdatedMs = wrapped.savedAt || Date.now();
        return idx;
      }
    }
    try {
      const res = await (globalThis as any).fetch('https://roomos.cisco.com/api/schema/latest');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as any;
      const objects: any[] = Array.isArray(json?.objects) ? json.objects : [];
      this.latestObjectsCount = objects.length;
      const index = this.buildIndexFromLatest(objects);
      this.indexCache.set(versionKey, index);
      const savedAt = Date.now();
      await this.context.globalState.update(this.key(versionKey), {
        index: this.serializeIndex(index),
        savedAt,
        objectsCount: this.latestObjectsCount,
        leafCount: this.indexedNodeCount
      } as PersistedIndexV2);
      this.lastUpdatedMs = savedAt;
      this.lastError = null;
      return index as SchemaIndex;
    } catch (err) {
      const msg = (err as any)?.message || String(err);
      console.warn('[xapi-schema] Failed to fetch schema', err);
      this.lastError = msg;
      // If we previously had an in-memory index, return it; otherwise null
      const fallback = this.indexCache.get(versionKey);
      if (fallback) return fallback;
      return null;
    }
  }

  /**
   * Fetch a node-specific schema, e.g., Command/Macros/Macro/Save
   */
  async getNodeSchema(path: string, versionKey: string = 'latest'): Promise<any | null> {
    const safe = path.replace(/^[.\/]+|[.\/]+$/g, '');
    const root = await this.getRootSchema(versionKey);
    if (!root) return null;
    const node = this.resolveFromIndex(root, safe);
    return node?.meta ?? node ?? null;
  }

  /**
   * Resolve path from a root schema object by traversing child nodes.
   */
  private resolveFromIndex(index: SchemaIndex, dotPath: string): SchemaIndexNode | null {
    const parts = dotPath.split('.').filter(Boolean);
    if (parts.length === 0) return null;
    const top = parts[0] as keyof SchemaIndex;
    const rootNode = (index as any)[top] as SchemaIndexNode | undefined;
    if (!rootNode) return null;
    let node = rootNode;
    for (const seg of parts.slice(1)) {
      const next = node.children[seg];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  private key(versionKey: string): string {
    return `roomos.schema.idx.${versionKey}.v3`;
  }

  /**
   * Return a map of child name -> metadata for a given path (e.g., Command/Macros/Macro)
   */
  async getChildrenMap(path: string): Promise<Record<string, any> | null> {
    const root = await this.getRootSchema();
    if (!root) return null;
    const node = this.resolveFromIndex(root, path);
    if (!node) return null;
    const out: Record<string, any> = {};
    for (const key of Object.keys(node.children)) {
      const child = node.children[key];
      if (this.activeProductInternal && !this.subtreeSupportsProduct(child, this.activeProductInternal)) {
        continue; // filter out nodes not supported by active product
      }
      out[key] = child.meta ?? { children: Object.keys(child.children) };
    }
    return out;
  }

  /** Preload root schema, optionally show progress externally */
  async preload(versionKey: string = 'latest'): Promise<void> {
    await this.getRootSchema(versionKey);
  }

  async refresh(versionKey: string = 'latest'): Promise<void> {
    this.indexCache.delete(versionKey);
    this.lastUpdatedMs = null;
    this.latestObjectsCount = 0;
    this.indexedNodeCount = 0;
    this.lastError = null;
    const res = await this.getRootSchema(versionKey);
    if (res) {
      // Ensure updated timestamp advances even if underlying fetch timestamp equals previous
      this.lastUpdatedMs = Date.now();
    }
  }

  async getStatus(versionKey: string = 'latest'): Promise<{ loaded: boolean; rootKeys: number; cachedNodes: number; lastUpdatedMs: number | null; error?: string | null; activeProduct?: string | null; platform?: string | null; productId?: string | null; }>{
    const root = await this.getRootSchema(versionKey);
    const rootKeys = this.latestObjectsCount;
    return {
      loaded: !!root,
      rootKeys,
      cachedNodes: this.indexedNodeCount,
      lastUpdatedMs: this.lastUpdatedMs,
      error: this.lastError,
      activeProduct: this.activeProductInternal,
      platform: this.debugIdentifiers.platform ?? null,
      productId: this.debugIdentifiers.productId ?? null
    };
  }

  async getRootJson(versionKey: string = 'latest'): Promise<string> {
    const root = await this.getRootSchema(versionKey);
    return JSON.stringify(root ?? {}, null, 2);
  }

  private buildIndexFromLatest(objects: any[]): SchemaIndex {
    const makeNode = (): SchemaIndexNode => ({ children: {}, products: new Set<string>() });
    const index: SchemaIndex = { Command: makeNode(), Config: makeNode(), Status: makeNode(), Event: makeNode() };
    let nodeCount = 0;
    for (const obj of objects) {
      const type = obj?.type as string | undefined;
      const normPath: string | undefined = obj?.normPath;
      const products: string[] = Array.isArray(obj?.products) ? obj.products.map((p: string) => String(p).toLowerCase()) : [];
      if (!type || !normPath) continue;
      const top = type as keyof SchemaIndex;
      if (!index[top]) continue;
      const segments = normPath.split(' ').filter(Boolean);
      let node = index[top];
      for (const seg of segments) {
        if (!node.children[seg]) node.children[seg] = makeNode();
        node = node.children[seg];
        for (const p of products) node.products!.add(p);
      }
      // attach meta at leaf
      node.meta = obj;
      nodeCount++;
    }
    this.indexedNodeCount = nodeCount;
    return index;
  }

  private computeIndexStats(index: SchemaIndex): { leafCount: number } {
    let leafCount = 0;
    const stack: (SchemaIndexNode | undefined)[] = [index.Command, index.Config, index.Status, index.Event];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node.meta) leafCount++;
      for (const key of Object.keys(node.children)) stack.push(node.children[key]);
    }
    return { leafCount };
  }

  private isValidIndex(idx: any): idx is SchemaIndex {
    if (!idx || typeof idx !== 'object') return false;
    for (const key of ['Command', 'Config', 'Status', 'Event']) {
      const node = idx[key];
      if (!node || typeof node !== 'object' || typeof node.children !== 'object') return false;
    }
    return true;
  }

  setActiveProductInternal(code: string | null) {
    this.activeProductInternal = code;
  }

  setDeviceIdentifiers(platform: string | null | undefined, productId: string | null | undefined) {
    this.debugIdentifiers = { platform: platform ?? null, productId: productId ?? null };
  }

  private nodeExcludesProduct(node: SchemaIndexNode, code: string): boolean {
    const metaProducts = (node as any)?.meta?.products as string[] | undefined;
    if (Array.isArray(metaProducts)) {
      const lowered = metaProducts.map(v => String(v).toLowerCase());
      return lowered.length > 0 && lowered.indexOf(code) === -1;
    }
    const p = (node as any).products;
    if (!p) return false; // unknown -> don't exclude
    if (p instanceof Set) return p.size > 0 && !p.has(code);
    if (Array.isArray(p)) return p.length > 0 && p.indexOf(code) === -1;
    return false;
  }

  private subtreeSupportsProduct(node: SchemaIndexNode, code: string): boolean {
    // If aggregated products exist, they are a union of descendants; quick decision
    const p = (node as any).products;
    if (p instanceof Set) return p.size === 0 ? false : p.has(code);
    if (Array.isArray(p)) return p.length === 0 ? false : p.indexOf(code) !== -1;
    // Fallback: inspect leaf meta then children
    const metaProducts = (node as any)?.meta?.products as string[] | undefined;
    if (Array.isArray(metaProducts)) {
      const lowered = metaProducts.map(v => String(v).toLowerCase());
      if (lowered.indexOf(code) !== -1) return true;
    }
    for (const k of Object.keys(node.children)) {
      if (this.subtreeSupportsProduct(node.children[k], code)) return true;
    }
    return false;
  }

  private rehydrateIndex(idx: SchemaIndex): SchemaIndex {
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node.products)) {
        node.products = new Set<string>(node.products);
      }
      if (node.products instanceof Set || node.products === undefined) {
        // ok
      } else if (node.products && typeof node.products === 'object') {
        // Some JSON libs may serialize Set as {} – drop to empty Set
        node.products = new Set<string>();
      }
      const children = node.children || {};
      for (const k of Object.keys(children)) visit(children[k]);
    };
    visit((idx as any).Command);
    visit((idx as any).Config);
    visit((idx as any).Status);
    visit((idx as any).Event);
    return idx;
  }

  private serializeIndex(idx: SchemaIndex): any {
    const cloneNode = (node: SchemaIndexNode): any => {
      const out: any = { children: {} };
      if (node.meta) out.meta = node.meta;
      if (node.products instanceof Set) out.products = Array.from(node.products);
      else if (Array.isArray((node as any).products)) out.products = (node as any).products;
      for (const k of Object.keys(node.children)) out.children[k] = cloneNode(node.children[k]);
      return out;
    };
    return {
      Command: cloneNode(idx.Command),
      Config: cloneNode(idx.Config),
      Status: cloneNode(idx.Status),
      Event: cloneNode(idx.Event)
    };
  }
}


