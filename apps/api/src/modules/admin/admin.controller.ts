import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminListQueryDto } from './dto/admin-query.dto';
import { AdminService } from './admin.service';

/**
 * Administración general (CONTRACTS.md §4.6, solo lectura).
 * Rol ADMIN (verificación en servidor). Estos cuatro endpoints no
 * existían: el panel /admin fallaba con 404 en stats y parecía un
 * problema de permisos incluso para un ADMIN.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Contadores de la plataforma y créditos en circulación' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'Usuarios (paginado, sin datos sensibles)' })
  listUsers(@Query() query: AdminListQueryDto) {
    return this.adminService.listUsers(query.page, query.limit);
  }

  @Get('matches')
  @ApiOperation({ summary: 'Partidas supervisadas (paginado)' })
  listMatches(@Query() query: AdminListQueryDto) {
    return this.adminService.listMatches(query.page, query.limit);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Registro de auditoría (paginado)' })
  listAudit(@Query() query: AdminListQueryDto) {
    return this.adminService.listAudit(query.page, query.limit);
  }
}
