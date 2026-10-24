import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { csrfOriginCheck } from "../src/middleware/csrf";

function testApp() {
    const app = express();
    app.use(express.json());
    app.use(csrfOriginCheck);
    app.post("/thing", (_req, res) => {
        res.status(201).json({ created: true });
    });
    app.get("/thing", (_req, res) => {
        res.json({ ok: true });
    });
    return app;
}

describe("csrfOriginCheck", () => {
    it("allows a same-origin POST (Origin matches APP_URL)", async () => {
        const res = await request(testApp())
            .post("/thing")
            .set("Origin", "http://localhost:3004")
            .send({});
        expect(res.status).toBe(201);
    });

    it("blocks a cross-origin POST", async () => {
        const res = await request(testApp())
            .post("/thing")
            .set("Origin", "https://evil.example")
            .send({});
        expect(res.status).toBe(403);
    });

    it("blocks a request flagged cross-site by Sec-Fetch-Site even without Origin", async () => {
        const res = await request(testApp())
            .post("/thing")
            .set("Sec-Fetch-Site", "cross-site")
            .send({});
        expect(res.status).toBe(403);
    });

    it("blocks a malformed Origin on state-changing methods", async () => {
        const res = await request(testApp())
            .post("/thing")
            .set("Origin", "not-a-url")
            .send({});
        expect(res.status).toBe(403);
    });

    it("does not interfere with GET requests", async () => {
        const res = await request(testApp())
            .get("/thing")
            .set("Origin", "https://evil.example");
        expect(res.status).toBe(200);
    });
});
