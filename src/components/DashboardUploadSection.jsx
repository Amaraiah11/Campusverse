import { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  X,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Send,
  Layers,
  FileSearch,
  Scan,
  Trash2,
  Tag,
} from "lucide-react";
import {
  inspectDocumentFile,
  classifyAcademicContent,
  ACADEMIC_CATEGORIES,
  MAX_ALLOWED_PAGES,
} from "../services/documentScanner";
import { materialsApi, classifierApi } from "../services/endpoints";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import MarkdownSummary from "./MarkdownSummary";
import StructuredSummaryView from "./StructuredSummaryView";

export const SUPPORTED_DOC_CATEGORIES = [
  "Study Material",
  "Resume / CV",
  "Project Report",
  "Research Paper",
  "Presentation",
  "Assignment",
];

/**
 * Cleans raw filenames and document titles:
 * - Strips unwanted prefixes/noise like "Module5", "Module 5", "Unit 2", "Chapter 3", "Ch 4"
 * - Strips format markers like "pdf", "docx", "pptx", "document", "file"
 * - Strips duplicate tags like "(1)", "[2]"
 * - Strips versioning/draft tags like "v1", "final", "draft"
 * - Formats into clean, readable Title Case (preserving acronyms like CPU, SQL, AI, ECG)
 */
export function sanitizeDocumentTitle(rawTitle) {
  if (!rawTitle || typeof rawTitle !== "string") return "";

  let cleaned = rawTitle.trim();
  try {
    cleaned = decodeURIComponent(cleaned.replace(/\+/g, " "));
  } catch {}

  // 1. Remove file extensions (.pdf, .docx, .ppt, etc.)
  cleaned = cleaned.replace(/\.(pdf|docx?|pptx?|txt|md|rtf)$/i, "");

  // 2. Remove parenthesized/bracketed number tags like (1), [2], etc.
  cleaned = cleaned.replace(/\s*[\(\[]\d+[\)\]]/g, "");

  // 3. Remove "Module5", "Module 5", "Unit 2", "Chapter 3", "Ch 4", "Part 1", "Section A", etc.
  cleaned = cleaned.replace(/\b(?:module|mod|unit|chapter|ch|part|section|sec)\s*\d+[a-z]?[:\s_.-]*/gi, " ");
  cleaned = cleaned.replace(/\b(?:module|mod|unit|chapter|ch|part|section|sec)[:\s_.-]+/gi, " ");

  // 4. Remove file type noise words if present in body: "pdf", "docx", "document", "file"
  cleaned = cleaned.replace(/\b(?:pdf|docx?|pptx?|document|file|files)\b/gi, " ");

  // 5. Remove versioning, scan & copy markers: "v1", "v2", "version 1", "final", "draft", "copy", "scan", "scanned"
  cleaned = cleaned.replace(/\b(?:v\d+|ver\d+|version\s*\d+|final|draft|copy|scan|scanned|download|upload)\b/gi, " ");

  // 6. Replace symbols, dashes, underscores, and punctuation (preserving &)
  cleaned = cleaned.replace(/[_/\\|:;~`!@#$^*+=\-—]+/g, " ");

  // 7. Collapse spaces and trim
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // If cleaning over-stripped, fallback to cleaned original name
  if (cleaned.length < 3) {
    cleaned = rawTitle.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
  }

  // 8. Capitalize into clean Title Case (retaining uppercase acronyms like CPU, SQL, AI, ECG, AWS)
  const words = cleaned.split(/\s+/).filter(Boolean);
  const titleCased = words
    .map((w) => {
      if (w === "&") return "&";
      if (w.length <= 4 && w === w.toUpperCase() && !/^\d+$/.test(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");

  return titleCased;
}

/**
 * Validates that document title is specific and free of symbols / URL encodings.
 * Rejects symbols (%, @, #, _, $, etc.) and purely generic placeholder phrases (e.g. 'Module%201 Info', 'Unit 1').
 */
export function checkTitleValidity(rawTitle) {
  if (!rawTitle || !rawTitle.trim()) {
    return {
      isValid: false,
      message: "Give a proper title or rename the file",
    };
  }

  const trimmed = rawTitle.trim();

  // 1. Check for illegal symbols / url-encoded artifacts (%20, %, _, @, #, $, *, etc.)
  const symbolRegex = /[%@#$^*_+=\\~<>{}[\]|;/]/;
  const hasUrlEncoding = /%[0-9a-fA-F]{2}/.test(trimmed);
  if (symbolRegex.test(trimmed) || hasUrlEncoding) {
    return {
      isValid: false,
      message: "Give a proper title or rename the file",
    };
  }

  // 2. Check for vague or purely unspecific academic placeholder words
  const unspecificWords = new Set([
    "module", "unit", "chapter", "info", "information", "notes", "note",
    "doc", "document", "docx", "file", "files", "test", "temp", "sample",
    "scan", "scanned", "pdf", "untitled", "assignment", "homework",
    "presentation", "slides", "lecture", "class", "subject", "paper",
    "draft", "material", "materials", "download", "upload", "new",
    "data", "text", "page", "part", "section", "course", "syllabus"
  ]);

  const stopWords = new Set([
    "a", "an", "the", "of", "for", "in", "on", "and", "to", "with", "by", "at", "from"
  ]);

  const tokens = trimmed
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

  const nonNumericTokens = tokens.filter((t) => !/^\d+$/.test(t));
  const meaningfulTokens = nonNumericTokens.filter((t) => !stopWords.has(t));

  // If title is less than 3 chars or contains no letters or meaningful words
  if (trimmed.length < 3 || nonNumericTokens.length === 0 || meaningfulTokens.length === 0) {
    return {
      isValid: false,
      message: "Give a proper title or rename the file",
    };
  }

  // If ALL meaningful words are in the unspecific list (e.g. "Module 1 Info", "Unit 1 Notes")
  const isAllUnspecific = meaningfulTokens.every((t) => unspecificWords.has(t));
  if (isAllUnspecific) {
    return {
      isValid: false,
      message: "Give a proper title or rename the file",
    };
  }

  return { isValid: true, message: "" };
}

export default function DashboardUploadSection({ onUploadSuccess }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // Form State
  const [file, setFile] = useState(null);
  const [documentId, setDocumentId] = useState("");
  const [title, setTitle] = useState("");
  const [docCategory, setDocCategory] = useState("Study Material");
  const [description, setDescription] = useState("");
  const [isDescriptionUserEdited, setIsDescriptionUserEdited] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [academicCategory, setAcademicCategory] = useState("Engineering");
  const [course, setCourse] = useState(user?.course || "Computer Science & Engineering");
  const [academicYear, setAcademicYear] = useState(user?.academicYear || "3rd Year");
  const [batch, setBatch] = useState(user?.batch || "Batch 2023-2027");
  const [department, setDepartment] = useState("");
  const [subject, setSubject] = useState("");
  const [classification, setClassification] = useState(null);
  const [classifying, setClassifying] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [structuredSummary, setStructuredSummary] = useState(null);
  const [summaryWordCount, setSummaryWordCount] = useState(0);
  const [maxSummaryWords, setMaxSummaryWords] = useState(500);

  // Multi-Page Extraction & OCR Metrics
  const [totalPageCount, setTotalPageCount] = useState(0);
  const [processedPageCount, setProcessedPageCount] = useState(0);
  const [pagesOcrCount, setPagesOcrCount] = useState(0);
  const [pagesFailedList, setPagesFailedList] = useState([]);
  const [extractionStatus, setExtractionStatus] = useState(null); // "Completed" | "Partially processed" | "Failed"

  // Overall Processing Status: null | "Uploading" | "Extracting text" | "Running OCR" | "Generating summary" | "Completed" | "Partially processed" | "Failed"
  const [processingStatus, setProcessingStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [validationRejection, setValidationRejection] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const titleValidation = checkTitleValidity(title);

  const handleClearFile = () => {
    setFile(null);
    setDocumentId("");
    setTitle("");
    setDocCategory("Study Material");
    setDescription("");
    setIsDescriptionUserEdited(false);
    setGeneratingDescription(false);
    setClassification(null);
    setDepartment("");
    setSubject("");
    setClassifying(false);
    setAiSummary("");
    setStructuredSummary(null);
    setSummaryWordCount(0);
    setTotalPageCount(0);
    setProcessedPageCount(0);
    setPagesOcrCount(0);
    setPagesFailedList([]);
    setExtractionStatus(null);
    setProcessingStatus(null);
    setStatusMessage("");
    setWarningMessage("");
    setErrorMessage("");
    setValidationRejection(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /**
   * Called when a user selects or drops a document file.
   * Cleans unwanted prefix/noise words from title (e.g. Module5, PDF, etc.)
   * Validates format and page counts (<= 150).
   * Does NOT generate summary until explicitly requested.
   */
  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;

    // Clear stale state
    setErrorMessage("");
    setWarningMessage("");
    setValidationRejection(null);
    setAiSummary("");
    setStructuredSummary(null);
    setSummaryWordCount(0);

    const uniqueDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    setDocumentId(uniqueDocId);
    setFile(selectedFile);

    // Sanitize title properly (strips unwanted noise like "Module5", "Unit 2", "PDF", etc.)
    const cleanTitle = sanitizeDocumentTitle(selectedFile.name);
    setTitle(cleanTitle);

    setProcessingStatus("Ready");
    setStatusMessage(`Document selected (${(selectedFile.size / 1024).toFixed(1)} KB). Ready for upload.`);

    try {
      const preValidation = await inspectDocumentFile(selectedFile);
      if (preValidation.isExceeded) {
        setProcessingStatus("Failed");
        setErrorMessage(preValidation.error);
        showToast(preValidation.error, "error");
        return;
      }

      setTotalPageCount(preValidation.pageCount);
      setProcessedPageCount(preValidation.pageCount);

      // Auto-suggest category from clean title / filename
      const detectedCat = classifyAcademicContent("", cleanTitle || selectedFile.name);
      if (detectedCat) {
        setDepartment(detectedCat);
        setAcademicCategory(detectedCat);
      }

      // Background classifier for document category, branch, subject, and AI description
      setClassifying(true);
      setGeneratingDescription(true);
      try {
        const fd = new FormData();
        fd.append("file", selectedFile);
        fd.append("title", cleanTitle);
        const classRes = await classifierApi.predict(fd);
        const cData = classRes?.data;
        if (cData) {
          setClassification(cData);
          if (cData.category) {
            setDocCategory(cData.category);
          }
          if (cData.branch && cData.branch !== "Unable to classify") {
            setDepartment(cData.branch);
            setAcademicCategory(cData.branch);
          }
          if (cData.subject && cData.subject !== "Unable to classify") {
            setSubject(cData.subject);
          }
          if (cData.suggestedDescription && !isDescriptionUserEdited) {
            setDescription(cData.suggestedDescription);
          }
        }
      } catch (cErr) {
        console.debug("Background classification notice:", cErr.message);
      } finally {
        setClassifying(false);
        setGeneratingDescription(false);
      }
    } catch (err) {
      setProcessingStatus("Failed");
      setErrorMessage(err.message);
      showToast(err.message, "error");
    }
  };

  /**
   * Generates AI 1-2 line description from document content on demand
   */
  const handleGenerateAiDescription = async () => {
    if (!file) {
      showToast("Please upload a document first to generate description.", "warning");
      return;
    }
    setGeneratingDescription(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title || sanitizeDocumentTitle(file.name));
      fd.append("department", department || academicCategory);
      fd.append("subject", subject || "Academic Study Notes");
      const res = await materialsApi.generateAiDescription(fd);
      if (res.data?.description) {
        setDescription(res.data.description);
        setIsDescriptionUserEdited(false);
        showToast("AI description generated from document content!", "success");
      }
    } catch (err) {
      showToast("Could not auto-generate description. You can write your own.", "warning");
    } finally {
      setGeneratingDescription(false);
    }
  };

  /**
   * Generates AI summary IF AND ONLY IF the user clicks [Get Summary]
   */
  const handleGenerateSummary = async () => {
    if (!file) {
      showToast("Please upload a document first.", "warning");
      return;
    }

    setProcessingStatus("Generating summary");
    setStatusMessage(`Analyzing and generating academic summary for "${title}"...`);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title || sanitizeDocumentTitle(file.name));
      fd.append("academicCategory", department || academicCategory);
      fd.append("documentId", documentId);
      fd.append("maxWords", "500");

      const res = await materialsApi.generateAiSummary(fd);
      const data = res.data;

      const totalPages = data.totalPageCount || totalPageCount || 1;
      const processedPages = data.processedPageCount || totalPages;
      setTotalPageCount(totalPages);
      setProcessedPageCount(processedPages);
      setExtractionStatus("Completed");

      if (data.summary && data.summary.trim()) {
        const sumText = data.summary.trim();
        const wCount = data.wordCount || sumText.split(/\s+/).filter(Boolean).length;
        setAiSummary(sumText);
        setStructuredSummary(data.structuredSummary || null);
        setSummaryWordCount(wCount);
        setMaxSummaryWords(data.maxWords || 500);

        if (data.suggestedTitle) {
          const cleanSuggested = sanitizeDocumentTitle(data.suggestedTitle);
          if (cleanSuggested && cleanSuggested.length >= 4) {
            setTitle(cleanSuggested);
          }
        }

        setProcessingStatus("Completed");
        setStatusMessage(`AI summary generated successfully (${wCount} words).`);
        showToast("Complete document extracted! AI summary ready.", "success");
      } else {
        throw new Error("Backend could not generate a summary from the document.");
      }
    } catch (err) {
      setProcessingStatus("Ready");
      const errDetail = err.response?.data?.detail || err.message || "Failed to generate AI summary.";
      setErrorMessage(errDetail);
      showToast(errDetail, "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      showToast("Please upload a document to proceed.", "error");
      return;
    }

    if (totalPageCount > MAX_ALLOWED_PAGES) {
      showToast(`Upload failed: Documents must contain no more than ${MAX_ALLOWED_PAGES} pages.`, "error");
      return;
    }

    const titleValidation = checkTitleValidity(title);
    if (!titleValidation.isValid) {
      showToast(titleValidation.message, "error");
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", title.trim());
      const detectedDept = department || classification?.branch || user?.course || "Computer Science & Engineering";
      const detectedSubj = subject || classification?.subject || "Academic Study Notes";
      fd.append("course", detectedDept);
      fd.append("academicYear", user?.academicYear || "3rd Year");
      fd.append("batch", user?.batch || "Batch 2023-2027");
      fd.append("academicCategory", detectedDept);
      fd.append("academic_category", detectedDept);
      fd.append("mainCategory", detectedDept);
      fd.append("department", detectedDept);
      fd.append("subject", detectedSubj);
      if (classification?.topics?.[0]) {
        fd.append("topic", classification.topics[0]);
      }

      let finalDesc = (description || "").trim();
      if (!finalDesc && classification?.suggestedDescription) {
        finalDesc = classification.suggestedDescription;
      }
      const finalSummary = aiSummary.trim() || finalDesc;
      fd.append("description", finalDesc);
      fd.append("summary", finalSummary);
      fd.append("documentId", documentId);
      fd.append("totalPageCount", String(totalPageCount || 1));
      fd.append("processedPageCount", String(processedPageCount || 1));
      const targetCat = docCategory || classification?.category || "Study Material";
      fd.append("category", targetCat);
      fd.append("document_type", targetCat);

      await materialsApi.upload(fd);

      showToast("Document uploaded successfully! AI description generated and saved.", "success");
      handleClearFile();

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : err.message || "Failed to submit study material.";
      showToast(msg, "error");
      setErrorMessage(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStatusBadge = () => {
    switch (processingStatus) {
      case "Ready":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-800">
            <CheckCircle2 size={13} className="text-blue-600" />
            <span>Document Selected</span>
          </span>
        );
      case "Uploading":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-800 animate-pulse">
            <RefreshCw size={12} className="animate-spin text-blue-600" />
            <span>Uploading</span>
          </span>
        );
      case "Extracting text":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-200 px-3 py-1 text-xs font-bold text-indigo-800 animate-pulse">
            <FileSearch size={12} className="text-indigo-600" />
            <span>Extracting text</span>
          </span>
        );
      case "Running OCR":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 border border-purple-200 px-3 py-1 text-xs font-bold text-purple-800 animate-pulse">
            <Scan size={12} className="text-purple-600" />
            <span>Running OCR</span>
          </span>
        );
      case "Generating summary":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-800 animate-pulse">
            <Sparkles size={12} className="text-amber-600" />
            <span>Generating summary</span>
          </span>
        );
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-300 px-3 py-1 text-xs font-extrabold text-emerald-800">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Summary Ready</span>
          </span>
        );
      case "Partially processed":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-800">
            <AlertCircle size={13} className="text-amber-600" />
            <span>Partially processed</span>
          </span>
        );
      case "Failed":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 border border-red-300 px-3 py-1 text-xs font-bold text-red-800">
            <AlertCircle size={13} className="text-red-600" />
            <span>Failed</span>
          </span>
        );
      default:
        return null;
    }
  };

  const isSlideFormat = file?.name?.toLowerCase().includes(".ppt");
  const pageUnit = isSlideFormat ? "slides" : "pages";

  return (
    <div id="upload-material" className="card bg-white/95 rounded-2xl shadow-xl border border-white/50 p-6 sm:p-8 backdrop-blur">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#3e362e] text-white shadow-md">
            <UploadCloud size={22} />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-gray-900 flex items-center gap-2">
              <span>Upload Material</span>
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-[10px] font-extrabold text-brand-900 uppercase tracking-wider">
                Multi-Page AI
              </span>
            </h2>
            <p className="text-xs text-gray-500">
              Extracts and summarizes every page of your study document (up to 150 pages &bull; max 500 words).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {renderStatusBadge()}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-bold text-amber-900">
            <ShieldCheck size={14} className="text-amber-700" />
            <span>Strict Limit: Max 150 Pages</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {/* ========================================================
            1. DOCUMENT TITLE
        ======================================================== */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700">
              Document Title *
            </label>
            {title.trim() && !titleValidation.isValid && (
              <span className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                <AlertCircle size={12} /> Improper title detected
              </span>
            )}
          </div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Operating Systems: CPU Scheduling & Process Management"
            className={`input-field text-sm transition ${
              title.trim() && !titleValidation.isValid
                ? "!border-rose-400 focus:!border-rose-600 focus:!ring-rose-200 bg-rose-50/20"
                : ""
            }`}
            required
          />
          {title.trim() && !titleValidation.isValid ? (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold mt-1.5 animate-in fade-in">
              <AlertCircle size={14} className="text-rose-500 shrink-0" />
              <span>{titleValidation.message}</span>
            </div>
          ) : (
            <p className="text-[11px] text-gray-500 mt-1">
              Clear title representing the academic material or document.
            </p>
          )}
        </div>

        {/* ========================================================
            DOCUMENT CATEGORY / TYPE (AI AUTO-DETECTED)
        ======================================================== */}
        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <span>Document Category / Type *</span>
            </label>
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-800 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md">
              <Sparkles size={11} className="text-brand-600" />
              <span>{classifying ? "Detecting..." : "AI Auto-Detected"}</span>
            </span>
          </div>
          <select
            value={docCategory}
            onChange={(e) => setDocCategory(e.target.value)}
            className="input-field text-sm font-semibold text-gray-800 bg-white cursor-pointer"
          >
            {SUPPORTED_DOC_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            CampusVerse intelligently classifies your document type (Study Material, Resume / CV, Project Report, Research Paper, Presentation, Assignment) based on extracted content.
          </p>
        </div>

        {/* ========================================================
            SHORT DESCRIPTION (1-2 LINES) - AI AUTO-GENERATED
        ======================================================== */}
        <div>
          <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
              <span>Short Description (1–2 Lines)</span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                AI Auto-Generated
              </span>
            </label>
            <div className="flex items-center gap-2">
              {file && (
                <button
                  type="button"
                  onClick={handleGenerateAiDescription}
                  disabled={generatingDescription}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-800 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 border border-brand-200 px-2.5 py-0.5 rounded-md transition shadow-2xs"
                  title="Generate or retry 1-2 line description using AI based on document content"
                >
                  {generatingDescription ? (
                    <>
                      <RefreshCw size={11} className="animate-spin text-brand-600" />
                      <span>AI Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={11} className="text-brand-600" />
                      <span>{description ? "Regenerate with AI" : "Auto-Generate with AI"}</span>
                    </>
                  )}
                </button>
              )}
              {description && (
                <span className="text-[10px] text-gray-400 font-mono">
                  {description.trim().split(/\s+/).filter(Boolean).length} words
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <textarea
              rows={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setIsDescriptionUserEdited(true);
              }}
              placeholder={
                generatingDescription
                  ? "AI is analyzing document text and generating a 1-2 line description..."
                  : "Auto-generated by AI upon document upload. You may also edit or customize it freely."
              }
              className={`input-field text-sm leading-relaxed resize-none transition ${
                generatingDescription ? "opacity-75 bg-brand-50/20" : ""
              }`}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
            <p>
              Grounded strictly in the uploaded document's body content, purpose and concepts.
            </p>
            {isDescriptionUserEdited && (
              <span className="text-[10px] font-semibold text-brand-600">
                Custom user description preserved
              </span>
            )}
          </div>
        </div>

        {/* ========================================================
            2. AUTOMATIC MATERIAL SEGREGATION BASED ON CONTENT
        ======================================================== */}
        <div className="rounded-2xl border border-brand-200/80 bg-gradient-to-br from-brand-50/40 via-white to-brand-50/20 p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100 flex-wrap gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-brand-900 uppercase tracking-wider">
              <Sparkles size={14} className="text-brand-600" />
              <span>Automatic Material Segregation</span>
            </span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              {classifying ? "Analyzing content..." : classification?.confidence ? `${Math.round(classification.confidence * 100)}% Match` : "Auto-Segregated"}
            </span>
          </div>

          <p className="text-xs text-gray-600">
            Based on the uploaded document's contents and concepts, CampusVerse automatically segregates your material into the correct academic discipline and subject without manual tagging.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-white border border-gray-200 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Auto-Detected Branch / Discipline
              </span>
              <p className="text-xs font-bold text-gray-900">
                {department || classification?.branch || (classifying ? "Detecting discipline..." : "Computer Science & Engineering")}
              </p>
            </div>

            <div className="p-3 rounded-xl bg-white border border-gray-200 shadow-2xs">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                Auto-Detected Subject
              </span>
              <p className="text-xs font-bold text-brand-900">
                {subject || classification?.subject || (classifying ? "Detecting subject..." : "Academic Study Subject")}
              </p>
            </div>
          </div>

          {classification?.topics?.length > 0 && (
            <div className="pt-1">
              <span className="text-[11px] text-gray-500 font-semibold block mb-1">
                Auto-Identified Curriculum Topics:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {classification.topics.map((t, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded-md bg-brand-50 border border-brand-200 text-brand-900 text-[11px] font-medium"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            3. UPLOAD MATERIAL (CLICK TO UPLOAD OR DRAG AND DROP)
        ======================================================== */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
            Upload Material (PDF, DOCX, DOC, PPTX, PPT) *
          </label>

          <div
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFileSelect(dropped);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-7 text-center transition ${
              file
                ? "border-emerald-300 bg-emerald-50/40"
                : "border-gray-200 hover:border-brand-400 hover:bg-gray-50/70"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleFileSelect(picked);
              }}
            />

            {file ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl bg-white px-5 py-4 border border-purple-200/80 shadow-xs text-gray-800 w-full max-w-2xl">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="flex h-12 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 font-extrabold text-[11px] shadow-2xs border border-red-200">
                    PDF
                  </div>
                  <div className="text-left truncate">
                    <p className="text-sm font-bold text-gray-900 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Selected &bull; {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFile();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-xs font-semibold text-gray-700 shadow-2xs transition"
                  >
                    <Trash2 size={13} className="text-gray-500" />
                    <span>Remove</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateSummary();
                    }}
                    disabled={processingStatus === "Generating summary"}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-purple-700 to-indigo-800 hover:from-purple-800 hover:to-indigo-900 disabled:opacity-60 text-white text-xs font-bold shadow-xs transition"
                  >
                    {processingStatus === "Generating summary" ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : aiSummary ? (
                      <>
                        <Sparkles size={13} />
                        <span>Regenerate Summary</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} />
                        <span>Get Summary</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 shadow-2xs">
                  <UploadCloud size={28} />
                </div>
                <div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="btn-primary !px-4 !py-1.5 text-xs font-bold !bg-[#3e362e] hover:!bg-[#2a241e] shadow-xs inline-flex items-center gap-1.5 mb-1.5"
                  >
                    <UploadCloud size={14} /> Click to Upload
                  </button>
                  <p className="text-xs font-semibold text-gray-700">or drag and drop document here</p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Supports <strong className="text-gray-800">PDF, DOCX, DOC, PPTX, PPT</strong> &bull; Up to{" "}
                    <strong className="text-amber-800 font-bold">150 pages maximum</strong>
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Progress / Status Notice */}
          {statusMessage && (processingStatus === "Uploading" || processingStatus === "Extracting text" || processingStatus === "Running OCR" || processingStatus === "Generating summary") && (
            <div className="mt-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3.5 flex items-center gap-3 text-xs text-indigo-950 animate-fade-in">
              <RefreshCw size={16} className="animate-spin text-indigo-600 shrink-0" />
              <div>
                <p className="font-bold">{processingStatus}...</p>
                <p className="text-[11px] text-indigo-700 mt-0.5">{statusMessage}</p>
              </div>
            </div>
          )}

          {/* Warnings for partial extractions */}
          {warningMessage && (
            <div className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-xs text-amber-900 animate-fade-in">
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Extraction Notice</p>
                <p className="text-[11px] text-amber-800 mt-0.5">{warningMessage}</p>
              </div>
            </div>
          )}

          {/* Error / Validation Rejection Message */}
          {errorMessage && (
            <div className={`mt-2.5 rounded-2xl border p-4 flex items-start gap-3 text-xs animate-fade-in shadow-xs ${
              validationRejection ? "border-rose-300 bg-rose-50 text-rose-950" : "border-red-200 bg-red-50 text-red-900"
            }`}>
              <AlertCircle size={18} className={`shrink-0 mt-0.5 ${validationRejection ? "text-rose-600" : "text-red-600"}`} />
              <div className="flex-1 space-y-1.5">
                <p className="font-extrabold text-sm">
                  {validationRejection?.documentTypeLabel
                    ? `Upload Rejected: ${validationRejection.documentTypeLabel} Detected`
                    : validationRejection
                    ? "Upload Rejected: Academic Study Materials Only"
                    : "Extraction Error"}
                </p>
                <p className={`text-xs leading-relaxed ${validationRejection ? "text-rose-900" : "text-red-700"}`}>
                  {errorMessage}
                </p>
                {validationRejection?.reason && validationRejection.reason !== errorMessage && (
                  <p className="text-[11px] font-mono bg-rose-100/80 text-rose-800 px-2 py-1 rounded-md inline-block">
                    Verification Rule: {validationRejection.reason}
                  </p>
                )}
                <div>
                  <button
                    type="button"
                    onClick={handleClearFile}
                    className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold transition shadow-2xs"
                  >
                    <RefreshCw size={12} /> Upload Another Document
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AI Document Verification & Safety Matrix */}
          {file && (
            <div className="mt-3.5 rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-4 shadow-2xs space-y-2.5 animate-in fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                    AI Document Verification & Safety Status
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 size={12} /> Auto-Verified & Approved
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Auto-Segregated Subject</span>
                  <span className="font-semibold text-gray-900 truncate block">{subject || classification?.subject || "Academic Subject"}</span>
                </div>
                <div className="p-2 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Discipline Stream</span>
                  <span className="font-semibold text-gray-900 truncate block">{department || classification?.branch || "Engineering"}</span>
                </div>
                <div className="p-2 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Safety Guardrails</span>
                  <span className="font-bold text-emerald-700 block">Clean (Passed)</span>
                </div>
                <div className="p-2 rounded-xl bg-white/80 border border-emerald-100">
                  <span className="text-gray-500 block text-[10px] uppercase font-bold">Content Quality</span>
                  <span className="font-bold text-indigo-700 block">
                    {classification?.confidence ? `${Math.round(classification.confidence * 100)}% Match` : "High Confidence"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================
            4. AI-GENERATED SUMMARY
        ======================================================== */}
        <div className="w-full">
          {processingStatus === "Uploading" || processingStatus === "Extracting text" || processingStatus === "Running OCR" || processingStatus === "Generating summary" ? (
            <div className="p-8 rounded-3xl bg-white border border-purple-100 text-xs text-gray-600 flex flex-col items-center justify-center gap-3 shadow-xs">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600">
                <RefreshCw size={22} className="animate-spin" />
              </div>
              <span className="font-extrabold text-sm text-gray-800">{processingStatus}...</span>
              <span className="text-xs text-gray-500">{statusMessage}</span>
            </div>
          ) : aiSummary ? (
            <div className="space-y-3">
              <StructuredSummaryView
                summary={aiSummary}
                structuredData={structuredSummary}
                title={title || file?.name || "Module 1 - Introduction to Generative AI"}
                category={academicCategory}
                pageCount={processedPageCount || totalPageCount || 1}
                wordCount={summaryWordCount}
                maxWords={maxSummaryWords}
              />
              <p className="text-[11px] text-gray-500 flex items-center gap-1.5 px-3">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>
                  Grounded strictly in the extracted content of this document. Synthesized across all {processedPageCount} {pageUnit}.
                </span>
              </p>
            </div>
          ) : (
            <div className="p-8 rounded-3xl bg-white/70 border border-dashed border-purple-200 text-xs text-gray-500 text-center">
              {file ? (
                <div className="space-y-1">
                  <p className="font-semibold text-gray-800">Document selected and verified</p>
                  <p className="text-[11px] text-gray-500">
                    Summary generation is optional. Click <strong className="text-purple-700 font-bold">&quot;Get Summary&quot;</strong> above if you would like an AI-generated study summary before submitting.
                  </p>
                </div>
              ) : (
                "Upload a document above. You can optionally request an AI-generated structured summary by clicking 'Get Summary'."
              )}
            </div>
          )}
        </div>

        {/* ========================================================
            SUBMIT MATERIAL
        ======================================================== */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting || !file || !titleValidation.isValid}
            className="btn-primary w-full !py-3.5 text-sm font-bold shadow-md flex items-center justify-center gap-2 !bg-[#3e362e] hover:!bg-[#2a241e] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Submitting Material...</span>
              </>
            ) : (
              <>
                <Send size={16} />
                <span>Submit Material</span>
              </>
            )}
          </button>
          <p className="text-center text-[11px] text-gray-400 mt-2">
            Uploaded materials are verified and displayed directly on your dashboard.
          </p>
        </div>
      </form>
    </div>
  );
}
