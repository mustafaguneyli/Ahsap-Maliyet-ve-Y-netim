import { classifyCitaCommercialWidthBand } from './cita-published-price-classification';

describe('classifyCitaCommercialWidthBand', () => {
  it('golden custom enleri doğru ticari banda sınıflandırır', () => {
    expect(classifyCitaCommercialWidthBand('15')).toEqual({
      displayName: '1–2 cm',
      masterMinWidthMm: 10,
      masterMaxWidthMm: 20,
    });
    expect(classifyCitaCommercialWidthBand('25')).toMatchObject({
      displayName: '3–4 cm',
      masterMinWidthMm: 30,
      masterMaxWidthMm: 40,
    });
    expect(classifyCitaCommercialWidthBand('35')).toMatchObject({
      displayName: '3–4 cm',
    });
    expect(classifyCitaCommercialWidthBand('47')).toMatchObject({
      displayName: '5–6 cm',
      masterMinWidthMm: 50,
      masterMaxWidthMm: 60,
    });
    expect(classifyCitaCommercialWidthBand('63')).toMatchObject({
      displayName: '7–8 cm',
      masterMinWidthMm: 70,
      masterMaxWidthMm: 80,
    });
  });

  it('sınır değerleri Decimal ile kilitler', () => {
    expect(classifyCitaCommercialWidthBand('20')?.displayName).toBe('1–2 cm');
    expect(classifyCitaCommercialWidthBand('20.1')?.displayName).toBe('3–4 cm');
    expect(classifyCitaCommercialWidthBand('40')?.displayName).toBe('3–4 cm');
    expect(classifyCitaCommercialWidthBand('40.1')?.displayName).toBe('5–6 cm');
    expect(classifyCitaCommercialWidthBand('60')?.displayName).toBe('5–6 cm');
    expect(classifyCitaCommercialWidthBand('60.1')?.displayName).toBe('7–8 cm');
    expect(classifyCitaCommercialWidthBand('80')?.displayName).toBe('7–8 cm');
    expect(classifyCitaCommercialWidthBand('80.1')).toBeNull();
    expect(classifyCitaCommercialWidthBand('85')).toBeNull();
  });
});
