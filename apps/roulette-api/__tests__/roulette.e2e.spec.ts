import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { RouletteController } from "../src/roulette.controller";
import { RouletteService } from "../src/roulette.service";

registerGameE2ESuite({
  title: "Roulette API e2e",
  game: "roulette",
  path: "/roulette/bet",
  controller: RouletteController,
  service: RouletteService,
  buildBetBody: () => ({
    betAmount: "100",
    selection: 0,
  }),
});

