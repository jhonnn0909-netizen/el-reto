import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  AdminTransactionsQueryDto,
  CreatePromoCodeDto,
  ReverseTransactionDto,
} from '../wallet/dto/wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { WalletService } from '../wallet/wallet.service';

/**
 * Admin de billetera (CONTRACTS.md §4.6, solo lo de billetera).
 * Rol ADMIN (verificación en servidor).
 *
 * SOLO LECTURA sobre el ledger: ningún endpoint modifica ni borra
 * asientos. La única escritura es crear códigos promocionales. Las
 * correcciones contables se hacen con `POST /admin/transactions/:id/reverse`
 * (transacción REVERSAL compensatoria; el asiento original queda intacto).
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'Movimientos virtuales (solo lectura, paginado)' })
  listTransactions(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: AdminTransactionsQueryDto,
  ) {
    return this.walletService.listTransactionsAdmin(admin.id, query);
  }

  @Get('wallet/reconcile')
  @ApiOperation({
    summary: 'Conciliación: saldos almacenados vs suma firmada del ledger',
  })
  reconcile() {
    return this.walletService.reconcile();
  }

  @Post('promo-codes')
  @ApiOperation({ summary: 'Crea un código promocional demo' })
  createPromoCode(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreatePromoCodeDto,
  ) {
    return this.walletService.createPromoCode(admin.id, dto);
  }

  @Post('transactions/:id/reverse')
  @ApiOperation({
    summary:
      'Revierte una transacción con asientos compensatorios (el original queda intacto)',
  })
  reverseTransaction(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ReverseTransactionDto,
  ) {
    return this.walletService.reverseTransaction(
      admin.id,
      id,
      body?.reason,
      body?.idempotencyKey,
    );
  }
}
