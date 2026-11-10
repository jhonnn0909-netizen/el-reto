import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WALLET_TRANSACTION_TYPES } from '../wallet.types';

/**
 * DTOs de billetera (CONTRACTS.md §4.3).
 * Los importes son créditos virtuales enteros (CREDITO, sin decimales).
 * `idempotencyKey` es obligatorio en toda operación que mueve créditos:
 * repetir la misma clave devuelve la transacción original sin duplicar.
 */
export class DepositDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;
}

export class WithdrawDto {
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amount!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;
}

export class RedeemPromoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;
}

export class MovementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  @IsIn(WALLET_TRANSACTION_TYPES)
  type?: string;
}

export class AdminTransactionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @IsIn(WALLET_TRANSACTION_TYPES)
  type?: string;

  @IsOptional()
  @IsString()
  @IsIn(['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'])
  status?: string;
}

export class ReverseTransactionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey?: string;
}

export class CreatePromoCodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code!: string;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  credits!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUses = 1;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  active = true;
}
