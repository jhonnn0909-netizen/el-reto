import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * UsersModule (CONTRACTS.md §4.2).
 * Importa AuthModule para reutilizar JwtAuthGuard (la autenticación y el
 * RBAC viven en Auth; AuthModule no importa UsersModule, no hay ciclo).
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
