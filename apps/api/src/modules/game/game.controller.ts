import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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

  @Get('challenges')
  listChallenges(
    @CurrentUser() user: AuthUser,
    @Query() query: ListChallengesDto,
  ) {
    return this.game.listChallenges(user, query);
  }

  /** Reto diario (determinista por fecha; se crea perezosamente). */
  @Get('challenges/daily')
  getDailyChallenge(@CurrentUser() user: AuthUser) {
    return this.game.getDailyChallenge(user);
  }

  @Get('challenges/invite/:code')
  getChallengeByInviteCode(
    @CurrentUser() user: AuthUser,
    @Param('code') code: string,
  ) {
    return this.game.getChallengeByInviteCode(user, code);
  }

  @Get('challenges/:id')
  getChallenge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.game.getChallenge(user, id);
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
