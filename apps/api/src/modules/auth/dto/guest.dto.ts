import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** POST /auth/guest (CONTRACTS.md §9.2): solo un nombre visible. */
export class GuestDto {
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres.' })
  @MaxLength(30, { message: 'El nombre debe tener como máximo 30 caracteres.' })
  displayName!: string;
}

/** POST /auth/convert-guest (CONTRACTS.md §9.2). */
export class ConvertGuestDto {
  @IsString()
  @MinLength(3, { message: 'El nombre de usuario debe tener al menos 3 caracteres.' })
  @MaxLength(30, { message: 'El nombre de usuario debe tener como máximo 30 caracteres.' })
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'El nombre de usuario solo puede contener letras, números, _ y .',
  })
  username!: string;

  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña debe tener como máximo 128 caracteres.' })
  password!: string;
}

/** POST /auth/mfa/verify y POST /auth/mfa/login: código TOTP de 6 dígitos. */
export class MfaVerifyDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos.' })
  code!: string;
}

/** POST /auth/mfa/login: desafío MFA emitido por /auth/login + código TOTP. */
export class MfaLoginDto {
  @IsString()
  @MinLength(1, { message: 'El token MFA es obligatorio.' })
  mfaToken!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código debe tener 6 dígitos.' })
  code!: string;
}
