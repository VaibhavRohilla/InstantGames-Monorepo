import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { HiloController } from "../src/hilo.controller";
import { HiloService } from "../src/hilo.service";

registerGameE2ESuite({
  title: "Hi-Lo API e2e",
  game: "hilo",
  path: "/hilo/bet",
  controller: HiloController,
  service: HiloService,
  buildBetBody: () => ({
    betAmount: "120",
    currentRank: 7,
    choice: "higher",
  }),
});

