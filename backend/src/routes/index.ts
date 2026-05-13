import { Router } from "express";
import { authRouter } from "./auth-routes.js";
import { exchangeRouter } from "./exchange-routes.js";
import { profileRouter } from "./profile-routes.js";

export const appRouter = Router();

appRouter.use(authRouter);
appRouter.use(exchangeRouter);
appRouter.use(profileRouter);
