import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WalletModule } from '../wallet/wallet.module';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { GameEngineRegistry } from './game-engine.registry';
import { PresenceController } from './presence.controller';
import { PresenceService } from './presence.service';
import { RankingController } from './ranking.controller';
import { RpsEngine } from './rps.engine';
import { WalletPortAdapter } from './wallet.adapter';
import { WALLET_PORT } from './wallet-port';

/**
 * Módulo de juego (CONTRACTS.md §4.4, §5).
 * El coordinador lo registra en AppModule (este módulo no toca
 * app.module.ts). El puerto de billetera (`WALLET_PORT`) lo provee
 * `WalletPortAdapter` sobre `WalletService`: las apuestas se reservan,
 * liberan y liquidan DENTRO de la transacción del motor de juego.
 * Autenticación: guardia compartido del AuthModule (ya no el guard
 * provisional de `common/auth`).
 */
@Module({
  imports: [AuthModule, WalletModule, NotificationsModule],
  controllers: [GameController, RankingController, PresenceController],
  providers: [
    GameService,
    GameGateway,
    PresenceService,
    RpsEngine,
    GameEngineRegistry,
    { provide: WALLET_PORT, useClass: WalletPortAdapter },
  ],
  exports: [GameService, PresenceService, GameEngineRegistry],
})
export class GameModule {}
