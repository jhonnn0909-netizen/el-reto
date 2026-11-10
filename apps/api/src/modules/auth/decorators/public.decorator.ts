import { SetMetadata } from '@nestjs/common';

/** Marca un endpoint como público: JwtAuthGuard lo deja pasar sin token. */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
