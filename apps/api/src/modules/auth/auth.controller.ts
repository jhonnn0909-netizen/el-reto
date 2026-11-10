import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedUser, RequestMeta } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { ConvertGuestDto, GuestDto, MfaLoginDto, MfaVerifyDto } from './dto/guest.dto';
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

function metaFromRequest(req: Request): RequestMeta {
  const ip = (req as unknown as { ip?: string }).ip ?? req.socket?.remoteAddress;
  const userAgent = req.headers['user-agent'];
  return { ip, userAgent };
}

/**
 * Auth — CONTRACTS.md §4.1, §9.2 y ampliación OAuth (Google/Facebook).
 * Prefijo global `/api/v1` (main.ts), por lo que las rutas son
 * `/api/v1/auth/...`.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, metaFromRequest(req));
  }

  /**
   * Rate limiting de login (CONTRACTS.md §4.1): 5 intentos/15 min por
   * IP+email. El guard de throttler aplica el umbral por IP+email y el
   * servicio lo refuerza con la tabla `login_attempts`.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, metaFromRequest(req));
  }

  /** Completa el login con MFA (desafío de /auth/login + código TOTP). */
  @Post('mfa/login')
  @HttpCode(HttpStatus.OK)
  async mfaLogin(@Body() dto: MfaLoginDto, @Req() req: Request) {
    return this.authService.loginWithMfa(dto.mfaToken, dto.code, metaFromRequest(req));
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto, metaFromRequest(req));
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, metaFromRequest(req));
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(dto, metaFromRequest(req));
  }

  /** Reenvío del correo de verificación (doc 05 §7.2). */
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.resendVerification(dto, metaFromRequest(req));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async mfaSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.mfaSetup(user.id);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async mfaVerify(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaVerifyDto) {
    return this.authService.mfaVerify(user.id, dto.code);
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.authService.revokeSession(user.id, id);
  }

  // --------------------------------------------------------- invitado (§9.2)

  @Post('guest')
  async guest(@Body() dto: GuestDto, @Req() req: Request) {
    return this.authService.guest(dto, metaFromRequest(req));
  }

  @Post('convert-guest')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async convertGuest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConvertGuestDto,
    @Req() req: Request,
  ) {
    return this.authService.convertGuest(user, dto, metaFromRequest(req));
  }

  // ------------------------------------------------------- OAuth (Google/FB)
  //
  // Sin credenciales configuradas: 503 OAUTH_NOT_CONFIGURED y la
  // aplicación sigue arrancando (las variables son opcionales).

  /** Redirige a la autorización de Google (scope openid email profile). */
  @Get('google')
  async google(@Res() res: Response) {
    const url = await this.authService.buildGoogleAuthUrl();
    return res.redirect(url);
  }

  /** Callback de Google: code → tokens (find-or-create). */
  @Get('google/callback')
  @HttpCode(HttpStatus.OK)
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
  ) {
    return this.authService.handleGoogleCallback(code, state, metaFromRequest(req));
  }

  /** Redirige a la autorización de Facebook. */
  @Get('facebook')
  async facebook(@Res() res: Response) {
    const url = await this.authService.buildFacebookAuthUrl();
    return res.redirect(url);
  }

  /** Callback de Facebook: code → tokens (find-or-create). */
  @Get('facebook/callback')
  @HttpCode(HttpStatus.OK)
  async facebookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
  ) {
    return this.authService.handleFacebookCallback(code, state, metaFromRequest(req));
  }
}
