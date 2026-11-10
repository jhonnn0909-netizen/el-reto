import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MatchFormat } from '../game.types';

export class CreateChallengeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsEnum(['PUBLIC', 'PRIVATE'])
  visibility?: 'PUBLIC' | 'PRIVATE';

  @IsOptional()
  @IsEnum(['BEST_OF_1', 'BEST_OF_3', 'BEST_OF_5', 'FREE'])
  format?: MatchFormat;

  /**
   * Apuesta en créditos virtuales (DEMO). 0 = sin premio.
   * Con premio: mínimo 10, máximo 1000 (CONTRACTS.md §9.3).
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  stakeCredits?: number = 0;
}
