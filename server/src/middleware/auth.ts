import { NextFunction, Request, Response } from "express";

// Day 1: pass-through stub. This project is single-user/local-first
// per the plan, so this stays minimal — placeholder in case an
// API-key or session check is added later.
export function auth(_req: Request, _res: Response, next: NextFunction): void {
  next();
}
