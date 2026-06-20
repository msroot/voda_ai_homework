import { createHash } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { createRedisConnection } from "../clients/redis.js";
import { AppError } from "../lib/appError.js";
import {
  completeIdempotencyRecord,
  deleteIdempotencyRecord,
  findIdempotencyRecord,
  isProcessingStale,
  tryInsertProcessingRecord,
} from "../repositories/idempotencyRepository.js";

const RESULT_TTL_SECONDS = Number(process.env.IDEMPOTENCY_TTL_SECONDS ?? 86400);
const PROCESSING_TTL_SECONDS = Number(process.env.IDEMPOTENCY_PROCESSING_TTL_SECONDS ?? 60);
const KEY_PATTERN = /^[\w-]{1,255}$/;

interface RedisIdempotencyRecord {
  state: "processing" | "complete";
  requestHash: string;
  statusCode?: number;
  body?: unknown;
}

export interface IdempotencyContext {
  scope: "tenant" | "platform";
  key: string;
  requestHash: string;
}

declare global {
  namespace Express {
    interface Request {
      idempotency?: IdempotencyContext;
    }
  }
}

let redisClient: ReturnType<typeof createRedisConnection> | null = null;

function redis() {
  if (!redisClient) {
    redisClient = createRedisConnection();
  }
  return redisClient;
}

export function hashIdempotencyBody(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? {})).digest("hex");
}

export async function closeIdempotency(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

async function storePlatformResult(
  redisKey: string,
  requestHash: string,
  statusCode: number,
  body: unknown
): Promise<void> {
  const record: RedisIdempotencyRecord = {
    state: "complete",
    requestHash,
    statusCode,
    body,
  };
  await redis().set(redisKey, JSON.stringify(record), "EX", RESULT_TTL_SECONDS);
}

async function clearPlatformKey(redisKey: string): Promise<void> {
  await redis().del(redisKey);
}

function sendJsonResponse(res: Response, statusCode: number, body: unknown): void {
  res.status(statusCode).json(body);
}

async function handleTenantIdempotency(
  res: Response,
  key: string,
  requestHash: string
): Promise<"cached" | "acquired"> {
  const existing = await findIdempotencyRecord(key);

  if (existing) {
    if (existing.request_hash !== requestHash) {
      sendJsonResponse(res, 409, {
        error: "Idempotency key reused with different request body",
      });
      return "cached";
    }

    if (existing.status_code === null) {
      if (!isProcessingStale(existing.created_at)) {
        sendJsonResponse(res, 409, { error: "Idempotency request in progress" });
        return "cached";
      }
      await deleteIdempotencyRecord(key);
    } else {
      sendJsonResponse(res, existing.status_code, existing.response_body);
      return "cached";
    }
  }

  const acquired = await tryInsertProcessingRecord(key, requestHash);
  if (acquired === "acquired") {
    return "acquired";
  }

  const retry = await findIdempotencyRecord(key);
  if (!retry) {
    sendJsonResponse(res, 409, { error: "Idempotency request in progress" });
    return "cached";
  }

  if (retry.request_hash !== requestHash) {
    sendJsonResponse(res, 409, {
      error: "Idempotency key reused with different request body",
    });
    return "cached";
  }

  if (retry.status_code === null) {
    sendJsonResponse(res, 409, { error: "Idempotency request in progress" });
    return "cached";
  }

  sendJsonResponse(res, retry.status_code, retry.response_body);
  return "cached";
}

async function handlePlatformIdempotency(
  req: Request,
  res: Response,
  key: string,
  requestHash: string
): Promise<"cached" | "acquired"> {
  const redisKey = `idempotency:platform:${key}`;
  const r = redis();
  const existingRaw = await r.get(redisKey);

  if (existingRaw) {
    const existing = JSON.parse(existingRaw) as RedisIdempotencyRecord;

    if (existing.requestHash !== requestHash) {
      sendJsonResponse(res, 409, {
        error: "Idempotency key reused with different request body",
      });
      return "cached";
    }

    if (existing.state === "processing") {
      sendJsonResponse(res, 409, { error: "Idempotency request in progress" });
      return "cached";
    }

    sendJsonResponse(res, existing.statusCode ?? 200, existing.body);
    return "cached";
  }

  const processing: RedisIdempotencyRecord = { state: "processing", requestHash };
  const acquired = await r.set(
    redisKey,
    JSON.stringify(processing),
    "EX",
    PROCESSING_TTL_SECONDS,
    "NX"
  );

  if (!acquired) {
    sendJsonResponse(res, 409, { error: "Idempotency request in progress" });
    return "cached";
  }

  req.idempotency = { scope: "platform", key, requestHash };
  return "acquired";
}

export function idempotency(
  scope: "tenant" | "platform",
  options?: { required?: boolean }
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const key = req.header("Idempotency-Key");
    if (!key) {
      if (options?.required) {
        res.status(400).json({ error: "Missing Idempotency-Key header" });
        return;
      }
      next();
      return;
    }

    if (!KEY_PATTERN.test(key)) {
      res.status(400).json({ error: "Invalid Idempotency-Key" });
      return;
    }

    const requestHash = hashIdempotencyBody(req.body);

    const outcome =
      scope === "tenant"
        ? await handleTenantIdempotency(res, key, requestHash)
        : await handlePlatformIdempotency(req, res, key, requestHash);

    if (outcome === "cached") {
      return;
    }

    if (scope === "tenant") {
      req.idempotency = { scope: "tenant", key, requestHash };
    }

    const originalJson = res.json.bind(res);
    let statusCode = 200;

    const originalStatus = res.status.bind(res);
    res.status = ((code: number) => {
      statusCode = code;
      return originalStatus(code);
    }) as Response["status"];

    res.json = (body: unknown) => {
      void finalizeIdempotencySuccess(req.idempotency!, statusCode, body);
      return originalJson(body);
    };

    res.on("close", () => {
      if (!res.writableFinished && req.idempotency) {
        void finalizeIdempotencyFailure(req.idempotency);
      }
    });

    next();
  };
}

async function finalizeIdempotencySuccess(
  context: IdempotencyContext,
  statusCode: number,
  body: unknown
): Promise<void> {
  if (context.scope === "tenant") {
    await completeIdempotencyRecord(
      context.key,
      context.requestHash,
      statusCode,
      body
    );
    return;
  }

  await storePlatformResult(
    `idempotency:platform:${context.key}`,
    context.requestHash,
    statusCode,
    body
  );
}

async function finalizeIdempotencyFailure(context: IdempotencyContext): Promise<void> {
  if (context.scope === "tenant") {
    await deleteIdempotencyRecord(context.key);
    return;
  }

  await clearPlatformKey(`idempotency:platform:${context.key}`);
}

export async function finalizeIdempotencyOnError(
  req: Request,
  err: unknown
): Promise<void> {
  const context = req.idempotency;
  if (!context) {
    return;
  }

  if (err instanceof AppError) {
    const body =
      err.details !== undefined
        ? { error: err.message, details: err.details }
        : { error: err.message };
    await finalizeIdempotencySuccess(context, err.statusCode, body);
    return;
  }

  await finalizeIdempotencyFailure(context);
}
