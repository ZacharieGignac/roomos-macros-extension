import * as vscode from 'vscode';
import { SchemaService } from './SchemaService';

function getWordRangeAt(document: vscode.TextDocument, position: vscode.Position): vscode.Range | null {
  const text = document.getText(new vscode.Range(position.line, 0, position.line, Number.MAX_SAFE_INTEGER));
  const idx = position.character;
  // simple scan back to whitespace or punctuation
  let start = idx;
  while (start > 0 && /[\w.]/.test(text[start - 1])) start--;
  let end = idx;
  while (end < text.length && /[\w.]/.test(text[end])) end++;
  if (end === start) return null;
  return new vscode.Range(position.line, start, position.line, end);
}

function parseXapiContext(prefixText: string): {
  found: boolean;
  categoryPartial?: string;
  category?: 'Command' | 'Config' | 'Status' | 'Event';
  completedSegments: string[]; // segments after category that are fully completed (between dots)
  currentPartial: string; // current token being typed (may be empty if ends with dot)
} {
  const idx = prefixText.lastIndexOf('xapi.');
  if (idx === -1) return { found: false, completedSegments: [], currentPartial: '' };
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
  const categories = ['Command', 'Config', 'Status', 'Event'] as const;
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

export class XapiCompletionProvider implements vscode.CompletionItemProvider {
  constructor(private readonly schema: SchemaService) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.CompletionItem[] | undefined> {
    const lineText = document.lineAt(position.line).text.slice(0, position.character);
    const ctx = parseXapiContext(lineText);
    if (!ctx.found) return undefined;

    // Suggest categories when at xapi. or typing the category partially
    if (!ctx.category) {
      const cats = ['Command', 'Config', 'Status', 'Event'];
      const filtered = ctx.categoryPartial
        ? cats.filter(c => c.toLowerCase().startsWith(ctx.categoryPartial!.toLowerCase()))
        : cats;
      return filtered.map(c => new vscode.CompletionItem(c, vscode.CompletionItemKind.Module));
    }

    // Build node path for completed segments under the category
    const basePath = ctx.category + (ctx.completedSegments.length ? '.' + ctx.completedSegments.join('.') : '');
    const children = await this.schema.getChildrenMap(basePath);
    if (!children) return undefined;

    const items: vscode.CompletionItem[] = [];
    for (const key of Object.keys(children)) {
      if (ctx.currentPartial && !key.toLowerCase().startsWith(ctx.currentPartial.toLowerCase())) continue;
      const ci = new vscode.CompletionItem(key, vscode.CompletionItemKind.Field);
      const child = (children as any)[key];
      const detail = child?.kind || child?.type || '';
      ci.detail = String(detail || '');
      ci.sortText = `1_${key}`;
      items.push(ci);
    }
    return items;
  }
}

export class XapiHoverProvider implements vscode.HoverProvider {
  constructor(private readonly schema: SchemaService) {}

  async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const range = getWordRangeAt(document, position);
    if (!range) return undefined;
    const prefix = document.getText(new vscode.Range(range.start.line, 0, range.start.character, range.end.character));
    const ctx = parseXapiContext(prefix);
    if (!ctx.found || !ctx.category) return undefined;
    const basePath = ctx.category + (ctx.completedSegments.length ? '.' + ctx.completedSegments.join('.') : '');
    const path = basePath;
    const node = await this.schema.getNodeSchema(path);
    if (!node) return undefined;
    const title = path;
    const meta = (node as any)?.attributes || node;
    const desc = meta?.description || meta?.help || '';
    const kind = (node as any)?.type || meta?.type || '';
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`**${title}**\n\n`);
    if (kind) md.appendMarkdown(`- **kind**: ${kind}\n`);
    if (desc) md.appendMarkdown(`${desc}`);
    md.isTrusted = false;
    return new vscode.Hover(md, range);
  }
}

export function registerLanguageFeatures(context: vscode.ExtensionContext, schema?: SchemaService): void {
  const schemaInstance = schema ?? new SchemaService(context);
  const selector: vscode.DocumentSelector = [
    { language: 'javascript', scheme: 'codecfs' },
    { language: 'typescript', scheme: 'codecfs' },
    { language: 'javascriptreact', scheme: 'codecfs' },
    { language: 'typescriptreact', scheme: 'codecfs' }
  ];
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(selector, new XapiCompletionProvider(schemaInstance), '.', '"', '\'')
  );
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new XapiHoverProvider(schemaInstance))
  );
}


