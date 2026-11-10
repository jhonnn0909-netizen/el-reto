import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class ListChallengesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(['BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5', 'FREE'])
  format?: 'BEST_OF_1' | 'BEST_OF_3' | 'BEST_OF_5' | 'FREE';

  // `?mine=false` llegaba como la cadena "false" y `@Type(() => Boolean)`
  // la convertía en `true` (Boolean("false") === true): la lista
  // pública devolvía solo los retos propios. Solo "true" (o true) es sí.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean = false;
}

export class ListMatchesDto extends PaginationDto {
  @IsOptional()
  @IsEnum(['WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED'])
  status?: 'WAITING' | 'IN_PROGRESS' | 'FINISHED' | 'CANCELLED';
}
