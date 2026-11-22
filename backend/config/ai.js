import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const geminiKey = process.env.GEMINI_API_KEY || (process.env.AI_PROVIDER === "gemini" ? process.env.AI_API_KEY : null);
const provider = (geminiKey ? "gemini" : (process.env.AI_PROVIDER || "openai")).toLowerCase();
const apiKey = geminiKey || process.env.AI_API_KEY;
const model = process.env.AI_MODEL || (provider === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini");
const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

export const isAiConfigured = () => {
  return Boolean(
    apiKey &&
    !apiKey.includes("your-api-key") &&
    apiKey.length > 8
  );
};

export const getAiProvider = () => provider;

/**
 * Universal Chat Completion Dispatcher
 * Compatible with Google Gemini, OpenAI, Groq, and Ollama
 */
export async function generateChatCompletion({ messages = [], temperature = 0.3, maxTokens = 1200 }) {
  if (!isAiConfigured()) {
    throw new Error("AI API Key is not configured. Please supply GEMINI_API_KEY or AI_API_KEY in backend/.env.");
  }

  // 1. Google Gemini API
  if (provider === "gemini") {
    const cleanModel = model.startsWith("models/") ? model : `models/${model}`;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${cleanModel}:generateContent?key=${apiKey}`;

    // Separate system messages from user/model turns
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversationMessages = messages.filter((m) => m.role !== "system");

    const systemInstructionText = systemMessages.map((m) => m.content).join("\n\n");

    const contents = conversationMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }],
    }));

    // Ensure first message is user
    if (contents.length === 0 || contents[0].role !== "user") {
      contents.unshift({ role: "user", parts: [{ text: "Hello" }] });
    }

    const payload = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
    };

    if (systemInstructionText) {
      payload.systemInstruction = {
        parts: [{ text: systemInstructionText }],
      };
    }

    const response = await axios.post(geminiUrl, payload, { timeout: 15000 });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return text.trim();
  }

  // 2. OpenAI / Groq / Ollama / OpenAI-compatible endpoint
  let baseURL = "https://api.openai.com/v1";
  if (provider === "groq") baseURL = "https://api.groq.com/openai/v1";
  if (provider === "ollama") baseURL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";

  const response = await axios.post(
    `${baseURL}/chat/completions`,
    {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  return response.data?.choices?.[0]?.message?.content?.trim() || "";
}

/**
 * Generate 1536-dimensional Vector Embedding for text chunks
 */
export async function generateEmbedding(text) {
  if (!isAiConfigured()) {
    return generateDeterministicEmbedding(text, 1536);
  }

  try {
    if (provider === "gemini") {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;
      const response = await axios.post(geminiUrl, {
        model: "models/text-embedding-004",
        content: { parts: [{ text: (text || "").slice(0, 2048) }] },
      }, { timeout: 10000 });
      const values = response.data?.embedding?.values || [];
      if (values.length < 1536) {
        return [...values, ...new Array(1536 - values.length).fill(0)];
      }
      return values.slice(0, 1536);
    }

    // Default: OpenAI Embeddings API
    const response = await axios.post(
      "https://api.openai.com/v1/embeddings",
      {
        model: embeddingModel,
        input: (text || "").slice(0, 8000),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    return response.data?.data?.[0]?.embedding || [];
  } catch (err) {
    return generateDeterministicEmbedding(text, 1536);
  }
}

/**
 * Fallback deterministic vector generator for local testing
 */
function generateDeterministicEmbedding(text, dimensions = 1536) {
  const vector = new Array(dimensions).fill(0);
  const clean = String(text || "").toLowerCase();
  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    const idx = (charCode * 31 + i) % dimensions;
    vector[idx] += 1 / (1 + (i % 10));
  }
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
  return vector.map((v) => Number((v / norm).toFixed(6)));
}
