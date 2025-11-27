import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { MinesController } from "../src/mines.controller";
import { MinesService } from "../src/mines.service";

registerGameE2ESuite({
  title: "Mines API e2e",
  game: "mines",
  path: "/mines/bet",
  controller: MinesController,
  service: MinesService,
  buildBetBody: () => ({
    betAmount: "150",
    cell: 2,
  }),
});

