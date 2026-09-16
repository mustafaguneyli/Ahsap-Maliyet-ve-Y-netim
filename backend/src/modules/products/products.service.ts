import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ProductGroupSummary = {
  id: string;
  code: string;
  name: string;
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
  constructor(private readonly prisma: PrismaService) {}

  async listActiveGroups(): Promise<{ items: ProductGroupSummary[] }> {
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
        isActive: group.isActive,
        activeProductCount: group.products.length,
        products: group.products,
      })),
    };
  }
}
