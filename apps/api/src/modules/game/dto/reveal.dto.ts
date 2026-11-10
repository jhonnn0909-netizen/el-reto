import { IsEnum, IsInt, IsString, Min, MinLength } from 'class-validator';
import { Move } from '../game.types';

export class RevealDto {
  @IsInt()
  @Min(1)
  round!: number;

  @IsEnum(['ROCK', 'PAPER', 'SCISSORS'])
  move!: Move;

  /** Secreto usado en el commit: el backend verifica SHA256(move + ":" + secret). */
  @IsString()
  @MinLength(1)
  secret!: string;
}
