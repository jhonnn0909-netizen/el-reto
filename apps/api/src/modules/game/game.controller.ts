import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { AuthUser } from '../../common/auth/auth-user.interface';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommitDto } from './dto/commit.dto';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import {
  ListChallengesDto,
  ListMatchesDto,
} from './dto/pagination.dto';
import { RevealDto } from './dto/reveal.dto';
import { GameService } from './game.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private readonly game: GameService) {}

  // ---- Retos ----

  @Post('challenges')
  createChallenge(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateChallengeDto,
  ) {
    return this.game.createChallenge(user, dto);
  }

  /**
   * Lista pública: sin sesión solo se ven los retos PUBLIC y abiertos
   * (antes el guardia exigía token y la portada mostraba «Tu sesión
   * caducó» a quien no había entrado). `mine=true` sigue exigiendo
   * sesión.
   */
  @Public()
  @Get('challenges')
  listChallenges(
    @CurrentUser() user: AuthUser | undefined,
    @Query() query: ListChallengesDto,
  ) {
    if (query.mine && !user) {
      throw new UnauthorizedException('MISSING_TOKEN');
    }
    return this.game.listChallenges(user ?? null, query);
  }

  /** Reto diario (determinista por fecha; se crea perezosamente). */
  @Public()
  @Get('challenges/daily')
  getDailyChallenge(@CurrentUser() user: AuthUser | undefined) {
    return this.game.getDailyChallenge(user ?? null);
  }

  @Public()
  @Get('challenges/invite/:code')
  getChallengeByInviteCode(
    @CurrentUser() user: AuthUser | undefined,
    @Param('code') code: string,
  ) {
    return this.game.getChallengeByInviteCode(user ?? null, code);
  }

  @Public()
  @Get('challenges/:id')
  getChallenge(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.game.getChallenge(user ?? null, id);
  }

  @Post('challenges/:id/accept')
  acceptChallenge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.game.acceptChallenge(user, id);
  }

  @Post('challenges/:id/cancel')
  cancelChallenge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.game.cancelChallenge(user, id);
  }

  // ---- Partidas ----

  @Post('matches/:id/commit')
  commit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommitDto,
  ) {
    return this.game.commitMove(user, id, dto.round, dto.commitHash);
  }

  @Post('matches/:id/reveal')
  reveal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevealDto,
  ) {
    return this.game.revealMove(user, id, dto.round, dto.move, dto.secret);
  }

  @Get('matches/:id')
  getMatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.game.getMatchState(user.id, id);
  }

  @Get('matches')
  listMatches(
    @CurrentUser() user: AuthUser,
    @Query() query: ListMatchesDto,
  ) {
    return this.game.listMatches(user, query);
  }

  @Post('matches/:id/cancel')
  cancelMatch(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.game.cancelMatch(user, id);
  }
}
