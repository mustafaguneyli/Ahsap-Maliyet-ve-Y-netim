/**
 * Çıta ek maliyet tipi sırası. ExtraCostType CUTTING/LABOR reuse edilir.
 * ExtraCostValue tutarı seed edilmez; kullanıcı group-scope olarak girer.
 */
export const CITA_EXTRA_COST_TYPE_ORDER = ['CUTTING', 'LABOR'] as const;

export type CitaExtraCostTypeCode = (typeof CITA_EXTRA_COST_TYPE_ORDER)[number];
