import { generateEmbedding } from "../config/ai.js";
import { supabase, isSupabaseConfigured } from "../config/supabase.js";

export const embeddingService = {
  /**
   * Split document pages into manageable semantic chunks (500–800 chars)
   */
  chunkDocument(pages) {
    const chunks = [];
    let chunkIndex = 0;

    for (const page of pages) {
      const pageNum = page.pageNumber || 1;
      const text = page.text || "";

      // Split page text into sentences / paragraphs
      const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

      for (const para of paragraphs) {
        if (para.length <= 800) {
          chunks.push({
            chunkIndex: chunkIndex++,
            pageNumber: pageNum,
            text: para.trim(),
          });
        } else {
          // Break large paragraphs into sub-chunks
          const words = para.split(/\s+/);
          let current = [];
          for (const word of words) {
            current.push(word);
            if (current.join(" ").length >= 600) {
              chunks.push({
                chunkIndex: chunkIndex++,
                pageNumber: pageNum,
                text: current.join(" "),
              });
              current = [];
            }
          }
          if (current.length > 0) {
            chunks.push({
              chunkIndex: chunkIndex++,
              pageNumber: pageNum,
              text: current.join(" "),
            });
          }
        }
      }
    }

    return chunks;
  },

  /**
   * Process and store embeddings in Supabase PostgreSQL pgvector
   */
  async processAndStoreMaterialChunks(materialId, pages) {
    const chunks = this.chunkDocument(pages);
    if (chunks.length === 0) return [];

    console.log(`Processing ${chunks.length} chunks for material ${materialId}...`);

    const chunkRecords = [];

    // Process chunks and generate embeddings
    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk.text);
        chunkRecords.push({
          material_id: materialId,
          chunk_text: chunk.text,
          page_number: chunk.pageNumber,
          chunk_index: chunk.chunkIndex,
          embedding,
        });
      } catch (err) {
        console.error(`Error generating embedding for chunk ${chunk.chunkIndex}:`, err.message);
      }
    }

    // Insert records into Supabase if configured
    if (isSupabaseConfigured() && chunkRecords.length > 0) {
      const { error } = await supabase.from("material_chunks").insert(chunkRecords);
      if (error) {
        console.error("Error inserting material_chunks into Supabase:", error.message);
      } else {
        console.log(`Successfully stored ${chunkRecords.length} chunks in pgvector.`);
      }
    }

    return chunkRecords;
  },
};
