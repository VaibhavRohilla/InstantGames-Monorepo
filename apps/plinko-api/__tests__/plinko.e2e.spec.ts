import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { PlinkoController } from "../src/plinko.controller";
import { PlinkoService } from "../src/plinko.service";

registerGameE2ESuite({
  title: "Plinko API e2e",
  game: "plinko",
  path: "/plinko/bet",
  controller: PlinkoController,
  service: PlinkoService,
  buildBetBody: () => ({
    betAmount: "200",
    risk: "medium",
  }),
});

