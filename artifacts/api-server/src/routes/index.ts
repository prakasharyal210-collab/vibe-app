import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiCaptionRouter from "./ai/caption";
import aiChatRouter from "./ai/chat";
import pexelsTrendingRouter from "./pexels/trending";
import pexelsVideosRouter from "./pexels/videos";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", aiCaptionRouter);
router.use("/ai", aiChatRouter);
router.use("/pexels", pexelsTrendingRouter);
router.use("/pexels/videos", pexelsVideosRouter);

export default router;
