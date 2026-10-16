import { selectExtraCostsByPrecedence } from './extra-cost-precedence';

describe('selectExtraCostsByPrecedence', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const from = new Date('2026-03-01T00:00:00.000Z');

  it('aynı typeCode için product scope group’u ezer; double-count yok', () => {
    const resolved = selectExtraCostsByPrecedence(
      [
        {
          id: 'g-cut',
          extraCostTypeId: 't-cut',
          typeCode: 'CUTTING',
          typeName: 'Kesim',
          typeIsActive: true,
          productGroupId: 'g1',
          productId: null,
          amount: '5.0000',
          calculationMode: 'FIXED',
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        },
        {
          id: 'p-cut',
          extraCostTypeId: 't-cut',
          typeCode: 'CUTTING',
          typeName: 'Kesim',
          typeIsActive: true,
          productGroupId: null,
          productId: 'p1',
          amount: '8.0000',
          calculationMode: 'FIXED',
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        },
        {
          id: 'g-labor',
          extraCostTypeId: 't-labor',
          typeCode: 'LABOR',
          typeName: 'İşçilik',
          typeIsActive: true,
          productGroupId: 'g1',
          productId: null,
          amount: '10.0000',
          calculationMode: 'FIXED',
          effectiveFrom: from,
          effectiveTo: null,
          isActive: true,
        },
      ],
      { productGroupId: 'g1', productId: 'p1', now },
    );
    expect(resolved).toEqual([
      {
        typeCode: 'CUTTING',
        typeName: 'Kesim',
        amount: '8.0000',
        calculationMode: 'FIXED',
        scope: 'PRODUCT',
      },
      {
        typeCode: 'LABOR',
        typeName: 'İşçilik',
        amount: '10.0000',
        calculationMode: 'FIXED',
        scope: 'GROUP',
      },
    ]);
  });
});
