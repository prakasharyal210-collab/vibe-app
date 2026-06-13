import { Router, type IRouter } from "express";
import healthRouter from "./health";
import aiCaptionRouter from "./ai/caption";
import aiChatRouter from "./ai/chat";
import pexelsTrendingRouter from "./pexels/trending";
import pexelsVideosRouter from "./pexels/videos";
import adminSetupRouter from "./admin/setup";
import musicDeezerRouter from "./music/deezer";
import postsCreateRouter from "./posts/create";
import reelsCreateRouter from "./reels/create";
import reelsWatchRouter from "./reels/watch";
import usersSearchRouter from "./users/search";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/ai", aiCaptionRouter);
router.use("/ai", aiChatRouter);
router.use("/pexels", pexelsTrendingRouter);
router.use("/pexels/videos", pexelsVideosRouter);
router.use("/admin", adminSetupRouter);
router.use("/music", musicDeezerRouter);
router.use("/posts", postsCreateRouter);
router.use("/reels", reelsCreateRouter);
router.use("/reels", reelsWatchRouter);
router.use("/users", usersSearchRouter);

export default router;
