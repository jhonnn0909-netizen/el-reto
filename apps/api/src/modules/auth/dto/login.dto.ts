import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  /**
   * Correo electrónico o nombre de usuario. El nombre del campo se
   * mantiene por compatibilidad con el cliente web; el servicio
   * distingue por la presencia de '@' (los nombres de usuario no
   * pueden contenerla, ver isValidUsername).
   */
  @IsString()
  @MinLength(1, { message: 'Escribe tu correo o tu nombre de usuario.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(1, { message: 'La contraseña es obligatoria.' })
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MinLength(1, { message: 'El token de refresco es obligatorio.' })
  refreshToken!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(1, { message: 'El token es obligatorio.' })
  token!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'El correo electrónico no es válido.' })
  @MaxLength(255)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(1, { message: 'El token es obligatorio.' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(128, { message: 'La contraseña debe tener como máximo 128 caracteres.' })
  newPassword!: string;
}
