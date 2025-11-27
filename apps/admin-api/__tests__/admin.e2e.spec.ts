import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { DB_CLIENT, IDbClient } from "@instant-games/core-db";
import { createDbClient } from "../../dice-api/__tests__/test-helpers";
import { randomUUID } from "crypto";

describe("Admin API e2e", () => {
  let app: INestApplication;
  let dbClient: IDbClient;
  const adminToken = "test-admin-token";
  const roundId = randomUUID();

  beforeAll(async () => {
    process.env.ADMIN_API_TOKEN = adminToken;
    dbClient = await createDbClient();
    await seedData();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DB_CLIENT)
      .useValue(dbClient)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("lists rounds", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/rounds")
      .set("x-admin-token", adminToken)
      .query({ operatorId: "op-admin", game: "dice", mode: "demo" })
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("gets a specific round", async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/rounds/${roundId}`)
      .set("x-admin-token", adminToken)
      .expect(200);
    expect(res.body.id).toBe(roundId);
  });

  it("returns wallet balances", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/wallets/op-admin/player-admin/USD/demo")
      .set("x-admin-token", adminToken)
      .expect(200);
    expect(res.body.balance).toBe("5000");
  });

  it("lists ledger entries", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/ledger")
      .set("x-admin-token", adminToken)
      .query({ operatorId: "op-admin" })
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("returns PF seeds and rotates", async () => {
    const listRes = await request(app.getHttpServer())
      .get("/admin/pf/seeds")
      .set("x-admin-token", adminToken)
      .query({ operatorId: "op-admin", game: "dice", mode: "demo" })
      .expect(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    const rotateRes = await request(app.getHttpServer())
      .post("/admin/pf/rotate")
      .set("x-admin-token", adminToken)
      .send({ operatorId: "op-admin", game: "dice", mode: "demo" })
      .expect(201);
    expect(rotateRes.body.serverSeedHash).toBeDefined();
  });

  it("exposes metrics", async () => {
    await request(app.getHttpServer()).get("/metrics").set("x-admin-token", adminToken).expect(200);
  });

  async function seedData() {
    await dbClient.query(`INSERT INTO operators (id, name) VALUES ($1,$2)`, ["op-admin", "Admin Operator"]);
    await dbClient.query(
      `INSERT INTO pf_server_seeds (operator_id, game, mode, server_seed, server_seed_hash, active)
       VALUES ($1,$2,$3,$4,$5,TRUE)`,
      ["op-admin", "dice", "demo", "seed-value", "hash-value"]
    );
    await dbClient.query(
      `INSERT INTO game_rounds (id, game, user_id, operator_id, mode, currency, bet_amount, payout_amount, math_version, status, server_seed_hash, server_seed, client_seed, nonce, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        roundId,
        "dice",
        "player-admin",
        "op-admin",
        "demo",
        "USD",
        "1000",
        "0",
        "v1",
        "PENDING",
        "hash-value",
        "seed-value",
        "client",
        1,
        JSON.stringify({ pfSeedId: "seed-1" }),
      ]
    );
    await dbClient.query(
      `INSERT INTO wallet_balances (operator_id, user_id, currency, mode, balance)
       VALUES ($1,$2,$3,$4,$5)`,
      ["op-admin", "player-admin", "USD", "demo", "5000"]
    );
    await dbClient.query(
      `INSERT INTO wallet_transactions (id, user_id, operator_id, mode, currency, amount, balance_before, balance_after, type, game, round_id, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        randomUUID(),
        "player-admin",
        "op-admin",
        "demo",
        "USD",
        "-1000",
        "5000",
        "4000",
        "BET",
        "dice",
        roundId,
        JSON.stringify({}),
      ]
    );
  }
});

