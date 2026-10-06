const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

async function main() {
  const counts = {
    orders: await p.orderDocument.count(),
    lines: await p.orderLine.count(),
    materials: await p.orderMaterialLine.count(),
    prices: await p.rawMaterialPrice.count(),
    yields: await p.productionYield.count(),
    pricing: await p.pricingSetting.count(),
    audit: await p.auditEvent.count(),
  };
  console.log('BASELINE', JSON.stringify(counts));
  const orders = await p.orderDocument.findMany({
    select: { id: true, orderNumber: true, customerName: true },
    orderBy: { orderNumber: 'asc' },
  });
  console.log('ORDERS', JSON.stringify(orders));
  const seq = await p.$queryRawUnsafe(
    'SELECT last_value, is_called FROM order_document_number_seq',
  );
  console.log('SEQ', String(seq[0].last_value), seq[0].is_called);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
