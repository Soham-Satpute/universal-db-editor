import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { queryGuard } from "../middleware/queryGuard";

/** Minimal fake Request/Response pair, just enough for queryGuard. */
function makeReqRes(body: Record<string, unknown>) {
  const req = { body } as Request;

  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;

  const next = vi.fn() as NextFunction;

  return { req, res, next, status, json };
}

describe("queryGuard middleware", () => {
  it("allows a plain SELECT through", () => {
    const { req, res, next, status } = makeReqRes({ query: "SELECT * FROM users" });
    queryGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("blocks DROP TABLE", () => {
    const { req, res, next, status, json } = makeReqRes({ query: "DROP TABLE users" });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ requiresConfirmation: true }),
    );
  });

  it("blocks DROP DATABASE", () => {
    const { req, res, next, status } = makeReqRes({ query: "DROP DATABASE testdb" });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("blocks TRUNCATE TABLE", () => {
    const { req, res, next, status } = makeReqRes({ query: "TRUNCATE TABLE orders" });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("blocks DELETE FROM without a WHERE clause", () => {
    const { req, res, next, status } = makeReqRes({ query: "DELETE FROM users" });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("allows DELETE FROM with a WHERE clause", () => {
    const { req, res, next, status } = makeReqRes({
      query: "DELETE FROM users WHERE id = 1",
    });
    queryGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("blocks ALTER TABLE ... DROP COLUMN", () => {
    const { req, res, next, status } = makeReqRes({
      query: "ALTER TABLE users DROP COLUMN email",
    });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("is case-insensitive for blocked patterns", () => {
    const { req, res, next, status } = makeReqRes({ query: "drop table users" });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });

  it("lets a previously-blocked query through once confirmed: true is set", () => {
    const { req, res, next, status } = makeReqRes({
      query: "DROP TABLE users",
      confirmed: true,
    });
    queryGuard(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("checks req.body.filter for Mongo-style requests too", () => {
    const { req, res, next, status } = makeReqRes({ filter: "TRUNCATE everything" });
    queryGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
  });
});
