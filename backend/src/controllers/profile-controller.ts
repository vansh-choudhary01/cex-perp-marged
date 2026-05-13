import type { Request, Response } from "express";
import { getUserId } from "./exchange-controller";
import { updateBalanceSchema } from "../types/exchange-schema";
import { sendValidationError } from "../utils/validation";
import { sendToEngine } from "../utils/engine-client";

export async function updateBalance(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);

  const parsedBody = updateBalanceSchema.safeParse(req.body);
  if (!parsedBody.success) {
    sendValidationError(res, parsedBody.error);
    return;
  }

  const { balance, symbol } = parsedBody.data;

  const engineResponse = await sendToEngine("update_balance", {
    userId,
    balance,
    symbol
  });

  res.status(engineResponse.ok ? 200 : 400).json(engineResponse.ok ? engineResponse.data : {
    error: engineResponse.error,
  });
}