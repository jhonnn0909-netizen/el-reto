import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/**
 * Módulo de billetera DEMO/SANDBOX.
 *
 * Exporta `WalletService` para:
 * - AuthModule: `grantWelcomeBonus(userId)` al registrar / convertir
 *   invitado (AuthModule lo importa con `forwardRef`; ver auth.module.ts).
 * - GameModule: núcleos transaccionales `holdStakeInTx` /
 *   `releaseStakeInTx` / `payoutInTx` / `grantDailyPrizeInTx`, usados
 *   por el adaptador `WalletPortAdapter` dentro de la transacción del
 *   motor de juego.
 * - AdminModule: conciliación, listado de transacciones, promo-codes.
 *
 * Autenticación: usa el guardia compartido del AuthModule
 * (`JwtAuthGuard` + `RolesGuard`); los guards provisionales propios
 * (`guards/jwt-auth.guard.ts`) se eliminaron en la integración.
 *
 * NO se registra en AppModule desde aquí: lo hace el coordinador en la
 * fase de integración.
 */
@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
