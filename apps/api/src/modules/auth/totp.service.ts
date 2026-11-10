import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';

/**
 * TOTP (RFC 6238) implementado con `node:crypto`, sin librerías nuevas.
 * - Algoritmo HMAC-SHA1, 6 dígitos, paso de 30 s (compatible con Google
 *   Authenticator, Authy y similares).
 * - La verificación acepta ±1 paso por desfase de reloj (doc 05 §11.2).
 * - El secreto se guarda en Base32 (RFC 4648) y se muestra una sola vez
 *   en el momento de la activación; nunca se registra en logs.
 */
@Injectable()
export class TotpService {
  private static readonly ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  private static readonly STEP_SECONDS = 30;
  private static readonly DIGITS = 6;

  /** Genera un secreto Base32 nuevo (20 bytes = 160 bits). */
  generateSecret(byteLength = 20): string {
    return TotpService.base32Encode(randomBytes(byteLength));
  }

  /** URL otpauth:// para el código QR de la app autenticadora. */
  buildOtpauthUrl(secret: string, username: string, issuer = 'El Reto'): string {
    const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(username)}`;
    const params = new URLSearchParams({
      secret,
      issuer,
      algorithm: 'SHA1',
      digits: String(TotpService.DIGITS),
      period: String(TotpService.STEP_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  /** Código TOTP de 6 dígitos para un instante dado. */
  generateCode(secret: string, timeMs: number = Date.now()): string {
    const key = TotpService.base32Decode(secret);
    // El contador RFC 6238 nunca es negativo (instantes antes de la época).
    const counter = Math.max(0, Math.floor(timeMs / 1000 / TotpService.STEP_SECONDS));
    const message = Buffer.alloc(8);
    // Contador de 64 bits big-endian (los 4 primeros bytes son 0).
    message.writeUInt32BE(0, 0);
    message.writeUInt32BE(counter, 4);
    const hmac = createHmac('sha1', key).update(message).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    const code = binary % 10 ** TotpService.DIGITS;
    return String(code).padStart(TotpService.DIGITS, '0');
  }

  /**
   * Verifica un código aceptando `window` pasos antes y después.
   * La comparación usa el valor numérico normalizado (códigos con ceros
   * a la izquierda, p. ej. "005924", son válidos).
   */
  verifyCode(
    secret: string,
    code: string,
    window = 1,
    timeMs: number = Date.now(),
  ): boolean {
    if (!/^\d{6}$/.test(code)) {
      return false;
    }
    const stepMs = TotpService.STEP_SECONDS * 1000;
    for (let offset = -window; offset <= window; offset++) {
      if (this.generateCode(secret, timeMs + offset * stepMs) === code) {
        return true;
      }
    }
    return false;
  }

  static base32Encode(buffer: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        output += TotpService.ALPHABET[(value >>> bits) & 31];
      }
    }
    if (bits > 0) {
      output += TotpService.ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
  }

  static base32Decode(input: string): Buffer {
    const cleaned = input.replace(/[\s=]/g, '').toUpperCase();
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of cleaned) {
      const index = TotpService.ALPHABET.indexOf(char);
      if (index === -1) {
        throw new Error('Secreto Base32 inválido');
      }
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        bytes.push((value >>> bits) & 0xff);
      }
    }
    return Buffer.from(bytes);
  }
}
