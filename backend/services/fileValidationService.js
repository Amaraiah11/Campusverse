import crypto from "crypto";

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".doc", ".pptx", ".ppt"];
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/octet-stream",
];

const MAX_WORDS_DESCRIPTION = parseInt(process.env.MAX_DESCRIPTION_WORDS || "25", 10);
const MAX_PAGES = parseInt(process.env.MAX_PAGE_COUNT || "150", 10);
const MAX_SLIDES = parseInt(process.env.MAX_SLIDE_COUNT || "150", 10);
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_MB || "25", 10) * 1024 * 1024;

export const fileValidationService = {
  /**
   * Validate description word count (maximum 25 words)
   */
  validateDescription(description) {
    if (!description || !description.trim()) {
      return { isValid: false, message: "Description is required." };
    }
    const words = description.trim().split(/\s+/).filter(Boolean);
    if (words.length > MAX_WORDS_DESCRIPTION) {
      return {
        isValid: false,
        message: `Description exceeds the maximum limit of ${MAX_WORDS_DESCRIPTION} words (currently ${words.length} words).`,
      };
    }
    return { isValid: true, wordCount: words.length };
  },

  /**
   * Validate uploaded file type, size, and integrity
   */
  validateFile(file) {
    if (!file) {
      return { isValid: false, message: "No file was uploaded." };
    }

    if (!file.buffer || file.buffer.length === 0) {
      return { isValid: false, message: "Uploaded file is empty (0 bytes)." };
    }

    if (file.buffer.length > MAX_FILE_SIZE_BYTES) {
      const maxMb = MAX_FILE_SIZE_BYTES / (1024 * 1024);
      return {
        isValid: false,
        message: `File size exceeds the allowed limit of ${maxMb}MB.`,
      };
    }

    const originalName = file.originalname || "";
    const ext = originalName.includes(".") ? `.${originalName.split(".").pop().toLowerCase()}` : "";

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return {
        isValid: false,
        message: `Unsupported file format '${ext}'. Allowed formats: PDF, DOCX, DOC, PPTX, PPT.`,
      };
    }

    // Check for corrupt or malicious double extension (e.g. notes.pdf.exe)
    if (/\.(exe|bat|cmd|sh|vbs|js|php|py)\b/i.test(originalName)) {
      return {
        isValid: false,
        message: "Executable or scripted file extensions are strictly prohibited.",
      };
    }

    return {
      isValid: true,
      extension: ext,
      fileType: ext.replace(".", "").toUpperCase(),
      sizeBytes: file.buffer.length,
      sizeFormatted:
        file.buffer.length < 1024 * 1024
          ? `${(file.buffer.length / 1024).toFixed(1)} KB`
          : `${(file.buffer.length / (1024 * 1024)).toFixed(1)} MB`,
    };
  },

  /**
   * Validate page and slide counts (Max 150 pages / 150 slides)
   */
  validatePageCounts(fileType, pageCount) {
    const count = parseInt(pageCount || "1", 10);
    const isPresentation = ["PPT", "PPTX"].includes(fileType.toUpperCase());

    if (isPresentation && count > MAX_SLIDES) {
      return {
        isValid: false,
        message: `Presentation contains ${count} slides, which exceeds the maximum limit of ${MAX_SLIDES} slides.`,
      };
    }

    if (!isPresentation && count > MAX_PAGES) {
      return {
        isValid: false,
        message: `Document contains ${count} pages, which exceeds the maximum limit of ${MAX_PAGES} pages.`,
      };
    }

    return { isValid: true, pageCount: count };
  },

  /**
   * Calculate SHA-256 hash to detect exact duplicate files
   */
  computeFileHash(buffer) {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  },
};
