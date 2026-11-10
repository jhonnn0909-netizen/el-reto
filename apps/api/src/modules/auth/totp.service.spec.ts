import { TotpService } from './totp.service';

/**
 * Vectores de prueba RFC 6238 (Apéndice B): secreto ASCII
 * "12345678901234567890", SHA1, 8 dígitos; aquí se comprueban los 6
 * últimos dígitos (los que devuelve un código TOTP de 6 dígitos).
 */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TotpService (RFC 6238, node:crypto)', () => {
  const totp = new TotpService();

  it('genera los códigos de los vectores RFC 6238', () => {
    expect(totp.generateCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(totp.generateCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totp.generateCode(RFC_SECRET, 1_111_111_111_000)).toBe('050471');
    expect(totp.generateCode(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
    expect(totp.generateCode(RFC_SECRET, 2_000_000_000_000)).toBe('279037');
  });

  it('verifica el código exacto y con ±1 paso por desfase de reloj', () => {
    const code = totp.generateCode(RFC_SECRET, 59_000);
    expect(totp.verifyCode(RFC_SECRET, code, 1, 59_000)).toBe(true);
    // Un paso antes y uno después también valen (ventana ±1).
    expect(totp.verifyCode(RFC_SECRET, code, 1, 59_000 + 30_000)).toBe(true);
    expect(totp.verifyCode(RFC_SECRET, code, 1, 59_000 - 30_000)).toBe(true);
    // Dos pasos de distancia ya no.
    expect(totp.verifyCode(RFC_SECRET, code, 1, 59_000 + 60_000)).toBe(false);
  });

  it('rechaza códigos incorrectos o con formato inválido', () => {
    expect(totp.verifyCode(RFC_SECRET, '000000', 1, 59_000)).toBe(false);
    expect(totp.verifyCode(RFC_SECRET, '12345', 1, 59_000)).toBe(false);
    expect(totp.verifyCode(RFC_SECRET, 'abcdef', 1, 59_000)).toBe(false);
  });

  it('codifica y decodifica Base32 sin pérdidas', () => {
    const secret = totp.generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(TotpService.base32Encode(TotpService.base32Decode(secret))).toBe(secret);
    expect(TotpService.base32Decode(RFC_SECRET).toString('ascii')).toBe(
      '12345678901234567890',
    );
  });

  it('construye una URL otpauth válida', () => {
    const url = totp.buildOtpauthUrl(RFC_SECRET, 'jhon');
    expect(url.startsWith('otpauth://totp/El%20Reto:jhon?')).toBe(true);
    expect(url).toContain(`secret=${RFC_SECRET}`);
    expect(url).toContain('issuer=El+Reto');
    expect(url).toContain('digits=6');
    expect(url).toContain('period=30');
  });
});
