import { registerGameE2ESuite } from "../../test-utils/game-e2e-suite";
import { WheelController } from "../src/wheel.controller";
import { WheelService } from "../src/wheel.service";

registerGameE2ESuite({
  title: "Wheel API e2e",
  game: "wheel",
  path: "/wheel/bet",
  controller: WheelController,
  service: WheelService,
  buildBetBody: () => ({
    betAmount: "160",
    segmentGuess: "MEGA",
  }),
});

