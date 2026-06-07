import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiCaptionRouter from "./ai/caption";
import youtubeTrendingRouter from "./youtube/trending";
import pexelsTrendingRouter from "./pexels/trending";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", aiCaptionRouter);
router.use("/youtube", youtubeTrendingRouter);
router.use("/pexels", pexelsTrendingRouter);

export default router;
