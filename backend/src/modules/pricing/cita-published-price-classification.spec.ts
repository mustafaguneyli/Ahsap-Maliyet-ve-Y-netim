import { classifyCitaCommercialWidthBand } from './cita-published-price-classification';

describe('classifyCitaCommercialWidthBand', () => {
  it('golden custom enleri doğru ticari banda sınıflandırır', () => {
    expect(classifyCitaCommercialWidthBand('15')).toEqual({
      displayName: '1–2 cm',
      masterMinWidthMm: 10,
      masterMaxWidthMm: 20,
    });
    expect(classifyCitaCommercialWidthBand('25')).toMatchObject({
      displayName: '1–2 cm',
      masterMinWidthMm: 10,
      masterMaxWidthMm: 20,
    });
    expect(classifyCitaCommercialWidthBand('26')).toMatchObject({
      displayName: '1–2 cm',
    });
    expect(classifyCitaCommercialWidthBand('35')).toMatchObject({
      displayName: '3–4 cm',
      masterMinWidthMm: 30,
      masterMaxWidthMm: 40,
    });
    expect(classifyCitaCommercialWidthBand('47')).toMatchObject({
      displayName: '5–6 cm',
      masterMinWidthMm: 50,
      masterMaxWidthMm: 60,
    });
    expect(classifyCitaCommercialWidthBand('63')).toMatchObject({
      displayName: '5–6 cm',
      masterMinWidthMm: 50,
      masterMaxWidthMm: 60,
    });
    expect(classifyCitaCommercialWidthBand('70')).toMatchObject({
      displayName: '7–8 cm',
      masterMinWidthMm: 70,
      masterMaxWidthMm: 80,
    });
    expect(classifyCitaCommercialWidthBand('85')).toMatchObject({
      displayName: '7–8 cm',
      masterMinWidthMm: 70,
      masterMaxWidthMm: 80,
    });
  });

  it('tolerans sınırlarını Decimal ile kilitler', () => {
    expect(classifyCitaCommercialWidthBand('26')?.displayName).toBe('1–2 cm');
    expect(classifyCitaCommercialWidthBand('26.1')?.displayName).toBe('3–4 cm');
    expect(classifyCitaCommercialWidthBand('46')?.displayName).toBe('3–4 cm');
    expect(classifyCitaCommercialWidthBand('46.1')?.displayName).toBe('5–6 cm');
    expect(classifyCitaCommercialWidthBand('66')?.displayName).toBe('5–6 cm');
    expect(classifyCitaCommercialWidthBand('66.1')?.displayName).toBe('7–8 cm');
    expect(classifyCitaCommercialWidthBand('86')?.displayName).toBe('7–8 cm');
    expect(classifyCitaCommercialWidthBand('86.1')).toBeNull();
    expect(classifyCitaCommercialWidthBand('87')).toBeNull();
    expect(classifyCitaCommercialWidthBand('0')).toBeNull();
  });
});
