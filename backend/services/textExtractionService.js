import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import zlib from "zlib";

export const textExtractionService = {
  /**
   * Extract plain text, page count, and page-by-page mapping from uploaded buffer
   */
  async extractText(fileBuffer, fileType) {
    const type = String(fileType || "PDF").toUpperCase();

    try {
      if (type === "PDF") {
        return await this.extractPdf(fileBuffer);
      }

      if (type === "DOCX" || type === "DOC") {
        return await this.extractDocx(fileBuffer);
      }

      if (type === "PPTX" || type === "PPT") {
        return await this.extractPptx(fileBuffer);
      }

      // Fallback text extraction
      const rawText = fileBuffer.toString("utf-8");
      return {
        text: rawText,
        pageCount: 1,
        pages: [{ pageNumber: 1, text: rawText }],
      };
    } catch (err) {
      console.error(`Text extraction failed for ${type}:`, err.message);
      return {
        text: "",
        pageCount: 1,
        pages: [],
        error: `Could not extract text: ${err.message}`,
      };
    }
  },

  /**
   * Resilient native PDF text stream extractor
   */
  extractPdfNative(buffer) {
    const str = buffer.toString("latin1");
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    let extracted = "";

    while ((match = streamRegex.exec(str)) !== null) {
      const streamData = Buffer.from(match[1], "latin1");
      let textChunk = "";
      try {
        textChunk = zlib.inflateSync(streamData).toString("latin1");
      } catch {
        try {
          textChunk = zlib.inflateRawSync(streamData).toString("latin1");
        } catch {
          textChunk = streamData.toString("latin1");
        }
      }

      // Match hex strings like <4F7065...> Tj
      const hexMatches = textChunk.match(/<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g) || [];
      for (const h of hexMatches) {
        const hex = h.replace(/[^0-9a-fA-F]/g, "");
        let converted = "";
        for (let i = 0; i < hex.length; i += 2) {
          converted += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
        }
        extracted += converted + " ";
      }

      // Match literal strings like (Hello World) Tj
      const literalMatches = textChunk.match(/\(([^()]*)\)\s*(?:Tj|'|")/g) || [];
      for (const lit of literalMatches) {
        const inner = lit.replace(/^\(|\)\s*(?:Tj|'|")$/g, "");
        extracted += inner + " ";
      }

      // Match array strings in TJ operators like [ (Text) 10 (More) ] TJ
      const tjMatches = textChunk.match(/\[([\s\S]*?)\]\s*TJ/g) || [];
      for (const tj of tjMatches) {
        const parts = tj.match(/\(([^()]*)\)|<([0-9a-fA-F]+)>/g) || [];
        for (const p of parts) {
          if (p.startsWith("(")) {
            extracted += p.slice(1, -1) + " ";
          } else if (p.startsWith("<")) {
            const hex = p.replace(/[^0-9a-fA-F]/g, "");
            let converted = "";
            for (let i = 0; i < hex.length; i += 2) {
              converted += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
            }
            extracted += converted + " ";
          }
        }
      }
    }

    const pageMatches = str.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || [];
    const pageCount = Math.max(1, pageMatches.length);

    return {
      text: extracted.replace(/\s+/g, " ").trim(),
      pageCount,
    };
  },

  async extractPdf(buffer) {
    let text = "";
    let pageCount = 1;

    try {
      const data = await pdfParse(buffer);
      if (data && data.text && data.text.trim().length > 10) {
        text = data.text;
        pageCount = data.numpages || 1;
      }
    } catch {
      // Non-fatal; native stream extractor is used below
    }

    if (!text || text.trim().length < 15) {
      const native = this.extractPdfNative(buffer);
      text = native.text;
      pageCount = native.pageCount || pageCount;
    }

    // Split text by form-feed character (\f) which indicates page breaks in pdf-parse
    const rawPages = text.split(/\f/);
    const pages = rawPages.map((pageText, idx) => ({
      pageNumber: idx + 1,
      text: pageText.trim(),
    })).filter((p) => p.text.length > 0);

    return {
      text: text.trim(),
      pageCount,
      pages: pages.length > 0 ? pages : [{ pageNumber: 1, text: text.trim() }],
    };
  },

  async extractDocx(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const text = result.value || "";

    // Approximate page count: ~400 words per page in typical academic documents
    const words = text.split(/\s+/).filter(Boolean);
    const estimatedPages = Math.max(1, Math.ceil(words.length / 400));

    // Create virtual pages
    const chunkSize = Math.ceil(words.length / estimatedPages) || 1;
    const pages = [];
    for (let i = 0; i < estimatedPages; i++) {
      const slice = words.slice(i * chunkSize, (i + 1) * chunkSize).join(" ");
      if (slice) {
        pages.push({ pageNumber: i + 1, text: slice });
      }
    }

    return {
      text: text.trim(),
      html: htmlResult.value || "",
      pageCount: estimatedPages,
      pages,
    };
  },

  async extractPptx(buffer) {
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();

      // Find and sort all slide XML files (e.g. ppt/slides/slide1.xml)
      const slideEntries = zipEntries
        .filter((e) => e.entryName.startsWith("ppt/slides/slide") && e.entryName.endsWith(".xml"))
        .sort((a, b) => {
          const numA = parseInt(a.entryName.replace(/\D/g, ""), 10) || 0;
          const numB = parseInt(b.entryName.replace(/\D/g, ""), 10) || 0;
          return numA - numB;
        });

      if (slideEntries.length > 0) {
        const pages = [];
        const fullTexts = [];

        slideEntries.forEach((entry, idx) => {
          const xml = entry.getData().toString("utf-8");
          const textMatches = xml.match(/<a:t>([^<]+)<\/a:t>/g) || [];
          const slideText = textMatches
            .map((t) => t.replace(/<\/?a:t>/g, "").trim())
            .filter(Boolean)
            .join(" ");

          const pageNum = idx + 1;
          pages.push({
            pageNumber: pageNum,
            text: slideText || `Slide ${pageNum} presentation layout and points.`,
          });
          if (slideText) fullTexts.push(slideText);
        });

        const fullText = fullTexts.join("\n\n");
        return {
          text: fullText || "Presentation slides with curriculum outlines.",
          pageCount: pages.length,
          pages,
        };
      }
    } catch (zipErr) {
      console.warn("AdmZip PPTX parsing notice:", zipErr.message);
    }

    // Fallback if not standard XML package
    const str = buffer.toString("utf-8");
    const textSegments = str.match(/<a:t>([^<]+)<\/a:t>/g) || [];
    const extracted = textSegments
      .map((tag) => tag.replace(/<\/?a:t>/g, "").trim())
      .filter((t) => t.length > 1)
      .join(" ");

    const slideMatches = str.match(/ppt\/slides\/slide\d+\.xml/g) || [];
    const slideCount = Math.max(1, new Set(slideMatches).size);

    return {
      text: extracted || "Presentation slides content.",
      pageCount: slideCount,
      pages: [{ pageNumber: 1, text: extracted || "Presentation slides content." }],
    };
  },
};
