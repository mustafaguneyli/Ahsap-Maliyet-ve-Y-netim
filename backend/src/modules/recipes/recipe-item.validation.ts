import { BadRequestException } from '@nestjs/common';

export type RecipeItemYieldMatchInput = {
  recipeItemRawMaterialId: string;
  yieldRawMaterialId: string;
  productSizeWidthMm: number;
  productSizeLengthMm: number;
  yieldPieceWidthMm: number;
  yieldPieceLengthMm: number;
  yieldIsActive: boolean;
  rawMaterialIsActive: boolean;
};

/**
 * Kapı kasası recipe item ↔ production yield eşleşme doğrulaması.
 *
 * 1. recipe_item.raw_material_id === production_yield.raw_material_id
 * 2. yield.piece_width/length_mm === recipe.product_size.width/length_mm
 * 3. production_yield.is_active === true
 * 4. raw_material.is_active === true
 *
 * Yalnızca kapı kasası (door_frame) grubunda çağrılır.
 * Diğer ürün grupları production_yield kullanmak zorunda değildir.
 */
export function assertRecipeItemMatchesYield(input: RecipeItemYieldMatchInput): void {
  if (!input.rawMaterialIsActive) {
    throw new BadRequestException(
      `Ham madde (${input.recipeItemRawMaterialId}) aktif değil. ` +
        'Pasif ham madde kapı kasası reçetesinde kullanılamaz.',
    );
  }

  if (!input.yieldIsActive) {
    throw new BadRequestException(
      `Production yield aktif değil. ` +
        'Kapı kasası reçetesinde yalnızca aktif NET adet kaydı kullanılabilir.',
    );
  }

  if (input.recipeItemRawMaterialId !== input.yieldRawMaterialId) {
    throw new BadRequestException(
      `recipe_item.raw_material_id (${input.recipeItemRawMaterialId}) ile ` +
        `production_yield.raw_material_id (${input.yieldRawMaterialId}) aynı olmalıdır. ` +
        'Yanlış MDF ile eşlenmiş NET adet kullanılamaz.',
    );
  }

  if (
    input.productSizeWidthMm !== input.yieldPieceWidthMm ||
    input.productSizeLengthMm !== input.yieldPieceLengthMm
  ) {
    throw new BadRequestException(
      `production_yield parça ölçüsü (${input.yieldPieceWidthMm}x${input.yieldPieceLengthMm} mm) ` +
        `recipe product_size ile eşleşmelidir (${input.productSizeWidthMm}x${input.productSizeLengthMm} mm). ` +
        'Yanlış ölçüye ait NET adet kabul edilmez.',
    );
  }
}

/**
 * Kapı kasası için productionYieldId zorunluluğu.
 * Global DB constraint değildir; yalnızca door_frame servisi tarafından çağrılır.
 */
export function assertDoorFrameYieldRequired(
  productionYieldId: string | null | undefined,
  sortOrder: number,
): void {
  if (!productionYieldId) {
    throw new BadRequestException(
      `Kapı kasası reçetesi item ${sortOrder}: productionYieldId zorunludur.`,
    );
  }
}

/**
 * Kapı kasası business rule: reçete tam 2 parça içermeli.
 * Global database constraint değildir.
 */
export function assertDoorFrameRecipeItemCount(itemCount: number): void {
  if (itemCount !== 2) {
    throw new BadRequestException(
      `Kapı kasası reçetesi tam 2 parça içermelidir; ${itemCount} parça verildi.`,
    );
  }
}
