import { generateEmbedding } from "../config/ai.js";
import { supabase, isSupabaseConfigured } from "../config/supabase.js";
import { isMongoConnected, Material } from "../database/mongodb.js";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "is", "are", "was", "were", "be", "been", "being",
  "in", "on", "at", "to", "for", "with", "by", "about", "against", "between", "into", "through",
  "during", "before", "after", "above", "below", "from", "up", "down", "in", "out", "over", "under",
  "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now",
  "what", "tell", "me", "explain", "give", "notes", "please", "summary", "summarize",
]);

export const ragService = {
  /**
   * Retrieve relevant document chunks using MongoDB chunk search + Supabase pgvector
   */
  async retrieveContext(question, { filterMaterialId = null, materialIds = [], limit = 5, threshold = 0.5, conversationHistory = [] } = {}) {
    if (!question || !question.trim()) return [];

    const targetIds = [];
    if (filterMaterialId) targetIds.push(filterMaterialId);
    if (Array.isArray(materialIds)) {
      materialIds.forEach((id) => {
        if (id && !targetIds.includes(id)) targetIds.push(id);
      });
    }

    // 1. First priority: MongoDB stored materials and chunks
    if (isMongoConnected()) {
      try {
        let query = {};
        if (targetIds.length > 0) {
          query = { id: { $in: targetIds } };
        }

        const materials = await Material.find(query).lean();
        if (materials && materials.length > 0) {
          const scoredChunks = [];

          const rawTokens = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
          let queryKeywords = rawTokens.filter((w) => w.length > 2 && !STOP_WORDS.has(w));

          // If follow-up question has few content keywords, incorporate keywords from conversation history
          if (queryKeywords.length <= 1 && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
            const lastTurn = conversationHistory.slice(-2).map((m) => m.content || "").join(" ");
            const historyTokens = lastTurn.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
            queryKeywords = Array.from(new Set([...queryKeywords, ...historyTokens.slice(-6)]));
          }

          for (const mat of materials) {
            let chunks = Array.isArray(mat.chunks) && mat.chunks.length > 0 ? mat.chunks : [];

            // If no chunks array yet, create virtual chunks from extracted_text or description
            if (chunks.length === 0 && (mat.extracted_text || mat.description)) {
              const fullText = mat.extracted_text || mat.description || "";
              const paragraphs = fullText.split(/\n\s*\n/).filter((p) => p.trim().length > 30);
              if (paragraphs.length > 0) {
                chunks = paragraphs.map((p, idx) => ({ pageNumber: idx + 1, text: p.trim() }));
              } else {
                chunks = [{ pageNumber: 1, text: fullText.trim() }];
              }
            }

            for (const chunk of chunks) {
              const chunkText = (chunk.text || "").trim();
              if (!chunkText) continue;

              const chunkLower = chunkText.toLowerCase();
              let score = 0;
              let distinctMatches = 0;

              for (const kw of queryKeywords) {
                if (chunkLower.includes(kw)) {
                  distinctMatches += 1;
                  // Count occurrences
                  const count = (chunkLower.match(new RegExp(`\\b${kw}`, "g")) || []).length;
                  score += count * 2;
                }
              }

              score += distinctMatches * 3;

              // Check for 2-word phrase matches
              for (let i = 0; i < queryKeywords.length - 1; i++) {
                const phrase = `${queryKeywords[i]} ${queryKeywords[i + 1]}`;
                if (chunkLower.includes(phrase)) {
                  score += 6;
                }
              }

              if (score > 0) {
                scoredChunks.push({
                  chunkId: `${mat.id}_p${chunk.pageNumber || 1}`,
                  materialId: mat.id,
                  title: mat.title,
                  pageNumber: chunk.pageNumber || 1,
                  snippet: chunkText,
                  score,
                  similarity: Math.min(0.98, 0.5 + score * 0.05),
                });
              }
            }
          }

          if (scoredChunks.length > 0) {
            scoredChunks.sort((a, b) => b.score - a.score);
            return scoredChunks.slice(0, limit);
          }
        }
      } catch (mErr) {
        console.warn("MongoDB RAG search notice:", mErr.message);
      }
    }

    // 2. Supabase pgvector search fallback if configured
    if (isSupabaseConfigured()) {
      try {
        const queryEmbedding = await generateEmbedding(question.trim());
        const { data, error } = await supabase.rpc("match_material_chunks", {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: limit,
          filter_material_id: filterMaterialId || null,
        });

        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map((row) => ({
            chunkId: row.id,
            materialId: row.material_id,
            title: row.material_title || "Campus Study Note",
            pageNumber: row.page_number,
            snippet: row.chunk_text,
            similarity: Number(row.similarity) || 0.8,
          }));
        }
      } catch (err) {
        console.error("Supabase RAG retrieval error:", err.message);
      }
    }

    return [];
  },
};
