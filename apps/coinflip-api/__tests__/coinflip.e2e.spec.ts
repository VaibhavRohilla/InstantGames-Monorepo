import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { CoinflipController } from "../src/coinflip.controller";
import { CoinflipService } from "../src/coinflip.service";

registerGameE2ESuite({
  title: "Coin Flip API e2e",
  game: "coinflip",
  path: "/coinflip/bet",
  controller: CoinflipController,
  service: CoinflipService,
  buildBetBody: () => ({
    betAmount: "140",
    side: "heads",
  }),
});

