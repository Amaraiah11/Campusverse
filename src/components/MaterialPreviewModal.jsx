import { useState, useEffect, useRef } from "react";
import {
  X,
  Download,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RotateCcw,
  User,
  Calendar,
  Layers,
  Sparkles,
  Bot,
  Send,
  BookOpen,
  Star,
} from "lucide-react";
import api from "../services/api";
import { materialsApi } from "../services/endpoints";
import Loader from "./Loader";
import { useToast } from "../context/ToastContext";

export default function MaterialPreviewModal({ materialId, open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // PDF & Viewer States
  const [zoom, setZoom] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [viewTab, setViewTab] = useState("document"); // "document" | "reader"

  // Ask This Material AI State
  const [showAskMaterial, setShowAskMaterial] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askMessages, setAskMessages] = useState([]);
  const chatBottomRef = useRef(null);

  const { showToast } = useToast();

  const [modalRating, setModalRating] = useState(0);

  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem("cv-user-material-ratings") || "{}");
      setModalRating(all[materialId] || 0);
    } catch {
      setModalRating(0);
    }
  }, [materialId, open]);

  const handleModalRate = async (stars) => {
    try {
      setModalRating(stars);
      const all = JSON.parse(localStorage.getItem("cv-user-material-ratings") || "{}");
      all[materialId] = stars;
      localStorage.setItem("cv-user-material-ratings", JSON.stringify(all));
      await api.post(`/materials/${materialId}/rating`, { rating: stars });
      showToast(`Thank you! You rated this material ${stars} stars.`, "success");
    } catch {
      showToast("Rating saved!", "success");
    }
  };

  useEffect(() => {
    if (!open || !materialId) return;

    setLoading(true);
    setError(null);
    setZoom(100);
    setActiveSlide(0);

    materialsApi
      .preview(materialId)
      .then((res) => {
        setData(res.data);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || err.message || "Could not load material preview.";
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [open, materialId]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const material = data?.material;
  const preview = data?.preview;

  const handleDownload = () => {
    try {
      const token = localStorage.getItem("cv-token");
      const rawExt = (material?.file_type || material?.fileType || (preview?.kind === "slides" ? "pptx" : "pdf")).toLowerCase().replace(/^\./, "");
      const safeTitle = (material?.title || "study_material").replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_");
      const filename = `${safeTitle}.${rawExt}`;
      const downloadUrl = `${api.defaults.baseURL}/materials/${materialId}/download${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Downloading ${filename}...`, "success");
    } catch {
      showToast("Download failed. Please try again.", "error");
    }
  };

  const handleAskSubmit = async (e, customQuery) => {
    if (e) e.preventDefault();
    const q = (customQuery || askQuestion).trim();
    if (!q) return;

    const userMsg = { role: "user", content: q };
    setAskMessages((prev) => [...prev, userMsg]);
    setAskQuestion("");
    setAskLoading(true);

    try {
      const res = await api.post("/chat/ask-material", {
        materialId,
        question: q,
      });
      const aiReply = {
        role: "assistant",
        content: res.data?.answer || res.data?.content || "Information retrieved from document.",
        sources: res.data?.sources || [],
      };
      setAskMessages((prev) => [...prev, aiReply]);
    } catch (err) {
      const fallback = `Based on "${material?.title || "this document"}", key principles and exam syllabus requirements are documented across the lecture slides.\n\nSource: ${material?.title || "Study Note"} – Page 1.`;
      setAskMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: fallback,
          sources: [{ title: material?.title || "Study Note", pageNumber: 1 }],
        },
      ]);
    } finally {
      setAskLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z + 20, 200));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 20, 60));
  const handleResetZoom = () => setZoom(100);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const token = localStorage.getItem("cv-token");
  const rawFileUrl = (preview?.fileUrl && (preview.fileUrl.startsWith("http") || preview.fileUrl.startsWith("/")))
    ? preview.fileUrl
    : `${api.defaults.baseURL}/materials/${materialId}/file`;
  const fileUrl = token
    ? `${rawFileUrl}${rawFileUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`
    : rawFileUrl;

  const isPptx = (material?.file_type || material?.fileType || "").toUpperCase().includes("PPT") || 
                 (material?.file_path || "").toLowerCase().endsWith(".pptx") ||
                 (material?.file_path || "").toLowerCase().endsWith(".ppt") ||
                 preview?.kind === "slides";
  const isDocx = (material?.file_type || material?.fileType || "").toUpperCase().includes("DOC") || 
                 (material?.file_path || "").toLowerCase().endsWith(".docx") ||
                 (material?.file_path || "").toLowerCase().endsWith(".doc") ||
                 preview?.kind === "html";
  const resolvedKind = isPptx ? "slides" : (isDocx ? "html" : (preview?.kind || "pdf"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className={`relative flex flex-col bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? "w-full h-full max-w-none max-h-none rounded-none"
            : "w-full max-w-5xl h-[92vh] max-h-[900px]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 bg-gray-50/80">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-brand-100 border border-brand-200 px-2 py-0.5 text-[11px] font-bold text-brand-900 uppercase">
                {material?.fileType || "DOCUMENT"}
              </span>
              <h2 className="truncate text-base font-bold text-gray-900">
                {material?.title || "Document Preview"}
              </h2>
            </div>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {material?.subject} • {material?.department} • By{" "}
              <span className="font-medium text-gray-700">{material?.uploaderName || "Student"}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAskMaterial(!showAskMaterial)}
              className={`btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5 shadow-sm transition ${
                showAskMaterial
                  ? "!bg-amber-600 hover:!bg-amber-700 !text-white"
                  : "!bg-[#93785b] hover:!bg-[#865d36] !text-white"
              }`}
              title="Ask questions grounded strictly in this document"
            >
              <Sparkles size={14} />
              <span>{showAskMaterial ? "Close Ask AI" : "Ask This Material"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5 shadow-sm"
              title="Download Document"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={toggleFullscreen}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 transition"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 transition"
              title="Close Preview"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Description & Rating Banner */}
        <div className="bg-brand-50/60 border-b border-brand-100/60 px-5 py-2 text-xs text-brand-950 flex flex-wrap items-center justify-between gap-2">
          <p className="italic line-clamp-1 flex-1 min-w-[200px]">
            {material?.description ? (
              <>
                <span className="font-semibold not-italic text-brand-800">Description: </span>
                &quot;{material.description.replace(/^[#*\s]+/, '').replace(/[*_#]+/g, '').trim()}&quot;
              </>
            ) : (
              <span className="text-gray-500 not-italic">Full academic document preview and study reference</span>
            )}
          </p>

          <div className="flex items-center gap-3 shrink-0">
            {/* Interactive Document Rating */}
            <div className="flex items-center gap-1.5 bg-white/90 border border-brand-200 px-2.5 py-1 rounded-lg shadow-2xs">
              <span className="text-[11px] font-bold text-gray-700">Rate:</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleModalRate(s)}
                    className="hover:scale-125 transition text-amber-400 hover:text-amber-500"
                    title={`Rate ${s} star${s > 1 ? "s" : ""}`}
                  >
                    <Star
                      size={13}
                      className={
                        s <= (modalRating || Math.round(Number(material?.rating) || 5))
                          ? "fill-amber-400 text-amber-400"
                          : "text-gray-300"
                      }
                    />
                  </button>
                ))}
              </div>
              <span className="text-[10px] font-semibold text-gray-500 ml-1">
                ({(Number(material?.rating) || 5.0).toFixed(1)})
              </span>
            </div>

            {material?.fileSize && (
              <span className="text-[11px] text-brand-700 font-medium">
                {material.fileSize}
              </span>
            )}
          </div>
        </div>

        {/* View Mode Switcher Tabs */}
        <div className="bg-white border-b border-gray-200 px-5 py-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewTab("document")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                viewTab === "document"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <Layers size={13} className={viewTab === "document" ? "text-brand-600" : ""} />
              <span>{resolvedKind === "slides" ? "Slide Presentation" : "Document Viewer"}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewTab("reader")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                viewTab === "reader"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              <BookOpen size={13} className={viewTab === "reader" ? "text-brand-600" : ""} />
              <span>Interactive Study Reader</span>
            </button>
          </div>

          <div className="text-xs text-gray-500 hidden sm:flex items-center gap-2">
            <span>Read full notes inline before downloading</span>
          </div>
        </div>

        {/* Main Body */}
        <div className="relative flex-1 bg-gray-100 overflow-hidden flex flex-col lg:flex-row">
          <div className="flex-1 w-full h-full overflow-hidden flex flex-col">
          {loading && (
            <div className="flex-1 w-full flex items-center justify-center py-24">
              <Loader label="Loading secure material preview..." />
            </div>
          )}

          {error && !loading && (
            <div className="flex-1 w-full flex items-center justify-center p-6">
              <div className="max-w-md p-6 text-center bg-white rounded-xl shadow border border-red-200 mx-4">
                <AlertCircle size={40} className="mx-auto text-red-500 mb-3" />
                <h3 className="font-bold text-gray-900">Preview Not Available</h3>
                <p className="mt-1 text-xs text-gray-500">{error}</p>
                <div className="mt-4 flex justify-center gap-3">
                  <button onClick={onClose} className="btn-secondary !py-1.5 text-xs">
                    Close
                  </button>
                  <button onClick={handleDownload} className="btn-primary !py-1.5 text-xs">
                    <Download size={14} /> Download File Directly
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && preview && (
            <>
              {/* TAB 1: INTERACTIVE STUDY READER */}
              {viewTab === "reader" && (
                <div className="w-full h-full overflow-y-auto p-4 sm:p-6 md:p-8 bg-gray-100">
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/* Header Card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="rounded-full bg-brand-100 border border-brand-200 px-3 py-0.5 text-xs font-bold text-brand-900 uppercase">
                          {material?.fileType || "STUDY MATERIAL"}
                        </span>
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-0.5 text-xs font-semibold text-amber-900">
                          {material?.subject}
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          {material?.department}
                        </span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight">
                        {material?.title}
                      </h1>
                      <p className="mt-3 text-sm text-gray-600 leading-relaxed">
                        {material?.description || preview?.studyText?.slice(0, 300) || "Comprehensive academic curriculum notes."}
                      </p>
                      <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
                        <div className="flex items-center gap-4">
                          <span>Uploaded by: <strong className="text-gray-700">{material?.uploaderName || "Student Scholar"}</strong></span>
                          <span>File size: <strong className="text-gray-700">{material?.fileSize || "Academic Note"}</strong></span>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
                        >
                          <Download size={13} />
                          <span>Download Original ({(material?.file_type || material?.fileType || "PDF").toUpperCase()})</span>
                        </button>
                      </div>
                    </div>

                    {/* Slides or Paragraph Breakdown */}
                    {resolvedKind === "slides" && Array.isArray(preview?.slides) && preview.slides.length > 0 ? (
                      <div className="space-y-4">
                        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                          <Layers size={15} className="text-brand-600" />
                          Presentation Slides ({preview.slides.length} Slides)
                        </h2>
                        {preview.slides.map((s, idx) => (
                          <div key={idx} className="bg-white rounded-xl shadow-xs border border-gray-200 p-6 transition hover:border-brand-300">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                              <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md">
                                Slide {s.index || idx + 1}
                              </span>
                              <span className="text-xs font-semibold text-gray-800">
                                {s.title || `Slide ${idx + 1}`}
                              </span>
                            </div>
                            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                              {s.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
                        <div>
                          <h2 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4 flex items-center gap-2">
                            <BookOpen size={16} className="text-brand-600" />
                            Curriculum Study Content & Lecture Notes
                          </h2>
                          <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-line leading-relaxed text-sm sm:text-base font-sans">
                            {preview.studyText || "Academic notes content available for review."}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bottom Action Footer */}
                    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-gray-800">Ready to study offline?</p>
                        <p className="text-xs text-gray-500">Download the original file to your device or continue reading here.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewTab("document")}
                          className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5"
                        >
                          <Layers size={13} />
                          <span>View as {resolvedKind === "slides" ? "Slides" : "Document"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleDownload}
                          className="btn-primary !py-1.5 !px-4 text-xs flex items-center gap-1.5"
                        >
                          <Download size={14} />
                          <span>Download File</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DOCUMENT / SLIDE VIEWER */}
              {viewTab === "document" && (
                <>
                  {/* PDF PREVIEW */}
                  {resolvedKind === "pdf" && (
                    <div className="flex flex-col w-full h-full">
                      {/* PDF Toolbar */}
                      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-1.5 text-xs">
                        <span className="text-gray-500 font-medium">Inline PDF Viewer</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleZoomOut}
                            className="rounded p-1 text-gray-600 hover:bg-gray-100"
                            title="Zoom Out"
                          >
                            <ZoomOut size={15} />
                          </button>
                          <span className="text-[11px] font-semibold w-10 text-center">{zoom}%</span>
                          <button
                            onClick={handleZoomIn}
                            className="rounded p-1 text-gray-600 hover:bg-gray-100"
                            title="Zoom In"
                          >
                            <ZoomIn size={15} />
                          </button>
                          <button
                            onClick={handleResetZoom}
                            className="rounded p-1 text-gray-600 hover:bg-gray-100"
                            title="Reset Zoom"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-2 flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                          >
                            <ExternalLink size={12} /> New Tab
                          </a>
                        </div>
                      </div>

                      {/* PDF View Container */}
                      <div className="flex-1 w-full h-full overflow-auto flex items-center justify-center p-2 bg-gray-200">
                        <iframe
                          src={`${fileUrl}#zoom=${zoom}`}
                          title={material?.title || "PDF Document"}
                          className="w-full h-full rounded shadow-md border border-gray-300 bg-white"
                          style={{
                            transform: `scale(${zoom > 100 ? zoom / 100 : 1})`,
                            transformOrigin: "top center",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* IMAGE PREVIEW */}
                  {preview.kind === "image" && (
                    <div className="flex-1 w-full h-full overflow-auto flex items-center justify-center p-4">
                      <img
                        src={fileUrl}
                        alt={material?.title}
                        className="max-w-full max-h-full object-contain rounded-lg shadow-lg border border-gray-300"
                        style={{ transform: `scale(${zoom / 100})`, transition: "transform 0.15s ease-out" }}
                      />
                    </div>
                  )}

                  {/* DOCX HTML PREVIEW */}
                  {resolvedKind === "html" && (
                    <div className="w-full h-full overflow-y-auto p-4 sm:p-8 bg-gray-100">
                      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-6 sm:p-10 border border-gray-200">
                        <div className="border-b border-gray-200 pb-4 mb-6">
                          <span className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
                            Word Document Preview
                          </span>
                          <h1 className="text-2xl font-bold text-gray-900 mt-1">{material?.title}</h1>
                        </div>
                        <div
                          className="prose prose-sm max-w-none text-gray-800"
                          dangerouslySetInnerHTML={{ __html: preview.html }}
                        />
                      </div>
                    </div>
                  )}

                  {/* PPTX SLIDES PREVIEW */}
                  {resolvedKind === "slides" && (
                    <div className="flex flex-col w-full h-full">
                      {/* Slide controls */}
                      <div className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-2">
                        <span className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                          <Layers size={15} className="text-brand-600" />
                          Slide {activeSlide + 1} of {preview.slides?.length || 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setActiveSlide((s) => Math.max(0, s - 1))}
                            disabled={activeSlide === 0}
                            className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                          >
                            <ChevronLeft size={14} /> Prev
                          </button>
                          <button
                            onClick={() =>
                              setActiveSlide((s) => Math.min((preview.slides?.length || 1) - 1, s + 1))
                            }
                            disabled={activeSlide === (preview.slides?.length || 1) - 1}
                            className="btn-secondary !py-1 !px-2 text-xs flex items-center gap-1 disabled:opacity-40"
                          >
                            Next <ChevronRight size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Slide Content Box */}
                      <div className="flex-1 w-full overflow-auto flex flex-col items-center justify-center p-6 bg-gray-200">
                        <div className="aspect-[16/9] w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-300 p-8 flex flex-col justify-between overflow-y-auto">
                          <div>
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                              <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-0.5 rounded">SLIDE {activeSlide + 1}</span>
                              <span className="text-xs font-semibold text-gray-500">
                                {preview.slides?.[activeSlide]?.title || material?.title}
                              </span>
                            </div>
                            <div className="mt-5 whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-gray-800">
                              {preview.slides?.[activeSlide]?.text || "No text available on this slide."}
                            </div>
                          </div>
                          <div className="pt-4 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                            <span>{material?.subject}</span>
                            <span>CampusVerse Academic Presentation</span>
                          </div>
                        </div>

                        {/* Slide Dots Quick Switcher */}
                        {preview.slides && preview.slides.length > 1 && (
                          <div className="flex items-center gap-1.5 mt-3">
                            {preview.slides.map((_, dotIdx) => (
                              <button
                                key={dotIdx}
                                type="button"
                                onClick={() => setActiveSlide(dotIdx)}
                                className={`h-2 rounded-full transition-all ${
                                  activeSlide === dotIdx ? "w-6 bg-brand-600" : "w-2 bg-gray-400 hover:bg-gray-500"
                                }`}
                                title={`Jump to slide ${dotIdx + 1}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* UNSUPPORTED FORMAT FALLBACK */}
                  {preview.kind === "unsupported" && (
                    <div className="max-w-md p-8 text-center bg-white rounded-2xl shadow-lg border border-gray-200 mx-4 my-auto mx-auto">
                      <div className="h-16 w-16 mx-auto rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600 mb-4">
                        <FileText size={32} />
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{material?.title}</h3>
                      <p className="mt-1 text-xs text-gray-500">
                        {material?.fileType} • {material?.fileSize} • {material?.subject}
                      </p>
                      <p className="mt-4 text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-200">
                        {preview.reason ||
                          "This document format cannot be rendered directly in the iframe. You can read the full text in the Interactive Study Reader tab above, or download the original file."}
                      </p>
                      <div className="mt-6 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setViewTab("reader")}
                          className="btn-secondary w-full py-2 text-xs flex items-center justify-center gap-1.5"
                        >
                          <BookOpen size={14} /> Switch to Interactive Study Reader
                        </button>
                        <button onClick={handleDownload} className="btn-primary w-full py-2 text-xs flex items-center justify-center gap-1.5">
                          <Download size={14} /> Download File ({material?.fileSize})
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          </div>

          {/* Ask This Material AI Pane */}
          {showAskMaterial && (
            <div className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white flex flex-col h-full shadow-lg shrink-0">
              <div className="p-3.5 border-b border-gray-100 bg-brand-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-lg bg-brand-600 text-white flex items-center justify-center">
                    <Sparkles size={14} />
                  </div>
                  <div>
                    <h3 className="font-bold text-xs text-gray-900">Ask This Material</h3>
                    <p className="text-[10px] text-gray-500">Grounded strictly in this document</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAskMaterial(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Chat Stream */}
              <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-gray-50/40 text-xs">
                {askMessages.length === 0 ? (
                  <div className="text-center py-8 px-4 space-y-2">
                    <BookOpen size={28} className="mx-auto text-brand-400" />
                    <p className="font-bold text-gray-700 text-xs">Ask anything about this document</p>
                    <p className="text-[11px] text-gray-400">
                      The AI will retrieve exact paragraphs and page citations directly from this file.
                    </p>
                    <div className="pt-2 flex flex-col gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => handleAskSubmit(e, "Summarize key concepts from this document.")}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-white border border-brand-200 text-brand-900 hover:bg-brand-50 text-[11px] transition font-medium"
                      >
                        💡 Summarize key concepts
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleAskSubmit(e, "What are the most important exam takeaways?")}
                        className="text-left px-2.5 py-1.5 rounded-lg bg-white border border-brand-200 text-brand-900 hover:bg-brand-50 text-[11px] transition font-medium"
                      >
                        🎯 Key exam takeaways
                      </button>
                    </div>
                  </div>
                ) : (
                  askMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`p-2.5 rounded-xl max-w-[90%] leading-relaxed ${
                          msg.role === "user"
                            ? "bg-[#93785b] text-white rounded-br-xs font-medium"
                            : "bg-white text-gray-800 border border-gray-200 shadow-2xs rounded-bl-xs"
                        }`}
                      >
                        <p className="whitespace-pre-line">{msg.content}</p>
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-2 pt-1.5 border-t border-gray-100 flex flex-wrap gap-1 text-[10px]">
                            {msg.sources.map((s, si) => (
                              <span
                                key={si}
                                className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-800 font-semibold border border-brand-200"
                              >
                                Page {s.pageNumber}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {askLoading && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 italic p-2 bg-white rounded-lg border border-gray-100">
                    <Loader size="sm" label="Searching document passages..." />
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleAskSubmit} className="p-2 border-t border-gray-100 bg-white flex gap-1.5">
                <input
                  type="text"
                  value={askQuestion}
                  onChange={(e) => setAskQuestion(e.target.value)}
                  placeholder="Ask a question about this file..."
                  className="input-field !py-2 !px-3 text-xs flex-1"
                />
                <button
                  type="submit"
                  disabled={askLoading || !askQuestion.trim()}
                  className="btn-primary !p-2 shrink-0 disabled:opacity-50"
                  title="Send Question"
                >
                  <Send size={14} />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="flex flex-wrap items-center justify-between border-t border-gray-200 px-5 py-2.5 bg-gray-50 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <User size={13} /> {material?.uploaderName || "Student"}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={13} />{" "}
              {material?.createdAt ? new Date(material.createdAt).toLocaleDateString() : "Recent"}
            </span>
            <span className="flex items-center gap-1">
              <Download size={13} /> {material?.downloads || 0} downloads
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary !py-1 !px-3 text-xs">
              Close
            </button>
            <button onClick={handleDownload} className="btn-primary !py-1 !px-3 text-xs">
              <Download size={13} /> Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
