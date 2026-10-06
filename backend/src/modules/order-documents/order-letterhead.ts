export const ZIRVE_LETTERHEAD = {
  title: 'SİPARİŞ / TALEP FORMU',
  companyName: 'ZİRVE AHŞAP',
  address: 'FEVZİ ÇAKMAK MAH. EHLİBEYT SK.NO 26 KARATAY / KONYA',
  phone: 'TEL. : 0551 119 72 80',
} as const;

export function formatDocumentTitle(documentDateText: string | null): string {
  const dateText = documentDateText?.trim() ?? '';
  if (!dateText) {
    return ZIRVE_LETTERHEAD.title;
  }
  return `${ZIRVE_LETTERHEAD.title}  D.T:${dateText}`;
}
