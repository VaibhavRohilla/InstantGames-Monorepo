import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { KenoController } from "../src/keno.controller";
import { KenoService } from "../src/keno.service";

registerGameE2ESuite({
  title: "Keno API e2e",
  game: "keno",
  path: "/keno/bet",
  controller: KenoController,
  service: KenoService,
  buildBetBody: () => ({
    betAmount: "180",
    picks: [1, 2, 3],
  }),
});

