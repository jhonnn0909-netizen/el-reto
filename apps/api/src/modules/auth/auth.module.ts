import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { TotpService } from './totp.service';
import { WalletModule } from '../wallet/wallet.module';

/**
 * AuthModule (CONTRACTS.md §4.1, §9.2).
 * - JwtModule con el secreto de acceso; los refresh tokens son opacos
 *   (no JWT) y se guardan solo como hash en `sessions`.
 * - Throttler: 5 intentos/15 min por IP+email en /auth/login. El
 *   almacenamiento por defecto es en memoria (una instancia); si el
 *   despliegue usa varias instancias, el coordinador debe pasar a un
 *   almacenamiento en Redis (doc 05 §10.3).
 * - Exporta los guards para que los demás módulos (Users, Wallet, Game,
 *   Admin) reutilicen la misma autenticación y el mismo RBAC, y
 *   re-exporta JwtModule (lo usa el gateway WebSocket para verificar el
 *   token del handshake).
 * - Importa WalletModule con `forwardRef` (WalletModule importa a su
 *   vez AuthModule para los guards): AuthService concede el bono de
 *   bienvenida con `WalletService.grantWelcomeBonus` al registrar, al
 *   convertir un invitado y al registrarse por OAuth.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret') as string,
        // Valor por defecto (15 min); AuthService pasa siempre el TTL
        // configurado (jwt.accessTtl) en cada signAsync.
        signOptions: { expiresIn: 900 },
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 900_000, limit: 5 }],
      getTracker: (req: Record<string, unknown>) => {
        const ip = (req as { ip?: string }).ip ?? 'unknown';
        const body = req.body as { email?: string } | undefined;
        const email = (body?.email ?? '').toLowerCase();
        return `${ip}:${email}`;
      },
    }),
    forwardRef(() => WalletModule),
  ],
  controllers: [AuthController],
  providers: [AuthService, TotpService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, TotpService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
