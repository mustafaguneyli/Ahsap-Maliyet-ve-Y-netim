const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const orders = await p.orderDocument.count();
  const audit = await p.auditEvent.count();
  const activeYields = await p.productionYield.count({ where: { isActive: true } });
  const prices = await p.rawMaterialPrice.count();
  console.log(JSON.stringify({ orders, audit, activeYields, prices }));
  await p.$disconnect();
})();
