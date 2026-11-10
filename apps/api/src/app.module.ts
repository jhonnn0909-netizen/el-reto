import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { GameModule } from './modules/game/game.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';

// Integración final (2026-11-10): módulos de negocio cableados.
// Auth <-> Wallet usan forwardRef entre sí (guards compartidos en Auth;
// bono de bienvenida en Wallet); el resto no tiene ciclos.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    WalletModule,
    GameModule,
    NotificationsModule,
    AdminModule,
  ],
})
export class AppModule {}
