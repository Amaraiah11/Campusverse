import { generateChatCompletion, isAiConfigured } from "../config/ai.js";
import { ragService } from "./ragService.js";
import { supabase, isSupabaseConfigured } from "../config/supabase.js";

const STRICT_NOTES_SYSTEM_PROMPT = `You are CampusVerse AI, an intelligent academic study notes assistant.
Your mission is to answer student questions STRICTLY and ONLY based on the content of their selected uploaded study material ("VERIFIED CAMPUS STUDY NOTES CONTEXT").

CRITICAL MANDATORY RULES:
1. GREETINGS & CASUAL INTERACTION:
   - When the user sends a greeting (e.g., "Hi", "Hello", "Good morning", "Hey"), respond with a short, natural, friendly 1-2 sentence greeting and ask what they would like to know from their selected notes.
   - DO NOT generate an academic lecture, essay, or generic explanations for casual greetings.
   - When the user says "thank you" or "thanks", reply with a polite, short acknowledgment.

2. STRICT GROUNDING IN THE SELECTED DOCUMENT:
   - Every answer MUST be based SOLELY on the provided study notes context.
   - Never invent, assume, extrapolate, or hallucinate facts, equations, definitions, or steps not explicitly stated in the document.
   - Do NOT use general internet knowledge to answer questions outside the provided notes.

3. UNRELATED QUESTIONS:
   - If the user's question is unrelated to the subject matter of the uploaded document (e.g. pop culture, cooking, sports, politics, or completely different disciplines), you MUST respond with this exact sentence:
     "This question is not related to the uploaded material, so I cannot answer it based on these notes."

4. INFORMATION NOT IN DOCUMENT:
   - If the question is about the topic or subject but the specific answer, fact, or definition is NOT available in the provided document context, you MUST respond with this exact sentence:
     "The answer is not available in the uploaded material."

5. INDEPENDENT, QUESTION-SPECIFIC ANSWERS:
   - Every answer must directly address the specific question asked. Never reuse a generic template or boilerplate text.
   - For definitions: state the exact definition from the notes.
   - For algorithms/mechanisms: state the precise steps or formulas given in the notes.
   - For comparisons: clearly contrast the concepts as described in the notes.
   - For summaries: summarize the actual concepts found in the notes.

6. CITATION:
   - Whenever an answer is derived from the notes, cite the exact source at the end:
     "Source: [Document Title] – Page [Page Number]"`;

export const chatbotService = {
  isGreeting(text) {
    return /^(?:hi+|hello+|hey+|heya|howdy|greetings|good\s+(?:morning|afternoon|evening|day)|sup|yo|what'?s\s+up)[!?.\s]*$/i.test(
      text.trim()
    );
  },

  isGratitude(text) {
    return /^(?:thanks?|thank\s+you|thx|cheers|appreciate\s+it|many\s+thanks)[!?.\s]*$/i.test(
      text.trim()
    );
  },

  isMetaHelp(text) {
    return /^(?:who\s+are\s+you|what\s+can\s+you\s+do|how\s+to\s+use|help(?:\s+me)?)[!?.\s]*$/i.test(
      text.trim()
    );
  },

  isSummaryRequest(text) {
    return /\b(?:summarize|summary|overview|key\s+points|main\s+takeaways|brief|give\s+summary|explain\s+this\s+doc)\b/i.test(
      text
    );
  },

  isExamPrepRequest(text) {
    return /\b(?:exam\s+questions?|important\s+questions?|quiz\s+me|practice\s+questions?|test\s+prep|revision\s+notes)\b/i.test(
      text
    );
  },

  /**
   * Main Answer Generator with RAG and LLM / Local AI
   */
  async answerQuestion({ question, conversationHistory = [], materialId = null, materialIds = [] }) {
    const rawQuestion = (question || "").trim();
    const qLower = rawQuestion.toLowerCase();

    // 1. Natural Short Greeting Handling (No generic lecture)
    if (this.isGreeting(qLower)) {
      return {
        content: `Hello! 👋 How can I help you with your selected notes today? Ask me any question, definition, or summary from your document.`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    // 2. Natural Gratitude Handling
    if (this.isGratitude(qLower)) {
      return {
        content: `You're welcome! Feel free to ask if you have any more questions about your notes.`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    // 3. Bot Identity & Capabilities
    if (this.isMetaHelp(qLower)) {
      return {
        content: `I'm **CampusVerse AI**, your study notes assistant.\n\nI answer your questions strictly grounded in your selected uploaded study material with exact page references. Select any document from the left sidebar to ask questions about it!`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    // 4. Gather Target Selected Materials
    const targetMaterialIds = [];
    if (materialId) targetMaterialIds.push(materialId);
    if (Array.isArray(materialIds)) {
      materialIds.forEach((id) => {
        if (id && !targetMaterialIds.includes(id)) targetMaterialIds.push(id);
      });
    }

    let selectedMaterials = [];
    if (targetMaterialIds.length > 0) {
      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase
            .from("materials")
            .select("*")
            .in("id", targetMaterialIds);
          if (!error && Array.isArray(data)) {
            selectedMaterials = data;
          }
        } catch (err) {
          console.warn("Could not load selected materials from Supabase:", err.message);
        }
      }
    }

    // If no document is selected at all, guide the user
    if (selectedMaterials.length === 0) {
      return {
        content: `Please select an uploaded document from the left panel so I can answer questions grounded in your notes.`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    const selectedDoc = selectedMaterials[0];
    const docFullText = (selectedDoc.extracted_text || selectedDoc.description || "").toLowerCase();
    const docTitle = selectedDoc.title || "Selected Study Notes";
    const docSubject = (selectedDoc.subject || selectedDoc.department || "").toLowerCase();

    // 5. Check if the question is completely unrelated to the selected document's domain/content
    const stopWords = new Set([
      "where", "is", "are", "can", "i", "find", "notes", "note", "about", "what",
      "how", "to", "explain", "explained", "the", "a", "an", "in", "on", "for",
      "of", "with", "by", "at", "from", "show", "me", "give", "please", "search",
      "tell", "does", "do", "did", "why", "which", "who", "whom", "whose", "it",
      "this", "that", "these", "those"
    ]);

    const qTokens = rawQuestion
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stopWords.has(t));

    // Determine domain overlap: check if any query token or 3+ char substring matches doc text or title or subject
    const titleLower = docTitle.toLowerCase();
    const docCombined = `${docFullText} ${titleLower} ${docSubject}`;

    const matchingTokens = qTokens.filter((token) => docCombined.includes(token));
    const tokenRatio = qTokens.length > 0 ? matchingTokens.length / qTokens.length : 1;

    // If completely unrelated (0 matching content tokens)
    if (matchingTokens.length === 0 && qTokens.length > 0 && !this.isSummaryRequest(qLower) && !this.isExamPrepRequest(qLower)) {
      return {
        content: `This question is not related to the uploaded material, so I cannot answer it based on these notes.`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    // If the question is about concepts not covered in the notes (low token coverage)
    if (qTokens.length >= 2 && tokenRatio < 0.5 && !this.isSummaryRequest(qLower) && !this.isExamPrepRequest(qLower)) {
      return {
        content: `The answer is not available in the uploaded material.`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    // 6. RAG Retrieval via Supabase chunks & embeddings
    const retrievedChunks = await ragService.retrieveContext(rawQuestion, {
      filterMaterialId: selectedDoc.id,
      materialIds: [selectedDoc.id],
      limit: 4,
      threshold: 0.3,
      conversationHistory,
    });

    const hasRelevantChunks = retrievedChunks.length > 0 && (retrievedChunks[0].score || 0) > 0;

    // 7. If AI API (Gemini / OpenAI) is configured, invoke LLM with strict grounding
    if (isAiConfigured()) {
      try {
        let contextSection = "";
        if (hasRelevantChunks) {
          contextSection =
            `\n\nVERIFIED CAMPUS STUDY NOTES CONTEXT (Source: "${docTitle}"):\n` +
            retrievedChunks
              .map(
                (c, i) =>
                  `[Chunk ${i + 1} | Page ${c.pageNumber}]:\n${c.snippet}`
              )
              .join("\n\n");
        } else {
          // If no specific chunk matched, provide the full extracted text slice
          contextSection =
            `\n\nVERIFIED CAMPUS STUDY NOTES CONTEXT (Source: "${docTitle}"):\n` +
            (selectedDoc.extracted_text || selectedDoc.description || "").slice(0, 3500);
        }

        const messages = [
          { role: "system", content: STRICT_NOTES_SYSTEM_PROMPT },
          ...conversationHistory.slice(-4).map((msg) => ({
            role: msg.role === "assistant" ? "assistant" : "user",
            content: msg.content,
          })),
          {
            role: "user",
            content: `Document Title: "${docTitle}"\nSubject: "${selectedDoc.subject || ""}"\nUser Question: ${rawQuestion}${contextSection}`,
          },
        ];

        const responseText = await generateChatCompletion({
          messages,
          temperature: 0.1,
          maxTokens: 1000,
        });

        const isGrounded = responseText && !responseText.includes("not related to the uploaded material") && !responseText.includes("not available in the uploaded material");

        return {
          content: responseText,
          sources: isGrounded && hasRelevantChunks
            ? retrievedChunks.map((c) => ({
                materialId: c.materialId,
                title: c.title,
                pageNumber: c.pageNumber,
                snippet: c.snippet.slice(0, 200),
              }))
            : [],
          groundedInNotes: isGrounded,
          isGeneralKnowledge: false,
        };
      } catch (llmErr) {
        console.warn("LLM generation warning, using high-precision local notes engine:", llmErr.message);
      }
    }

    // 8. High-Precision Local Context Extraction Engine (Deterministic, strictly grounded)
    return this.synthesizeStrictLocalResponse({
      question: rawQuestion,
      qTokens,
      selectedDoc,
      retrievedChunks,
      hasRelevantChunks,
      isSummary: this.isSummaryRequest(qLower),
      isExamPrep: this.isExamPrepRequest(qLower),
    });
  },

  /**
   * Deterministic, strictly grounded context synthesis from the selected document
   */
  synthesizeStrictLocalResponse({
    question,
    qTokens,
    selectedDoc,
    retrievedChunks,
    hasRelevantChunks,
    isSummary,
    isExamPrep,
  }) {
    const docTitle = selectedDoc.title;
    const docText = selectedDoc.extracted_text || selectedDoc.description || "";

    // 1. Handle Summary Request strictly from document
    if (isSummary) {
      const summaryContent = selectedDoc.summary || selectedDoc.description || docText.slice(0, 400);
      const chunks = selectedDoc.chunks || [];
      const keyPoints = chunks.length > 0
        ? chunks.map((c) => `- **Page ${c.pageNumber}:** ${c.text.slice(0, 150)}...`).join("\n")
        : `- **Overview:** ${summaryContent}`;

      return {
        content: `### 📄 Summary: ${docTitle}\n\n**Subject:** ${selectedDoc.subject || "Academic Study"}\n\n#### Core Overview:\n${summaryContent}\n\n#### Key Sections in Document:\n${keyPoints}\n\n---\n*Source: ${docTitle} – Page 1.*`,
        sources: [
          {
            materialId: selectedDoc.id,
            title: docTitle,
            pageNumber: 1,
            snippet: summaryContent.slice(0, 180),
          },
        ],
        groundedInNotes: true,
        isGeneralKnowledge: false,
      };
    }

    // 2. Handle Exam Prep Request strictly from document
    if (isExamPrep) {
      const chunks = selectedDoc.chunks || [];
      const questionsList = [];
      if (chunks.length > 0) {
        chunks.slice(0, 3).forEach((c, idx) => {
          const firstSentence = c.text.split(/[.\n]/)[0] || "";
          questionsList.push(`${idx + 1}. Based on Page ${c.pageNumber}: Explain the core concept: "${firstSentence.slice(0, 100)}..."`);
        });
      } else {
        questionsList.push(`1. Explain the main framework and definitions presented in ${docTitle}.`);
      }

      return {
        content: `### 🎯 Exam Preparation Questions for "${docTitle}"\n\nHere are targeted revision questions derived directly from the notes:\n\n${questionsList.join("\n\n")}\n\n---\n*Source: ${docTitle} – Grounded in Verified Campus Notes.*`,
        sources: [
          {
            materialId: selectedDoc.id,
            title: docTitle,
            pageNumber: 1,
            snippet: (selectedDoc.description || docTitle).slice(0, 180),
          },
        ],
        groundedInNotes: true,
        isGeneralKnowledge: false,
      };
    }

    // 3. If no relevant chunk was found or score is 0
    if (!hasRelevantChunks) {
      return {
        content: `The answer is not available in the uploaded material.`,
        sources: [],
        groundedInNotes: false,
        isGeneralKnowledge: false,
      };
    }

    // 4. Relevant chunk exists: Extract direct answer from the matching chunk
    const topChunk = retrievedChunks[0];
    const chunkText = topChunk.snippet;

    // Split chunk into sentences or bullet points and isolate the exact matching sentences
    const sentences = chunkText.split(/(?<=[.!?\n])\s+/).filter(Boolean);
    const matchingSentences = sentences.filter((s) => {
      const sLower = s.toLowerCase();
      return qTokens.some((t) => sLower.includes(t));
    });

    let answerBody = "";
    if (matchingSentences.length > 0) {
      answerBody = matchingSentences.join(" ");
    } else {
      answerBody = chunkText;
    }

    // Format clean direct response
    const formattedContent = `Based on **${docTitle}** (Page ${topChunk.pageNumber}):\n\n${answerBody}\n\n---\n*Source: ${docTitle} – Page ${topChunk.pageNumber}*`;

    return {
      content: formattedContent,
      sources: [
        {
          materialId: topChunk.materialId,
          title: topChunk.title,
          pageNumber: topChunk.pageNumber,
          snippet: chunkText.slice(0, 180),
        },
      ],
      groundedInNotes: true,
      isGeneralKnowledge: false,
    };
  },
};
