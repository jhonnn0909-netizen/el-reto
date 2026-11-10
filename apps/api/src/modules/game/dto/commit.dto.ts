import { IsInt, IsString, Matches, Min } from 'class-validator';

export class CommitDto {
  @IsInt()
  @Min(1)
  round!: number;

  /** SHA-256 hex (64 caracteres) de `move + ":" + secret`. */
  @IsString()
  @Matches(/^[0-9a-fA-F]{64}$/)
  commitHash!: string;
}
