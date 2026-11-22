import { supabase, isSupabaseConfigured } from "../config/supabase.js";
import { chatbotService } from "../services/chatbotService.js";
import { isMongoConnected, Material, Conversation } from "../database/mongodb.js";

export const chatController = {
  /**
   * Get Approved Materials List for Context Selector
   */
  async getMaterials(req, res, next) {
    try {
      if (isMongoConnected()) {
        const mats = await Material.find({ verification_status: "APPROVED" })
          .select("id title department subject file_type page_count summary description")
          .sort({ created_at: -1 })
          .lean();

        return res.json({
          materials: mats.map((m) => ({
            id: m.id,
            title: m.title,
            department: m.department,
            subject: m.subject,
            file_type: m.file_type || "PDF",
            fileType: m.file_type || "PDF",
            page_count: m.page_count || 1,
            pageCount: m.page_count || 1,
            summary: m.summary || m.description || "",
          })),
        });
      }

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("materials")
          .select("id, title, department, subject, file_type, page_count")
          .eq("verification_status", "APPROVED")
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
   * Create New Conversation Session
   */
  async createSession(req, res, next) {
    try {
      const { title = "Study Session", materialId = null, materialIds = [] } = req.body;
      const userId = req.user?.id || "demo-usr-1";
      const resolvedMaterialId = materialId || (materialIds.length > 0 ? materialIds[0] : null);
      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (isMongoConnected()) {
        const conv = await Conversation.create({
          sessionId,
          user_id: userId,
          title: title.slice(0, 80),
          materialId: resolvedMaterialId,
          materialIds: materialIds.length > 0 ? materialIds : resolvedMaterialId ? [resolvedMaterialId] : [],
          messages: [],
        });

        return res.status(201).json({
          sessionId: conv.sessionId,
          id: conv.sessionId,
          title: conv.title,
          materialId: conv.materialId,
          materialIds: conv.materialIds,
          createdAt: conv.createdAt,
        });
      }

      if (isSupabaseConfigured() && userId) {
        const { data, error } = await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            title: title.slice(0, 80),
            material_id: resolvedMaterialId,
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json({
          sessionId: data.id,
          id: data.id,
          title: data.title,
          materialId: data.material_id,
          createdAt: data.created_at,
        });
      }

      return res.status(201).json({
        sessionId,
        id: sessionId,
        title,
        materialId: resolvedMaterialId,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get User Conversations
   */
  async getSessions(req, res, next) {
    try {
      const userId = req.user?.id || "demo-usr-1";

      if (isMongoConnected()) {
        const sessions = await Conversation.find({ user_id: userId })
          .sort({ updatedAt: -1, createdAt: -1 })
          .lean();

        return res.json({
          sessions: sessions.map((s) => ({
            sessionId: s.sessionId,
            id: s.sessionId,
            title: s.title,
            materialId: s.materialId,
            materialIds: s.materialIds || [],
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          })),
        });
      }

      if (isSupabaseConfigured() && userId) {
        const { data, error } = await supabase
          .from("conversations")
          .select("*, materials(title)")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false });

        if (error) throw error;
        const sessions = (data || []).map((s) => ({
          sessionId: s.id,
          id: s.id,
          title: s.title,
          materialId: s.material_id,
          materialTitle: s.materials?.title,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        }));
        return res.json({ sessions });
      }

      return res.json({ sessions: [] });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Conversation History
   */
  async getSessionHistory(req, res, next) {
    try {
      const { sessionId } = req.params;

      if (isMongoConnected()) {
        const session = await Conversation.findOne({ sessionId }).lean();
        if (session) {
          return res.json({
            session: {
              sessionId: session.sessionId,
              title: session.title,
              materialId: session.materialId,
              materialIds: session.materialIds,
            },
            messages: (session.messages || []).map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              sources: m.sources || [],
              groundedInNotes: m.groundedInNotes,
              createdAt: m.createdAt,
            })),
          });
        }
      }

      if (isSupabaseConfigured()) {
        const { data: session } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", sessionId)
          .single();

        const { data: messages, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", sessionId)
          .order("created_at", { ascending: true });

        if (error) throw error;

        return res.json({
          session,
          messages: (messages || []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            sources: m.sources || [],
            createdAt: m.created_at,
          })),
        });
      }

      return res.json({ session: null, messages: [] });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Send Message to AI Study Assistant
   */
  async sendMessage(req, res, next) {
    try {
      const { sessionId } = req.params;
      const { question, materialIds, materialId } = req.body;

      if (!question || !question.trim()) {
        return res.status(400).json({ detail: "Question cannot be empty." });
      }

      let activeMaterialId = materialId || null;
      let activeMaterialIds = Array.isArray(materialIds) ? materialIds : [];
      let history = [];
      let mongoSession = null;

      if (isMongoConnected()) {
        mongoSession = await Conversation.findOne({ sessionId });
        if (mongoSession) {
          if (!activeMaterialId && mongoSession.materialId) {
            activeMaterialId = mongoSession.materialId;
          }
          if (activeMaterialIds.length === 0 && mongoSession.materialIds?.length > 0) {
            activeMaterialIds = mongoSession.materialIds;
          }
          history = (mongoSession.messages || []).slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }
      } else if (isSupabaseConfigured()) {
        const { data: session } = await supabase
          .from("conversations")
          .select("material_id")
          .eq("id", sessionId)
          .maybeSingle();

        activeMaterialId = session?.material_id || null;

        const { data: recentMsgs } = await supabase
          .from("messages")
          .select("role, content")
          .eq("conversation_id", sessionId)
          .order("created_at", { ascending: false })
          .limit(6);

        history = (recentMsgs || []).reverse();
      }

      // Generate AI Answer via RAG and Academic Screening
      const aiResponse = await chatbotService.answerQuestion({
        question: question.trim(),
        conversationHistory: history,
        materialId: activeMaterialId,
        materialIds: activeMaterialIds,
      });

      const userMsg = {
        id: `msg_u_${Date.now()}`,
        role: "user",
        content: question.trim(),
        createdAt: new Date(),
      };

      const aiMsg = {
        id: `msg_a_${Date.now()}`,
        role: "assistant",
        content: aiResponse.content,
        sources: aiResponse.sources || [],
        groundedInNotes: aiResponse.groundedInNotes || false,
        isGeneralKnowledge: aiResponse.isGeneralKnowledge || false,
        createdAt: new Date(),
      };

      if (isMongoConnected() && mongoSession) {
        mongoSession.messages.push(userMsg);
        mongoSession.messages.push(aiMsg);
        mongoSession.updatedAt = new Date();
        await mongoSession.save();
      } else if (isSupabaseConfigured()) {
        await supabase.from("messages").insert({
          conversation_id: sessionId,
          role: "user",
          content: question.trim(),
        });

        await supabase.from("messages").insert({
          conversation_id: sessionId,
          role: "assistant",
          content: aiResponse.content,
          sources: aiResponse.sources,
        });
      }

      return res.json({
        id: aiMsg.id,
        role: "assistant",
        content: aiResponse.content,
        sources: aiResponse.sources,
        groundedInNotes: aiResponse.groundedInNotes,
        isGeneralKnowledge: aiResponse.isGeneralKnowledge,
        createdAt: aiMsg.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Delete Conversation Session
   */
  async deleteSession(req, res, next) {
    try {
      const { sessionId } = req.params;
      const userId = req.user?.id || "demo-usr-1";

      if (isMongoConnected()) {
        await Conversation.deleteOne({ sessionId, user_id: userId });
        return res.json({ success: true, message: "Session deleted." });
      }

      if (isSupabaseConfigured() && userId) {
        await supabase
          .from("conversations")
          .delete()
          .eq("id", sessionId)
          .eq("user_id", userId);
      }

      return res.json({ success: true, message: "Session deleted." });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Ask This Material: Contextually Query a Single Document
   */
  async askThisMaterial(req, res, next) {
    try {
      const { materialId, question } = req.body;

      if (!materialId || !question) {
        return res.status(400).json({ detail: "materialId and question are required." });
      }

      const aiResponse = await chatbotService.answerQuestion({
        question: question.trim(),
        materialId,
      });

      return res.json({
        answer: aiResponse.content,
        content: aiResponse.content,
        sources: aiResponse.sources,
        groundedInNotes: aiResponse.groundedInNotes,
      });
    } catch (err) {
      next(err);
    }
  },
};
