import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PresenceService } from './presence.service';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presence: PresenceService) {}

  /**
   * Personas en línea con estado (lista REAL desde Redis). Pública:
   * un visitante anónimo también debe ver quién está en línea (antes
   * exigía token y el panel mostraba «No pudimos cargar las personas
   * en línea» a quien no había entrado).
   */
  @Public()
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

  /**
   * Salida de presencia (al cerrar sesión): quita al usuario de la
   * lista en el acto. Antes solo caducaba por TTL (60 s) y al cambiar
   * de sesión el usuario anterior seguía apareciendo (a veces como
   * JUGANDO) hasta un minuto después.
   */
  @Post('leave')
  async leave(@CurrentUser() user: AuthUser) {
    await this.presence.remove(user.id);
    return { ok: true };
  }
}
