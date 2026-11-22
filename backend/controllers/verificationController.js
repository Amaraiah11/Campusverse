import { supabase, isSupabaseConfigured } from "../config/supabase.js";
import { verificationAgent } from "../services/verificationAgent.js";
import { embeddingService } from "../services/embeddingService.js";
import { textExtractionService } from "../services/textExtractionService.js";

export const verificationController = {
  /**
   * Get Material Verification Status
   */
  async getStatus(req, res, next) {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("materials")
          .select("id, title, verification_status, verification_reason, updated_at")
          .eq("id", id)
          .single();

        if (error || !data) {
          return res.status(404).json({ detail: "Material not found." });
        }

        return res.json({
          status: data.verification_status,
          reason: data.verification_reason,
          updatedAt: data.updated_at,
        });
      }

      return res.json({ status: "APPROVED", reason: "Verified." });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: List Materials Requiring Manual Review
   */
  async getPendingReview(req, res, next) {
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("materials")
          .select("*, profiles(full_name, email)")
          .in("verification_status", ["NEEDS_REVIEW", "PENDING"])
          .order("created_at", { ascending: false });

        if (error) throw error;
        return res.json({ materials: data || [] });
      }

      return res.json({ materials: [] });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: Approve Material Manually
   */
  async approveMaterial(req, res, next) {
    try {
      const { id } = req.params;
      const { note = "Manually approved by administrator." } = req.body;

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("materials")
          .update({
            verification_status: "APPROVED",
            verification_reason: note,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ message: "Material approved.", material: data });
      }

      return res.json({ message: "Material approved." });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin: Reject Material Manually
   */
  async rejectMaterial(req, res, next) {
    try {
      const { id } = req.params;
      const { reason = "Rejected by administrator." } = req.body;

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("materials")
          .update({
            verification_status: "REJECTED",
            verification_reason: reason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return res.json({ message: "Material rejected.", material: data });
      }

      return res.json({ message: "Material rejected." });
    } catch (err) {
      next(err);
    }
  },
};
