import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  health() {
    return { status: 'ok', service: 'el-reto-api', demo: true };
  }

  @Get('ready')
  async ready() {
    const dbOk = await this.db.healthCheck();
    return { status: dbOk ? 'ready' : 'degraded', database: dbOk };
  }
}
