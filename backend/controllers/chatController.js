import { supabase, isSupabaseConfigured } from "../config/supabase.js";
import { chatbotService } from "../services/chatbotService.js";

// In-memory sessions fallback when Supabase is not configured
const inMemorySessions = new Map();

export const chatController = {
  /**
   * Get Approved Materials List for Context Selector
   */
  async getMaterials(req, res, next) {
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("materials")
          .select("id, title, department, subject, file_type, page_count, summary, description")
          .eq("verification_status", "APPROVED")
          .order("created_at", { ascending: false });

        if (error) {
          console.warn("Supabase fetch materials notice:", error.message);
          return res.json({ materials: [] });
        }

        const formatted = (data || []).map((m) => ({
          id: m.id,
          title: m.title,
          department: m.department,
          subject: m.subject,
          file_type: m.file_type || "PDF",
          fileType: m.file_type || "PDF",
          page_count: m.page_count || 1,
          pageCount: m.page_count || 1,
          summary: m.summary || m.description || "",
        }));

        return res.json({ materials: formatted });
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

      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase
            .from("conversations")
            .insert({
              id: sessionId,
              user_id: String(userId),
              title: title.slice(0, 80),
              material_id: resolvedMaterialId,
            })
            .select()
            .single();

          if (error) {
            console.warn("Supabase conversation insert notice:", error.message);
          } else if (data) {
            return res.status(201).json({
              sessionId: data.id,
              id: data.id,
              title: data.title,
              materialId: data.material_id,
              materialIds: data.material_id ? [data.material_id] : [],
              createdAt: data.created_at,
            });
          }
        } catch (sErr) {
          console.warn("Supabase conversation creation error:", sErr.message);
        }
      }

      // Standby in-memory session
      const sessionObj = {
        sessionId,
        id: sessionId,
        title: title.slice(0, 80),
        materialId: resolvedMaterialId,
        materialIds: resolvedMaterialId ? [resolvedMaterialId] : [],
        user_id: userId,
        messages: [],
        createdAt: new Date().toISOString(),
      };
      inMemorySessions.set(sessionId, sessionObj);

      return res.status(201).json({
        sessionId,
        id: sessionId,
        title: sessionObj.title,
        materialId: resolvedMaterialId,
        materialIds: sessionObj.materialIds,
        createdAt: sessionObj.createdAt,
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

      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase
            .from("conversations")
            .select("id, title, material_id, created_at, updated_at")
            .eq("user_id", String(userId))
            .order("updated_at", { ascending: false });

          if (!error && Array.isArray(data)) {
            const sessions = data.map((s) => ({
              sessionId: s.id,
              id: s.id,
              title: s.title,
              materialId: s.material_id,
              materialIds: s.material_id ? [s.material_id] : [],
              createdAt: s.created_at,
              updatedAt: s.updated_at,
            }));
            return res.json({ sessions });
          }
        } catch (sErr) {
          console.warn("Supabase getSessions notice:", sErr.message);
        }
      }

      const sessions = Array.from(inMemorySessions.values())
        .filter((s) => s.user_id === userId)
        .map((s) => ({
          sessionId: s.sessionId,
          id: s.sessionId,
          title: s.title,
          materialId: s.materialId,
          materialIds: s.materialIds || [],
          createdAt: s.createdAt,
          updatedAt: s.createdAt,
        }));

      return res.json({ sessions });
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

      if (isSupabaseConfigured()) {
        try {
          const { data: session } = await supabase
            .from("conversations")
            .select("id, title, material_id, created_at")
            .eq("id", sessionId)
            .maybeSingle();

          const { data: messages, error } = await supabase
            .from("messages")
            .select("id, role, content, sources, created_at")
            .eq("conversation_id", sessionId)
            .order("created_at", { ascending: true });

          if (session) {
            return res.json({
              session: {
                sessionId: session.id,
                title: session.title,
                materialId: session.material_id,
                materialIds: session.material_id ? [session.material_id] : [],
              },
              messages: (messages || []).map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                sources: m.sources || [],
                createdAt: m.created_at,
              })),
            });
          }
        } catch (sErr) {
          console.warn("Supabase getSessionHistory notice:", sErr.message);
        }
      }

      const memSession = inMemorySessions.get(sessionId);
      if (memSession) {
        return res.json({
          session: {
            sessionId: memSession.sessionId,
            title: memSession.title,
            materialId: memSession.materialId,
            materialIds: memSession.materialIds,
          },
          messages: memSession.messages || [],
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

      if (isSupabaseConfigured()) {
        try {
          const { data: session } = await supabase
            .from("conversations")
            .select("material_id")
            .eq("id", sessionId)
            .maybeSingle();

          if (session?.material_id && !activeMaterialId) {
            activeMaterialId = session.material_id;
          }

          const { data: recentMsgs } = await supabase
            .from("messages")
            .select("role, content")
            .eq("conversation_id", sessionId)
            .order("created_at", { ascending: false })
            .limit(6);

          history = (recentMsgs || []).reverse();
        } catch (sErr) {
          console.warn("Supabase fetch context notice:", sErr.message);
        }
      } else {
        const memSession = inMemorySessions.get(sessionId);
        if (memSession) {
          if (!activeMaterialId && memSession.materialId) {
            activeMaterialId = memSession.materialId;
          }
          history = (memSession.messages || []).slice(-6).map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }
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
        createdAt: new Date().toISOString(),
      };

      const aiMsg = {
        id: `msg_a_${Date.now()}`,
        role: "assistant",
        content: aiResponse.content,
        sources: aiResponse.sources || [],
        groundedInNotes: aiResponse.groundedInNotes || false,
        isGeneralKnowledge: aiResponse.isGeneralKnowledge || false,
        createdAt: new Date().toISOString(),
      };

      if (isSupabaseConfigured()) {
        try {
          await supabase.from("messages").insert([
            {
              conversation_id: sessionId,
              role: "user",
              content: question.trim(),
            },
            {
              conversation_id: sessionId,
              role: "assistant",
              content: aiResponse.content,
              sources: aiResponse.sources || [],
            },
          ]);

          // Update updated_at timestamp on conversation
          await supabase
            .from("conversations")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId);
        } catch (sErr) {
          console.warn("Supabase insert messages notice:", sErr.message);
        }
      } else {
        const memSession = inMemorySessions.get(sessionId);
        if (memSession) {
          memSession.messages.push(userMsg);
          memSession.messages.push(aiMsg);
        }
      }

      return res.json({
        id: aiMsg.id,
        role: "assistant",
        content: aiResponse.content,
        sources: aiResponse.sources,
        groundedInNotes: aiResponse.groundedInNotes,
        isGeneralKnowledge: aiResponse.isGeneralKnowledge,
        createdAt: aiMsg.createdAt,
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

      if (isSupabaseConfigured()) {
        try {
          await supabase
            .from("conversations")
            .delete()
            .eq("id", sessionId)
            .eq("user_id", String(userId));
        } catch (sErr) {
          console.warn("Supabase deleteSession notice:", sErr.message);
        }
      }

      inMemorySessions.delete(sessionId);
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
