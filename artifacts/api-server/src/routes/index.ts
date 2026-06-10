import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiCaptionRouter from "./ai/caption";
import aiChatRouter from "./ai/chat";
import pexelsTrendingRouter from "./pexels/trending";
import pexelsVideosRouter from "./pexels/videos";
import adminSetupRouter from "./admin/setup";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", aiCaptionRouter);
router.use("/ai", aiChatRouter);
router.use("/pexels", pexelsTrendingRouter);
router.use("/pexels/videos", pexelsVideosRouter);
router.use("/admin", adminSetupRouter);

export default router;
