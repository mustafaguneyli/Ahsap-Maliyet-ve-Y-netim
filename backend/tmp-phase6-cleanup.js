const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const rows = await p.orderDocument.findMany({
    where: {
      OR: [
        { customerName: { startsWith: 'TEST AŞAMA6' } },
        { customerName: { startsWith: 'TEST AŞAMA5' } },
      ],
    },
    select: { id: true, orderNumber: true, customerName: true },
  });
  console.log('FOUND', rows);
  for (const o of rows.filter((r) => r.customerName.startsWith('TEST AŞAMA6'))) {
    await p.orderMaterialLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderLine.deleteMany({ where: { orderDocumentId: o.id } });
    await p.orderDocument.delete({ where: { id: o.id } });
    console.log('deleted', o.orderNumber);
  }
  console.log(
    'LEFT',
    await p.orderDocument.findMany({
      select: { orderNumber: true, customerName: true },
    }),
  );
  console.log('SOURCE', {
    prices: await p.rawMaterialPrice.count(),
    yields: await p.productionYield.count(),
    pricing: await p.pricingSetting.count(),
    audit: await p.auditEvent.count(),
  });
  const seq = await p.$queryRawUnsafe(
    'SELECT last_value FROM order_document_number_seq',
  );
  console.log('SEQ', String(seq[0].last_value));

  const pdfDir = 'tmp-a5-pdf';
  if (fs.existsSync(pdfDir)) {
    const files = fs.readdirSync(pdfDir).filter((f) => f.endsWith('.pdf'));
    console.log('PDF_FILES', files.join(','));
    for (const f of files.slice(0, 2)) {
      const buf = fs.readFileSync(`${pdfDir}/${f}`);
      const text = buf.toString('latin1');
      const re =
        /\/MediaBox\s*\[\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\]/g;
      let m;
      const sizes = [];
      while ((m = re.exec(text))) {
        sizes.push(
          `${(((+m[3] - +m[1]) * 25.4) / 72).toFixed(2)}x${(((+m[4] - +m[2]) * 25.4) / 72).toFixed(2)}mm`,
        );
      }
      console.log(f, sizes.join(' | '));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
