import { Router } from "express";
import { materialController } from "../controllers/materialController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { upload } from "../middleware/uploadMiddleware.js";

const router = Router();

router.post("/ai-summary", upload.single("file"), materialController.generateAiSummary);
router.post("/ai-description", upload.single("file"), materialController.generateDescription);
router.post("/", requireAuth, upload.single("file"), materialController.upload);
router.get("/search", materialController.search);
router.get("/", materialController.list);
router.get("/mine", requireAuth, materialController.myUploads);
router.get("/popular", materialController.popular);
router.get("/recent", materialController.recent);
router.get("/recommended", materialController.recommended);
router.get("/stats", materialController.stats);
router.get("/user-stats", materialController.getUserStats);
router.get("/:id", materialController.detail);
router.get("/:id/file", materialController.serveFile);
router.get("/:id/preview", materialController.preview);
router.get("/:id/download", materialController.download);
router.post("/:id/rating", materialController.rate);
router.delete("/:id", requireAuth, materialController.delete);

export default router;
