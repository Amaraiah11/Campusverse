import { Router } from "express";
import { authController } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/admin-login", authController.adminLogin);
router.get("/me", requireAuth, authController.me);
router.put("/profile", requireAuth, authController.updateProfile);
router.post("/logout", authController.logout);

export default router;
