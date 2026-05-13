import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { requireAuth } from "../utils/auth.js";
import { updateBalance } from "../controllers/profile-controller.js";
import { getBalance } from "../controllers/exchange-controller.js";

export const profileRouter = Router();

profileRouter.post("/updateBalance", requireAuth, asyncHandler(updateBalance));