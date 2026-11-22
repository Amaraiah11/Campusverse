import { Router } from "express";
import { verificationController } from "../controllers/verificationController.js";
import { requireAuth, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/status/:id", verificationController.getStatus);
router.get("/pending", requireAuth, requireAdmin, verificationController.getPendingReview);
router.patch("/:id/approve", requireAuth, requireAdmin, verificationController.approveMaterial);
router.patch("/:id/reject", requireAuth, requireAdmin, verificationController.rejectMaterial);

export default router;
