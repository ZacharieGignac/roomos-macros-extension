"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchemaService = void 0;
class SchemaService {
    constructor(context) {
        this.context = context;
        this.indexCache = new Map();
        this.lastUpdatedMs = null;
        this.latestObjectsCount = 0;
        this.indexedNodeCount = 0;
        this.lastError = null;
        this.activeProductInternal = null;
        this.debugIdentifiers = {};
    }
    /**
     * Fetch the root schema JSON from RoomOS docs and cache by version key.
     * Uses VS Code globalState for persistence across sessions.
     */
    async getRootSchema(versionKey = 'latest') {
        const mem = this.indexCache.get(versionKey);
        if (mem)
            return mem;
        const raw = this.context.globalState.get(this.key(versionKey));
        if (raw) {
            if (this.isValidIndex(raw)) {
                const persisted = this.rehydrateIndex(raw);
                this.indexCache.set(versionKey, persisted);
                const { leafCount } = this.computeIndexStats(persisted);
                this.indexedNodeCount = leafCount;
                this.latestObjectsCount = leafCount;
                // No timestamp in legacy; set to now so UI shows a time instead of '—'
                this.lastUpdatedMs = this.lastUpdatedMs ?? Date.now();
                return persisted;
            }
            const wrapped = raw;
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
            const res = await globalThis.fetch('https://roomos.cisco.com/api/schema/latest');
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const json = (await res.json());
            const objects = Array.isArray(json?.objects) ? json.objects : [];
            this.latestObjectsCount = objects.length;
            const index = this.buildIndexFromLatest(objects);
            this.indexCache.set(versionKey, index);
            const savedAt = Date.now();
            await this.context.globalState.update(this.key(versionKey), {
                index: this.serializeIndex(index),
                savedAt,
                objectsCount: this.latestObjectsCount,
                leafCount: this.indexedNodeCount
            });
            this.lastUpdatedMs = savedAt;
            this.lastError = null;
            return index;
        }
        catch (err) {
            const msg = err?.message || String(err);
            console.warn('[xapi-schema] Failed to fetch schema', err);
            this.lastError = msg;
            // If we previously had an in-memory index, return it; otherwise null
            const fallback = this.indexCache.get(versionKey);
            if (fallback)
                return fallback;
            return null;
        }
    }
    /**
     * Fetch a node-specific schema, e.g., Command/Macros/Macro/Save
     */
    async getNodeSchema(path, versionKey = 'latest') {
        const safe = path.replace(/^[.\/]+|[.\/]+$/g, '');
        const root = await this.getRootSchema(versionKey);
        if (!root)
            return null;
        const node = this.resolveFromIndex(root, safe);
        return node?.meta ?? node ?? null;
    }
    /**
     * Resolve path from a root schema object by traversing child nodes.
     */
    resolveFromIndex(index, dotPath) {
        const parts = dotPath.split('.').filter(Boolean);
        if (parts.length === 0)
            return null;
        const top = parts[0];
        const rootNode = index[top];
        if (!rootNode)
            return null;
        let node = rootNode;
        for (const seg of parts.slice(1)) {
            const next = node.children[seg];
            if (!next)
                return null;
            node = next;
        }
        return node;
    }
    key(versionKey) {
        return `roomos.schema.idx.${versionKey}.v3`;
    }
    /**
     * Return a map of child name -> metadata for a given path (e.g., Command/Macros/Macro)
     */
    async getChildrenMap(path) {
        const root = await this.getRootSchema();
        if (!root)
            return null;
        const node = this.resolveFromIndex(root, path);
        if (!node)
            return null;
        const out = {};
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
    async preload(versionKey = 'latest') {
        await this.getRootSchema(versionKey);
    }
    async refresh(versionKey = 'latest') {
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
    async getStatus(versionKey = 'latest') {
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
    async getRootJson(versionKey = 'latest') {
        const root = await this.getRootSchema(versionKey);
        return JSON.stringify(root ?? {}, null, 2);
    }
    buildIndexFromLatest(objects) {
        const makeNode = () => ({ children: {}, products: new Set() });
        const index = { Command: makeNode(), Config: makeNode(), Status: makeNode(), Event: makeNode() };
        let nodeCount = 0;
        for (const obj of objects) {
            const type = obj?.type;
            const normPath = obj?.normPath;
            const products = Array.isArray(obj?.products) ? obj.products.map((p) => String(p).toLowerCase()) : [];
            if (!type || !normPath)
                continue;
            const top = type;
            if (!index[top])
                continue;
            const segments = normPath.split(' ').filter(Boolean);
            let node = index[top];
            for (const seg of segments) {
                if (!node.children[seg])
                    node.children[seg] = makeNode();
                node = node.children[seg];
                for (const p of products)
                    node.products.add(p);
            }
            // attach meta at leaf
            node.meta = obj;
            nodeCount++;
        }
        this.indexedNodeCount = nodeCount;
        return index;
    }
    computeIndexStats(index) {
        let leafCount = 0;
        const stack = [index.Command, index.Config, index.Status, index.Event];
        while (stack.length) {
            const node = stack.pop();
            if (!node)
                continue;
            if (node.meta)
                leafCount++;
            for (const key of Object.keys(node.children))
                stack.push(node.children[key]);
        }
        return { leafCount };
    }
    isValidIndex(idx) {
        if (!idx || typeof idx !== 'object')
            return false;
        for (const key of ['Command', 'Config', 'Status', 'Event']) {
            const node = idx[key];
            if (!node || typeof node !== 'object' || typeof node.children !== 'object')
                return false;
        }
        return true;
    }
    setActiveProductInternal(code) {
        this.activeProductInternal = code;
    }
    setDeviceIdentifiers(platform, productId) {
        this.debugIdentifiers = { platform: platform ?? null, productId: productId ?? null };
    }
    nodeExcludesProduct(node, code) {
        const metaProducts = node?.meta?.products;
        if (Array.isArray(metaProducts)) {
            const lowered = metaProducts.map(v => String(v).toLowerCase());
            return lowered.length > 0 && lowered.indexOf(code) === -1;
        }
        const p = node.products;
        if (!p)
            return false; // unknown -> don't exclude
        if (p instanceof Set)
            return p.size > 0 && !p.has(code);
        if (Array.isArray(p))
            return p.length > 0 && p.indexOf(code) === -1;
        return false;
    }
    subtreeSupportsProduct(node, code) {
        // If aggregated products exist, they are a union of descendants; quick decision
        const p = node.products;
        if (p instanceof Set)
            return p.size === 0 ? false : p.has(code);
        if (Array.isArray(p))
            return p.length === 0 ? false : p.indexOf(code) !== -1;
        // Fallback: inspect leaf meta then children
        const metaProducts = node?.meta?.products;
        if (Array.isArray(metaProducts)) {
            const lowered = metaProducts.map(v => String(v).toLowerCase());
            if (lowered.indexOf(code) !== -1)
                return true;
        }
        for (const k of Object.keys(node.children)) {
            if (this.subtreeSupportsProduct(node.children[k], code))
                return true;
        }
        return false;
    }
    rehydrateIndex(idx) {
        const visit = (node) => {
            if (!node || typeof node !== 'object')
                return;
            if (Array.isArray(node.products)) {
                node.products = new Set(node.products);
            }
            if (node.products instanceof Set || node.products === undefined) {
                // ok
            }
            else if (node.products && typeof node.products === 'object') {
                // Some JSON libs may serialize Set as {} – drop to empty Set
                node.products = new Set();
            }
            const children = node.children || {};
            for (const k of Object.keys(children))
                visit(children[k]);
        };
        visit(idx.Command);
        visit(idx.Config);
        visit(idx.Status);
        visit(idx.Event);
        return idx;
    }
    serializeIndex(idx) {
        const cloneNode = (node) => {
            const out = { children: {} };
            if (node.meta)
                out.meta = node.meta;
            if (node.products instanceof Set)
                out.products = Array.from(node.products);
            else if (Array.isArray(node.products))
                out.products = node.products;
            for (const k of Object.keys(node.children))
                out.children[k] = cloneNode(node.children[k]);
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
exports.SchemaService = SchemaService;
//# sourceMappingURL=SchemaService.js.map