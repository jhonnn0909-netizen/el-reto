import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminWalletController } from './admin-wallet.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Módulo Admin — SOLO lo de billetera en esta entrega
 * (CONTRACTS.md §4.6: transacciones, conciliación, promo-codes, reverso).
 * Los demás endpoints admin (usuarios, stats, auditoría, partidas) los
 * crean sus módulos correspondientes y se añaden aquí en integración.
 * Importa AuthModule directamente: el controlador usa el guardia
 * compartido (`JwtAuthGuard + RolesGuard`), y sus dependencias
 * (`JwtService`) deben resolverse en el ámbito de este módulo.
 * No se registra en AppModule desde aquí: lo hace el coordinador.
 */
@Module({
  imports: [AuthModule, WalletModule],
  controllers: [AdminWalletController, AdminController],
  providers: [AdminService],
})
export class AdminModule {}
