import { SchemaService } from '../SchemaService';

type Parsed = {
  found: boolean;
  categoryPartial?: string;
  category?: 'Command' | 'Config' | 'Status' | 'Event';
  completedSegments: string[];
  currentPartial: string;
};

export class SchemaPathResolver {
  constructor(private readonly schema: SchemaService) {}

  async resolveBasePath(ctx: Parsed): Promise<string | null> {
    if (!ctx?.found || !ctx?.category) return null;
    let basePath: string = ctx.category;
    for (const seg of ctx.completedSegments) {
      const children = await this.schema.getChildrenMap(basePath);
      if (!children) break;
      const keys = Object.keys(children);
      const match = keys.find(k => k.toLowerCase() === String(seg).toLowerCase());
      basePath = match ? `${basePath}.${match}` : `${basePath}.${seg}`;
    }
    return basePath;
  }

  async resolveIncludingUniquePartial(ctx: Parsed): Promise<string | null> {
    const base = await this.resolveBasePath(ctx);
    if (!base) return null;
    if (ctx.currentPartial) {
      const children = await this.schema.getChildrenMap(base);
      if (children) {
        const keys = Object.keys(children);
        const exact = keys.find(k => k.toLowerCase() === String(ctx.currentPartial).toLowerCase());
        const matches = keys.filter(k => k.toLowerCase().startsWith(String(ctx.currentPartial).toLowerCase()));
        const chosen = exact || (matches.length === 1 ? matches[0] : undefined);
        if (chosen) return `${base}.${chosen}`;
      }
    }
    return base;
  }
}


