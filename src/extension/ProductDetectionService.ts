import type { MacroManager } from '../MacroManager';
import { SchemaService } from '../SchemaService';
import { isKnownInternalCode, resolveInternalProductCode } from '../products';

export class ProductDetectionService {
  constructor(private readonly schema: SchemaService) {}

  async setActiveProductFromCodec(manager: MacroManager | null | undefined): Promise<void> {
    try {
      if (!manager || !(manager as any).xapi) return;
      let code: string | null = null;
      let platformRaw: string | null = null;
      let productIdRaw: string | null = null;
      try {
        const platform = await (manager as any).xapi.Status.SystemUnit.ProductPlatform.get();
        if (typeof platform === 'string' && platform.trim().length > 0) {
          platformRaw = platform.trim();
          const platLower = platformRaw.toLowerCase().replace(/\s+/g, '_');
          if (isKnownInternalCode(platLower)) {
            code = platLower;
          } else {
            code = resolveInternalProductCode(platformRaw);
          }
        }
      } catch {}
      if (!code) {
        const productId = await (manager as any).xapi.Status.SystemUnit.ProductId.get();
        if (typeof productId === 'string' && productId.trim().length > 0) {
          productIdRaw = productId.trim();
          code = resolveInternalProductCode(productIdRaw);
        }
      }
      this.schema.setActiveProductInternal(code);
      try {
        (this.schema as any).setDeviceIdentifiers?.(platformRaw, productIdRaw);
      } catch {}
    } catch {}
  }
}


