import { Router } from "express";
import { chatController } from "../controllers/chatController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Protect AI chat endpoints against spam
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: { detail: "Too many AI requests. Please slow down." },
});

router.get("/materials", chatController.getMaterials);
router.post("/sessions", requireAuth, chatController.createSession);
router.get("/sessions", requireAuth, chatController.getSessions);
router.get("/sessions/:sessionId", requireAuth, chatController.getSessionHistory);
router.post("/sessions/:sessionId/message", requireAuth, chatLimiter, chatController.sendMessage);
router.delete("/sessions/:sessionId", requireAuth, chatController.deleteSession);
router.post("/ask-material", chatLimiter, chatController.askThisMaterial);

export default router;
