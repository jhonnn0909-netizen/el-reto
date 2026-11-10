// Validadores de formularios (antes vivían en las páginas; Next.js no
// admite exportaciones extra en archivos de página).
export function validateRegister(data: {
  username: string;
  email: string;
  password: string;
  confirm: string;
  terms: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(data.username)) {
    errors.username = 'Escribe un nombre de usuario de 3 a 30 caracteres, solo con letras, números, _ y .';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Escribe un correo válido, por ejemplo, nombre@correo.com.';
  }
  if (data.password.length < 8 || !/[A-Za-z]/.test(data.password) || !/[0-9]/.test(data.password)) {
    errors.password = 'Usa al menos 8 caracteres, con una letra y un número.';
  }
  if (data.confirm !== data.password) {
    errors.confirm = 'Las contraseñas no coinciden. Escríbelas igual en los dos campos.';
  }
  if (!data.terms) {
    errors.terms = 'Acepta las condiciones de uso y la política de privacidad para crear tu cuenta.';
  }
  return errors;
}

export function passwordStrength(password: string): 'débil' | 'media' | 'fuerte' {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return 'débil';
  if (score <= 3) return 'media';
  return 'fuerte';
}

export function validateLogin(identifier: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (identifier.trim().length === 0) errors.identifier = 'Escribe tu correo o tu nombre de usuario.';
  if (password.length === 0) errors.password = 'Escribe tu contraseña.';
  return errors;
}
