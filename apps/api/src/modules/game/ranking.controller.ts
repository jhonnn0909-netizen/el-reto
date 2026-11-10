import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { GameService } from './game.service';

/** Ranking y catálogo de juegos: públicos (CONTRACTS.md §4.4). */
@Controller()
export class RankingController {
  constructor(private readonly game: GameService) {}

  @Get('ranking')
  getRanking(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return this.game.getRanking(limit ?? 20);
  }

  @Get('ranking/:username')
  getRankingByUsername(@Param('username') username: string) {
    return this.game.getRankingByUsername(username);
  }

  /**
   * Tipos de juego (motor modular): RPS jugable; damas, damas chinas
   * y conecta cuatro como COMING_SOON (solo metadatos, siguiente fase).
   */
  @Get('games')
  listGames() {
    return this.game.listGames();
  }
}
