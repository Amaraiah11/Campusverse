import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search,
  Sparkles,
  BookOpen,
  FileText,
  ArrowRight,
  ExternalLink,
  Layers,
  HelpCircle,
  Filter,
  Eye,
  Star,
  Download,
  User,
  GraduationCap,
  X,
  RefreshCw,
} from "lucide-react";
import { searchApi } from "../services/endpoints";
import Loader from "../components/Loader";
import MaterialPreviewModal from "../components/MaterialPreviewModal";
import { useToast } from "../context/ToastContext";

const SAMPLE_QUERIES = [
  "Where is CPU scheduling explained?",
  "Clinical guidelines for adult hypertension",
  "Explain database normalization and SQL",
  "Business analytics regression modeling",
  "Dijkstra deadlock Banker's algorithm",
  "Machine learning neural network lab manual",
];

const DEPARTMENTS = [
  "All Departments",
  "Computer Science & Engineering",
  "Medical Sciences",
  "Management & Business Studies",
  "Civil Engineering",
  "Mechanical Engineering",
  "Electrical Engineering",
];

export default function SemanticSearch() {
  const [searchParams] = useSearchParams();
  const initialQ = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQ);
  const [selectedDept, setSelectedDept] = useState("All Departments");
  const [results, setResults] = useState([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewId, setPreviewId] = useState(null);
  const { showToast } = useToast();

  const debounceTimerRef = useRef(null);

  const executeSearch = useCallback(
    async (searchQuery, dept) => {
      const q = (searchQuery !== undefined ? searchQuery : query).trim();
      const currentDept = dept !== undefined ? dept : selectedDept;

      setLoading(true);
      setSearched(true);

      try {
        const filters = {};
        if (currentDept && currentDept !== "All Departments") {
          filters.department = currentDept;
        }

        const res = await searchApi.semantic(q, 25, filters);
        const searchResults = res.data?.results || [];
        setResults(searchResults);
      } catch (err) {
        showToast("Search request could not be completed.", "error");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [query, selectedDept, showToast]
  );

  // Initial load: show results for url query or recent materials
  useEffect(() => {
    executeSearch(initialQ, "All Departments");
  }, [initialQ]);

  // Debounced search on input change
  const handleQueryChange = (val) => {
    setQuery(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      executeSearch(val, selectedDept);
    }, 350);
  };

  const handleDeptChange = (dept) => {
    setSelectedDept(dept);
    executeSearch(query, dept);
  };

  const handleSampleClick = (sample) => {
    setQuery(sample);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    executeSearch(sample, selectedDept);
  };

  const handleClearSearch = () => {
    setQuery("");
    executeSearch("", selectedDept);
  };

  const handleResetFilters = () => {
    setQuery("");
    setSelectedDept("All Departments");
    executeSearch("", "All Departments");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto space-y-3 mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-100/90 text-brand-900 text-xs font-bold border border-brand-200">
          <Sparkles size={14} className="text-brand-600" />
          <span>Search Here</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white font-display drop-shadow-xs">
          Search Academic Notes
        </h1>
        <p className="text-sm text-white/90">
          Ask questions naturally or search by title, description, subject, keywords, and document content across all uploaded materials.
        </p>
      </div>

      {/* Single Unified Search Input & Filter Box */}
      <div className="card p-5 bg-white/95 rounded-2xl shadow-lg border border-white/40 mb-6 space-y-4">
        {/* Search Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            executeSearch(query, selectedDept);
          }}
          className="flex items-center gap-2"
        >
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search Here"
              aria-label="Search Here"
              className="input-field !pl-10 !pr-10 !py-3 w-full text-sm font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                title="Clear query"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary !py-3 !px-6 flex items-center gap-2 shrink-0 !bg-[#3e362e] hover:!bg-[#2a241e]"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>Search Here</span>
          </button>
        </form>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-bold text-gray-700 flex items-center gap-1">
              <Filter size={13} className="text-brand-600" /> Filter Department:
            </span>

            {/* Department Dropdown */}
            <select
              value={selectedDept}
              onChange={(e) => handleDeptChange(e.target.value)}
              aria-label="Filter by academic department"
              className="px-2.5 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-medium text-gray-800 hover:bg-white focus:outline-none focus:ring-1 focus:ring-brand-400 transition"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            {(selectedDept !== "All Departments" || query) && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs text-brand-700 hover:text-brand-900 font-bold underline px-1"
              >
                Reset Filters
              </button>
            )}
          </div>

          <div className="text-xs text-gray-500 font-medium">
            {loading ? "Searching documents..." : `Found ${results.length} matching materials`}
          </div>
        </div>

        {/* Sample Queries */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Sample Searches:</span>
          {SAMPLE_QUERIES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => handleSampleClick(sample)}
              className="px-2.5 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-900 text-[11px] font-medium border border-brand-200 transition"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="card p-12 text-center bg-white/95 rounded-2xl shadow-md border border-white/40 space-y-3">
          <Loader size="md" />
          <p className="text-sm font-semibold text-brand-900">
            Searching MongoDB materials and extracted content...
          </p>
        </div>
      )}

      {/* Results or Empty State */}
      {!loading && searched && results.length === 0 ? (
        <div className="card p-12 text-center bg-white/95 rounded-2xl shadow-md border border-white/40 space-y-3">
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto">
            <BookOpen size={24} />
          </div>
          <h3 className="font-bold text-gray-800 text-base">No Matching Notes Found</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            {query ? `We couldn't find materials matching "${query}".` : "No study materials match your selected filters."} Try searching for core keywords or clearing your department filter.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleResetFilters}
              className="btn-secondary !text-xs !py-1.5 !px-3 font-semibold"
            >
              Reset Filters
            </button>
          </div>
        </div>
      ) : (
        !loading &&
        results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-white/90 px-1 font-semibold">
              <span>Search Results ({results.length} notes found)</span>
              <span>Sorted by Semantic Relevance</span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {results.map((res, idx) => (
                <div
                  key={`${res.materialId || res.id}-${idx}`}
                  className="card p-5 bg-white/95 rounded-2xl shadow-md border border-white/40 space-y-3 hover:shadow-xl transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* Document Title & Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/materials/${res.materialId || res.id}`}
                          className="text-base font-bold text-gray-900 hover:text-brand-700 flex items-center gap-1.5 transition leading-snug"
                        >
                          <FileText size={17} className="text-brand-600 shrink-0" />
                          <span>{res.title}</span>
                        </Link>
                        {(res.category || res.document_type) && (
                          <span className="rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-bold text-indigo-900">
                            {res.category || res.document_type}
                          </span>
                        )}
                        <span className="rounded bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-semibold text-brand-900">
                          {res.subject}
                        </span>
                        <span className="rounded bg-gray-100 border border-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-700 uppercase">
                          {res.fileType || "PDF"}
                        </span>
                      </div>

                      {/* Short Description */}
                      {res.description && (
                        <p className="text-xs text-gray-700 leading-relaxed font-normal pt-0.5">
                          <strong className="text-brand-900 font-semibold">AI Description: </strong>
                          {res.description}
                        </p>
                      )}

                      {/* Meta Information */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 pt-1">
                        <span className="font-semibold text-gray-700 flex items-center gap-1">
                          <GraduationCap size={13} className="text-brand-600" />
                          {res.department}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 text-gray-600">
                          <User size={12} />
                          {res.uploaderName || "Student Contributor"}
                        </span>
                        <span>&bull;</span>
                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                          <Star size={12} className="fill-amber-400 text-amber-500" />
                          {typeof res.rating === "number" ? res.rating.toFixed(1) : res.rating || "5.0"}
                        </span>
                        <span>&bull;</span>
                        <span className="font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px]">
                          Page {res.pageNumber || 1}
                        </span>
                        <span>&bull;</span>
                        <span className="font-medium text-brand-800">
                          Relevance Match: {Math.round((res.score || 0.85) * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Actions: Preview & Details */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewId(res.materialId || res.id)}
                        className="px-3 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-900 text-xs font-bold flex items-center gap-1.5 border border-brand-200 transition shadow-2xs"
                        title="Read document preview inline"
                      >
                        <Eye size={13} />
                        <span>Preview</span>
                      </button>

                      <Link
                        to={`/materials/${res.materialId || res.id}`}
                        className="px-3 py-1.5 rounded-lg bg-[#3e362e] hover:bg-[#2a241e] text-white text-xs font-bold flex items-center gap-1 transition shadow-2xs"
                      >
                        <span>Open Details</span>
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>

                  {/* Context Snippet */}
                  {res.snippet && (
                    <div className="text-xs leading-relaxed text-gray-800 bg-brand-50/50 p-3 rounded-xl border border-brand-200/60 font-sans space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-brand-900 border-b border-brand-100 pb-1">
                        <span>Matched Passage ({res.title} &bull; Page {res.pageNumber || 1})</span>
                        <span className="text-emerald-700 font-semibold">Semantic Match</span>
                      </div>
                      <p className="italic pt-1 font-mono text-[11px] text-gray-700">
                        &quot;{res.snippet}&quot;
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {/* Preview Modal */}
      {previewId && (
        <MaterialPreviewModal
          materialId={previewId}
          open={Boolean(previewId)}
          onClose={() => setPreviewId(null)}
        />
      )}
    </div>
  );
}
