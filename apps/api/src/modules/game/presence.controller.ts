import { Controller, Get, UseGuards } from '@nestjs/common';
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
}
