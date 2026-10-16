import { Injectable, Optional } from '@nestjs/common';
import { currentCatalogCache, withCatalogCache } from '../../data-store/firestore-catalog-cache';
import { DataStoreConfig } from '../../data-store/data-store.config';
import { FirestoreDocumentStore } from '../../data-store/firestore.document-store';
import { PrismaService } from '../../prisma/prisma.service';

export type ProductGroupSummary = {
  id: string;
  code: string;
  name: string;
  calculatorType: string;
  isActive: boolean;
  activeProductCount: number;
  products: Array<{
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  }>;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly dataStore?: DataStoreConfig,
    @Optional() private readonly firestoreStore?: FirestoreDocumentStore,
  ) {}

  async listActiveGroups(): Promise<{ items: ProductGroupSummary[] }> {
    if (this.dataStore?.isFirestore() && this.firestoreStore) {
      return withCatalogCache(this.firestoreStore, () => this.listActiveGroupsFromCache());
    }
    const groups = await this.prisma.productGroup.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    return {
      items: groups.map((group) => ({
        id: group.id,
        code: group.code,
        name: group.name,
        calculatorType: group.calculatorType,
        isActive: group.isActive,
        activeProductCount: group.products.length,
        products: group.products,
      })),
    };
  }

  private listActiveGroupsFromCache(): { items: ProductGroupSummary[] } {
    const cache = currentCatalogCache();
    if (!cache) {
      return { items: [] };
    }
    const groups = cache
      .activeGroups()
      .slice()
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'));
    return {
      items: groups.map((group) => {
        const products = cache
          .productsByGroup(String(group.id))
          .slice()
          .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'))
          .map((product) => ({
            id: String(product.id),
            code: String(product.code),
            name: String(product.name),
            isActive: product.isActive === true,
          }));
        return {
          id: String(group.id),
          code: String(group.code),
          name: String(group.name),
          calculatorType: String(group.calculatorType),
          isActive: true,
          activeProductCount: products.length,
          products,
        };
      }),
    };
  }
}
