// Validación de formularios de registro y login.
import { describe, expect, it } from 'vitest';
import { passwordStrength, validateLogin, validateRegister } from '../../lib/validation';

describe('validateRegister', () => {
  const valid = {
    username: 'jhon_juega',
    email: 'jhon@correo.com',
    password: 'clave1234',
    confirm: 'clave1234',
    terms: true,
  };

  it('acepta datos válidos', () => {
    expect(validateRegister(valid)).toEqual({});
  });

  it('rechaza un nombre de usuario demasiado corto', () => {
    const errors = validateRegister({ ...valid, username: 'ab' });
    expect(errors.username).toMatch(/3 a 30 caracteres/);
  });

  it('rechaza un correo no válido y dice cómo corregirlo', () => {
    const errors = validateRegister({ ...valid, email: 'no-es-correo' });
    expect(errors.email).toMatch(/correo válido/);
  });

  it('rechaza una contraseña débil (menos de 8 o sin número)', () => {
    expect(validateRegister({ ...valid, password: 'corta', confirm: 'corta' }).password).toMatch(/8 caracteres/);
    expect(validateRegister({ ...valid, password: 'sinnumeros', confirm: 'sinnumeros' }).password).toMatch(/letra y un número/);
  });

  it('rechaza contraseñas que no coinciden', () => {
    const errors = validateRegister({ ...valid, confirm: 'otra1234' });
    expect(errors.confirm).toMatch(/no coinciden/);
  });

  it('exige aceptar las condiciones', () => {
    expect(validateRegister({ ...valid, terms: false }).terms).toMatch(/Acepta las condiciones/);
  });
});

describe('passwordStrength', () => {
  it('clasifica débil, media y fuerte', () => {
    expect(passwordStrength('abc')).toBe('débil');
    expect(passwordStrength('Clave1234')).toBe('media');
    expect(passwordStrength('Clave1234!Segura')).toBe('fuerte');
  });
});

describe('validateLogin', () => {
  it('pide identificador y contraseña', () => {
    const errors = validateLogin('', '');
    expect(errors.identifier).toBeTruthy();
    expect(errors.password).toBeTruthy();
  });

  it('acepta campos con contenido', () => {
    expect(validateLogin('jhon@correo.com', 'clave1234')).toEqual({});
  });
});
