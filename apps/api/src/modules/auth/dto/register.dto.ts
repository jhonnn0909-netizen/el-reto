import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Nombre de usuario (CONTRACTS.md §4.1): 3–30 caracteres, letras,
 * números, `_` y `.`, único sin distinción de mayúsculas.
 * La comprobación de disponibilidad en vivo es GET /users/check-username.
 */
export class RegisterDto {
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

  @IsString()
  @MinLength(1, { message: 'El nombre visible es obligatorio.' })
  @MaxLength(100)
  displayName!: string;
}
