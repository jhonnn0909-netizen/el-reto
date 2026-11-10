import { IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';

/** PATCH /users/me (CONTRACTS.md §4.2). El username NO se cambia aquí. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'El nombre visible no puede estar vacío.' })
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La biografía debe tener como máximo 500 caracteres.' })
  bio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'El país debe ser un código ISO de 2 letras (p. ej. CO).' })
  country?: string;

  @IsOptional()
  @IsUrl({}, { message: 'La URL del avatar no es válida.' })
  @MaxLength(2048)
  avatarUrl?: string;
}
