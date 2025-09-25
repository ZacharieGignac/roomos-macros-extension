"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XapiHoverProvider = exports.XapiCompletionProvider = void 0;
exports.parseXapiContext = parseXapiContext;
exports.registerLanguageFeatures = registerLanguageFeatures;
const vscode = require("vscode");
const SchemaService_1 = require("./SchemaService");
function getWordRangeAt(document, position) {
    const text = document.getText(new vscode.Range(position.line, 0, position.line, Number.MAX_SAFE_INTEGER));
    const idx = position.character;
    // simple scan back to whitespace or punctuation
    let start = idx;
    while (start > 0 && /[\w.]/.test(text[start - 1]))
        start--;
    let end = idx;
    while (end < text.length && /[\w.]/.test(text[end]))
        end++;
    if (end === start)
        return null;
    return new vscode.Range(position.line, start, position.line, end);
}
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
    const currentPartial = endsWithDot ? '' : parts[parts.length - 1];
    const completed = endsWithDot ? parts : parts.slice(0, -1);
    const first = completed[0] ?? (endsWithDot ? parts[0] : undefined);
    const categories = ['Command', 'Config', 'Status', 'Event'];
    const exactCategory = categories.find(c => c === first);
    if (!first || !exactCategory) {
        // still typing category name
        return {
            found: true,
            categoryPartial: parts[0] || '',
            completedSegments: [],
            currentPartial
        };
    }
    const afterCategory = completed.slice(1);
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
            const cats = ['Command', 'Config', 'Status', 'Event'];
            const filtered = ctx.categoryPartial
                ? cats.filter(c => c.toLowerCase().startsWith(ctx.categoryPartial.toLowerCase()))
                : cats;
            return filtered.map(c => new vscode.CompletionItem(c, vscode.CompletionItemKind.Module));
        }
        // Build node path for completed segments under the category
        // Normalize path segments case-insensitively against schema keys at each depth
        let basePath = ctx.category;
        for (const seg of ctx.completedSegments) {
            const childrenAtLevel = await this.schema.getChildrenMap(basePath);
            if (!childrenAtLevel) {
                basePath = ctx.category;
                break;
            }
            const keys = Object.keys(childrenAtLevel);
            const match = keys.find(k => k.toLowerCase() === String(seg).toLowerCase());
            basePath = match ? `${basePath}.${match}` : `${basePath}.${seg}`;
        }
        const children = await this.schema.getChildrenMap(basePath);
        if (!children)
            return undefined;
        const items = [];
        for (const key of Object.keys(children)) {
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
                            const rangeBits = [min !== undefined ? `min ${min}` : '', max !== undefined ? `max ${max}` : '', step !== undefined ? `step ${step}` : ''].filter(Boolean).join(', ');
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
        const prefix = document.getText(new vscode.Range(range.start.line, 0, range.start.character, range.end.character));
        const ctx = parseXapiContext(prefix);
        if (!ctx.found || !ctx.category)
            return undefined;
        const basePath = ctx.category + (ctx.completedSegments.length ? '.' + ctx.completedSegments.join('.') : '');
        const path = basePath;
        const node = await this.schema.getNodeSchema(path);
        if (!node)
            return undefined;
        const title = path;
        const meta = node?.attributes || node;
        const desc = meta?.description || meta?.help || '';
        const kind = node?.type || meta?.type || '';
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${title}**\n\n`);
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