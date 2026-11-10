import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  /** Personas en línea con estado (lista REAL desde Redis). */
  @Get('online')
  getOnline() {
    return this.presence.getOnline();
  }

  /**
   * Latido de presencia (REST). El cliente web lo envía al entrar y
   * cada 20 s mientras la página está abierta: antes solo se hacía
   * heartbeat al conectar el WebSocket de una partida, así que quien
   * navegaba por inicio/retos/juegos nunca aparecía en línea y el
   * panel marcaba (0) mientras decía «Eres la única persona en línea».
   */
  @Post('heartbeat')
  async heartbeat(@CurrentUser() user: AuthUser) {
    await this.presence.heartbeat(user.id);
    return { ok: true };
  }
}
