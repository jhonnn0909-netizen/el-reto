import { BadRequestException, Injectable } from '@nestjs/common';
import { GameEngine } from './game-engine.interface';
import { RpsEngine } from './rps.engine';

/**
 * Registro de motores de juego. El núcleo pide el motor por `game_type`
 * (`matches.game_type`, por defecto 'RPS'). Añadir un juego es
 * implementar GameEngine y registrarlo aquí; no se toca GameService.
 */
@Injectable()
export class GameEngineRegistry {
  private readonly engines = new Map<string, GameEngine>();

  constructor(rps: RpsEngine) {
    this.register(rps);
  }

  register(engine: GameEngine): void {
    this.engines.set(engine.gameType, engine);
  }

  get(gameType: string): GameEngine {
    const engine = this.engines.get(gameType);
    if (!engine) {
      throw new BadRequestException(`UNKNOWN_GAME_TYPE: ${gameType}`);
    }
    return engine;
  }

  listTypes(): string[] {
    return [...this.engines.keys()];
  }
}
