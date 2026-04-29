"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XapiHoverProvider = exports.XapiCompletionProvider = void 0;
exports.getWordRangeAt = getWordRangeAt;
exports.parseXapiContext = parseXapiContext;
exports.registerLanguageFeatures = registerLanguageFeatures;
const vscode = require("vscode");
const SchemaService_1 = require("./SchemaService");
const XAPI_CATEGORIES = ['Command', 'Config', 'Status', 'Event'];
/**
 * Helper function to strip array indices from a path segment.
 * Examples: "Line[1]" -> "Line", "Participant[10]" -> "Participant", "Mute" -> "Mute"
 */
function stripArrayIndex(segment) {
    return segment.replace(/\[\d+\]/g, '');
}
/**
 * Get the word range at a given position, including support for array bracket notation.
 * Works with cursor at any position within the xAPI path (beginning, middle, or end).
 * Supports xAPI paths like: xapi.Status.Audio.Input.Connectors.Line[1].Mute
 *
 * @param document The text document
 * @param position The cursor position (can be anywhere within the xAPI token)
 * @returns The range of the complete xAPI path, or null if not on a valid token
 */
function getWordRangeAt(document, position) {
    const text = document.getText(new vscode.Range(position.line, 0, position.line, Number.MAX_SAFE_INTEGER));
    const idx = position.character;
    // Scan back to whitespace or punctuation, including array brackets and digits
    let start = idx;
    while (start > 0 && /[\w.\[\]0-9]/.test(text[start - 1]))
        start--;
    let end = idx;
    while (end < text.length && /[\w.\[\]0-9]/.test(text[end]))
        end++;
    if (end === start)
        return null;
    return new vscode.Range(position.line, start, position.line, end);
}
/**
 * Parse xAPI context from text, with support for array bracket notation.
 * Strips array indices (e.g., "Line[1]" becomes "Line") for schema lookup while
 * preserving the ability to provide intellisense after array-indexed segments.
 *
 * Examples:
 * - "xapi.Status." -> { category: undefined, completedSegments: [], currentPartial: '' }
 * - "xapi.Command.Audio." -> { category: 'Command', completedSegments: ['Audio'], currentPartial: '' }
 * - "xapi.Status.Audio.Input.Connectors.Line[1]." -> { category: 'Status', completedSegments: ['Audio', 'Input', 'Connectors', 'Line'], currentPartial: '' }
 */
function parseXapiContext(prefixText) {
    const idx = prefixText.lastIndexOf('xapi.');
    if (idx === -1)
        return { found: false, completedSegments: [], currentPartial: '' };
    const after = prefixText.slice(idx + 'xapi.'.length);
    if (after.length === 0) {
        return { found: true, completedSegments: [], currentPartial: '' };
    }
    const parts = after.split('.');
    // If ends with '.' last part will be '' which means no partial for the next child
    const endsWithDot = after.endsWith('.');
    const currentPartial = endsWithDot ? '' : stripArrayIndex(parts[parts.length - 1]);
    const completed = endsWithDot ? parts : parts.slice(0, -1);
    const first = completed[0] ?? (endsWithDot ? parts[0] : undefined);
    const exactCategory = XAPI_CATEGORIES.find(c => c === first);
    if (!first || !exactCategory) {
        // still typing category name
        return {
            found: true,
            categoryPartial: parts[0] || '',
            completedSegments: [],
            currentPartial
        };
    }
    // Strip array indices from completed segments for schema lookup
    // e.g., ["Audio", "Input", "Connectors", "Line[1]"] -> ["Audio", "Input", "Connectors", "Line"]
    const afterCategory = completed.slice(1).map(stripArrayIndex);
    return {
        found: true,
        category: exactCategory,
        completedSegments: afterCategory,
        currentPartial
    };
}
class XapiCompletionProvider {
    constructor(schema) {
        this.schema = schema;
    }
    /**
     * Get the available methods for a given xAPI category.
     * Different categories support different methods on leaf nodes.
     */
    getMethodsForCategory(category) {
        switch (category) {
            case 'Status':
                return [
                    {
                        name: 'get',
                        signature: '(): Promise<any>',
                        description: 'Get the current value of this status.\n\n**Example:**\n```javascript\nxapi.Status.Call[1].Status.get()\n  .then(value => console.log(value));\n```'
                    },
                    {
                        name: 'on',
                        signature: '(callback: (value: any) => void): void',
                        description: 'Subscribe to changes of this status value.\n\n**Example:**\n```javascript\nxapi.Status.Call[1].Status.on(value => {\n  console.log(\'Status changed:\', value);\n});\n```'
                    }
                ];
            case 'Config':
                return [
                    {
                        name: 'get',
                        signature: '(): Promise<any>',
                        description: 'Get the current value of this configuration.\n\n**Example:**\n```javascript\nxapi.Config.Audio.DefaultVolume.get()\n  .then(value => console.log(value));\n```'
                    },
                    {
                        name: 'set',
                        signature: '(value: any): Promise<void>',
                        description: 'Set a new value for this configuration.\n\n**Example:**\n```javascript\nxapi.Config.Audio.DefaultVolume.set(50);\n```'
                    }
                ];
            case 'Event':
                return [
                    {
                        name: 'on',
                        signature: '(callback: (event: any) => void): void',
                        description: 'Subscribe to this event.\n\n**Example:**\n```javascript\nxapi.Event.CallDisconnect.on(event => {\n  console.log(\'Call disconnected:\', event);\n});\n```'
                    }
                ];
            case 'Command':
                // Commands don't have dot methods - they're invoked directly with parameters
                return [];
            default:
                return [];
        }
    }
    async provideCompletionItems(document, position, _token, context) {
        const enableSchemaIntellisense = vscode.workspace.getConfiguration('codec').get('applySchemaToIntellisense', true);
        if (!enableSchemaIntellisense)
            return undefined;
        const lineText = document.lineAt(position.line).text.slice(0, position.character);
        const ctx = parseXapiContext(lineText);
        if (!ctx.found)
            return undefined;
        // Suggest categories when at xapi. or typing the category partially
        if (!ctx.category) {
            const filtered = ctx.categoryPartial
                ? XAPI_CATEGORIES.filter(c => c.toLowerCase().startsWith(ctx.categoryPartial.toLowerCase()))
                : XAPI_CATEGORIES.slice();
            return filtered.map(c => new vscode.CompletionItem(c, vscode.CompletionItemKind.Module));
        }
        // Build node path for completed segments under the category
        // Normalize path segments case-insensitively against schema keys at each depth
        // Array indices have already been stripped by parseXapiContext
        let basePath = ctx.category;
        for (const seg of ctx.completedSegments) {
            const childrenAtLevel = await this.schema.getChildrenMap(basePath);
            if (!childrenAtLevel) {
                basePath = ctx.category;
                break;
            }
            const keys = Object.keys(childrenAtLevel);
            const match = keys.find(k => k.toLowerCase() === seg.toLowerCase());
            basePath = match ? `${basePath}.${match}` : `${basePath}.${seg}`;
        }
        const children = await this.schema.getChildrenMap(basePath);
        if (!children)
            return undefined;
        const items = [];
        // Check if this is a leaf node by looking at whether it has any children
        const childKeys = Object.keys(children);
        const isLeafNode = childKeys.length === 0;
        // If we're at a leaf node, provide method completions based on category
        if (isLeafNode) {
            const methods = this.getMethodsForCategory(ctx.category);
            for (const method of methods) {
                if (ctx.currentPartial && !method.name.toLowerCase().startsWith(ctx.currentPartial.toLowerCase()))
                    continue;
                const ci = new vscode.CompletionItem(method.name, vscode.CompletionItemKind.Method);
                ci.detail = method.signature;
                ci.sortText = `0_${method.name}`; // Methods sort before properties
                if (context?.triggerKind === vscode.CompletionTriggerKind.Invoke) {
                    const doc = new vscode.MarkdownString();
                    doc.appendMarkdown(method.description);
                    ci.documentation = doc;
                }
                items.push(ci);
            }
            return items.length > 0 ? items : undefined;
        }
        // Otherwise, provide property completions from schema
        for (const key of childKeys) {
            if (ctx.currentPartial && !key.toLowerCase().startsWith(ctx.currentPartial.toLowerCase()))
                continue;
            const ci = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field);
            const child = children[key];
            // Only add extra detail when explicitly invoked
            if (context?.triggerKind === vscode.CompletionTriggerKind.Invoke) {
                const detail = child?.kind || child?.type || '';
                ci.detail = String(detail || '');
            }
            ci.sortText = `1_${key}`;
            // Attach documentation only when explicitly invoked (e.g., Ctrl+Space)
            if (context?.triggerKind === vscode.CompletionTriggerKind.Invoke) {
                const meta = child?.attributes || child;
                const desc = meta?.description || meta?.help || '';
                const access = meta?.access ? String(meta.access) : '';
                const roles = Array.isArray(meta?.role) ? meta.role : undefined;
                const params = Array.isArray(meta?.params) ? meta.params : undefined;
                const doc = new vscode.MarkdownString();
                doc.isTrusted = false;
                if (desc)
                    doc.appendMarkdown(`${desc}\n\n`);
                if (access)
                    doc.appendMarkdown(`- **access**: ${access}\n`);
                if (roles && roles.length)
                    doc.appendMarkdown(`- **roles**: ${roles.join(', ')}\n`);
                if (params && params.length) {
                    doc.appendMarkdown(`\n**Parameters**\n\n`);
                    doc.appendMarkdown(`| Name | Required | Default | Type | Values |\n`);
                    doc.appendMarkdown(`|---|---:|---|---|---|\n`);
                    for (const p of params) {
                        const name = p?.name ?? '';
                        const required = p?.required ? 'yes' : 'no';
                        const def = p?.default ?? '';
                        const vs = p?.valuespace || {};
                        let type = vs?.type || '';
                        let values = '';
                        if (Array.isArray(vs?.Values)) {
                            values = vs.Values.join(', ');
                            type = type || 'Literal';
                        }
                        else {
                            const min = vs?.Min, max = vs?.Max, step = vs?.Step;
                            const rangeBits = [
                                min !== undefined ? `min ${min}` : '',
                                max !== undefined ? `max ${max}` : '',
                                step !== undefined ? `step ${step}` : ''
                            ].filter(Boolean).join(', ');
                            if (rangeBits)
                                values = rangeBits;
                        }
                        doc.appendMarkdown(`| ${name} | ${required} | ${def} | ${type} | ${values} |\n`);
                    }
                }
                ci.documentation = doc;
            }
            items.push(ci);
        }
        return items;
    }
}
exports.XapiCompletionProvider = XapiCompletionProvider;
class XapiHoverProvider {
    constructor(schema) {
        this.schema = schema;
    }
    async provideHover(document, position) {
        const allowHover = vscode.workspace.getConfiguration('codec').get('showSchemaHover', false);
        if (!allowHover)
            return undefined;
        const range = getWordRangeAt(document, position);
        if (!range)
            return undefined;
        const prefix = document.getText(new vscode.Range(range.start.line, 0, range.start.line, range.end.character));
        const ctx = parseXapiContext(prefix);
        if (!ctx.found || !ctx.category)
            return undefined;
        // Build path with array indices already stripped by parseXapiContext
        const basePath = ctx.category + (ctx.completedSegments.length ? '.' + ctx.completedSegments.join('.') : '');
        const node = await this.schema.getNodeSchema(basePath);
        if (!node)
            return undefined;
        const meta = node?.attributes || node;
        const desc = meta?.description || meta?.help || '';
        const kind = node?.type || meta?.type || '';
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${basePath}**\n\n`);
        if (kind)
            md.appendMarkdown(`- **kind**: ${kind}\n`);
        if (desc)
            md.appendMarkdown(`${desc}`);
        md.isTrusted = false;
        return new vscode.Hover(md, range);
    }
}
exports.XapiHoverProvider = XapiHoverProvider;
function registerLanguageFeatures(context, schema) {
    const schemaInstance = schema ?? new SchemaService_1.SchemaService(context);
    const selector = [
        { language: 'javascript', scheme: 'codecfs' },
        { language: 'typescript', scheme: 'codecfs' },
        { language: 'javascriptreact', scheme: 'codecfs' },
        { language: 'typescriptreact', scheme: 'codecfs' }
    ];
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, new XapiCompletionProvider(schemaInstance), '.', '"', '\''));
    context.subscriptions.push(vscode.languages.registerHoverProvider(selector, new XapiHoverProvider(schemaInstance)));
}
//# sourceMappingURL=XapiLanguage.js.map