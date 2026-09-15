/** Doğrulanmış Süpürgelik dekoratif oran kalınlıkları. 8/9/10 mm burada yoktur. */
export const SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES = [12, 14, 18] as const;

export type SupurgelikManagedDecorativeThickness =
  (typeof SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES)[number];

export function isSupurgelikManagedDecorativeThickness(
  thicknessMm: number,
): thicknessMm is SupurgelikManagedDecorativeThickness {
  return (SUPURGELIK_MANAGED_DECORATIVE_THICKNESSES as readonly number[]).includes(
    thicknessMm,
  );
}
