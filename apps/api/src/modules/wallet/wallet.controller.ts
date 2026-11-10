import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  DepositDto,
  MovementsQueryDto,
  RedeemPromoDto,
  WithdrawDto,
} from './dto/wallet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/auth.types';
import { WalletService } from './wallet.service';

/**
 * Billetera DEMO/SANDBOX (CONTRACTS.md §4.3).
 * Créditos exclusivamente virtuales (demo, sin valor real).
 * Los invitados (rol GUEST) no tienen billetera: el servicio rechaza
 * cada operación con 403 `GUEST_WALLET_NOT_ALLOWED`.
 */
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'Saldo de la billetera demo del usuario actual' })
  getWallet(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getWallet(user.id);
  }

  @Get('balance')
  @ApiOperation({ summary: 'Alias resumido del saldo (demo)' })
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getBalance(user.id);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Historial de movimientos, paginado' })
  getMovements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MovementsQueryDto,
  ) {
    return this.walletService.listMovements(user.id, query);
  }

  @Post('deposit')
  @ApiOperation({ summary: 'Depósito virtual simulado (demo, sin dinero real)' })
  deposit(@CurrentUser() user: AuthenticatedUser, @Body() dto: DepositDto) {
    return this.walletService.deposit(user.id, dto.amount, dto.idempotencyKey);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Retiro simulado (demo, sin salida de dinero real)' })
  withdraw(@CurrentUser() user: AuthenticatedUser, @Body() dto: WithdrawDto) {
    return this.walletService.withdraw(user.id, dto.amount, dto.idempotencyKey);
  }

  @Post('promo')
  @ApiOperation({ summary: 'Canjea un código promocional (una sola vez por usuario)' })
  redeemPromo(@CurrentUser() user: AuthenticatedUser, @Body() dto: RedeemPromoDto) {
    return this.walletService.redeemPromo(user.id, dto.code);
  }
}
