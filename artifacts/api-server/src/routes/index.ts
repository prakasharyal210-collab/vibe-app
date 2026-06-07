import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiCaptionRouter from "./ai/caption";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", aiCaptionRouter);

export default router;
