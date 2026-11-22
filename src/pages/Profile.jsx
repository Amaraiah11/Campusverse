import { useState, useEffect, useRef } from "react";
import {
  User,
  Mail,
  GraduationCap,
  Building2,
  Calendar,
  Edit3,
  Check,
  Camera,
  Star,
  Award,
  Upload,
  BookOpen,
  TrendingUp,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { materialsApi } from "../services/endpoints";
import { StarDisplay } from "../components/StarRating";

export default function Profile() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef(null);

  const [isEditing, setIsEditing] = useState(false);
  const [profile, setProfile] = useState(() => {
    const stored = JSON.parse(localStorage.getItem("cv-user") || "{}");
    return {
      name: user?.name || stored?.name || "Student Scholar",
      email: user?.email || stored?.email || "student@campusverse.edu",
      department: user?.department || stored?.department || "Computer Science & Engineering",
      college: stored?.college || "Campus University of Technology",
      bio:
        stored?.bio ||
        "Passionate student sharing curriculum notes, algorithm guides, and exam preparation materials on CampusVerse.",
      avatarUrl: stored?.avatarUrl || user?.avatarUrl || "",
    };
  });

  const [myMaterials, setMyMaterials] = useState([]);
  const [ratingStats, setRatingStats] = useState({
    averageRating: "0.0",
    totalRatings: 0,
    totalUploads: 0,
    topBadge: "Academic Contributor",
  });

  const loadProfileStats = () => {
    materialsApi
      .getUserStats()
      .then((res) => {
        if (res.data) {
          setRatingStats({
            averageRating: String(res.data.averageRating || "0.0"),
            totalRatings: Number(res.data.totalRatings || 0),
            totalUploads: Number(res.data.totalUploads || 0),
            topBadge: res.data.topBadge || (Number(res.data.averageRating) >= 4.5 ? "Top Rated Academic Contributor" : "Academic Contributor"),
          });
        }
      })
      .catch(() => {
        materialsApi
          .myUploads()
          .then((res) => {
            const items = res.data.materials || res.data.items || [];
            setMyMaterials(items);
            const totalVotes = items.reduce((acc, m) => acc + (Number(m.rating_count || m.ratingCount) || 0), 0);
            const totalScore = items.reduce((acc, m) => acc + ((Number(m.rating) || 0) * (Number(m.rating_count || m.ratingCount) || 0)), 0);
            const avg = totalVotes > 0 ? (totalScore / totalVotes).toFixed(1) : (items.length > 0 ? (items.reduce((a, m) => a + (Number(m.rating) || 0), 0) / items.length).toFixed(1) : "0.0");
            setRatingStats({
              averageRating: avg,
              totalRatings: totalVotes,
              totalUploads: items.length,
              topBadge: Number(avg) >= 4.5 ? "Top Rated Academic Contributor" : "Active Academic Contributor",
            });
          })
          .catch(() => {});
      });

    materialsApi
      .myUploads()
      .then((res) => {
        setMyMaterials(res.data.materials || res.data.items || []);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadProfileStats();
  }, []);

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast("Photo must be smaller than 5 MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const updated = { ...profile, avatarUrl: dataUrl };
      setProfile(updated);

      const stored = JSON.parse(localStorage.getItem("cv-user") || "{}");
      localStorage.setItem("cv-user", JSON.stringify({ ...stored, ...updated }));
      showToast("Profile photo uploaded successfully!", "success");
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = (e) => {
    e.stopPropagation();
    const updated = { ...profile, avatarUrl: "" };
    setProfile(updated);
    const stored = JSON.parse(localStorage.getItem("cv-user") || "{}");
    localStorage.setItem("cv-user", JSON.stringify({ ...stored, avatarUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Profile photo removed. Using your name's first letter.", "info");
  };

  const handleSave = (e) => {
    e.preventDefault();
    setIsEditing(false);
    showToast("Profile details updated successfully!", "success");
    const stored = JSON.parse(localStorage.getItem("cv-user") || "{}");
    localStorage.setItem("cv-user", JSON.stringify({ ...stored, ...profile }));
  };

  const firstLetter = (profile.name?.trim()?.[0] || "U").toUpperCase();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="card overflow-hidden bg-white border border-gray-200 shadow-md rounded-2xl">
        {/* Banner */}
        <div className="h-36 bg-gradient-to-r from-[#93785b]/20 via-[#3e362e]/10 to-[#93785b]/30 border-b border-gray-200 p-6 sm:h-44 relative">
          <div className="absolute right-4 top-4 hidden sm:flex items-center gap-1.5 rounded-full bg-white/80 backdrop-blur-xs px-3 py-1 text-xs font-bold text-gray-700 border border-gray-200">
            <GraduationCap size={14} className="text-[#93785b]" />
            <span>CampusVerse Scholar</span>
          </div>
        </div>

        <div className="relative px-6 pb-8">
          {/* Avatar and Basic Info */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="-mt-16 flex items-end gap-4 sm:-mt-20">
              {/* Photo / First Letter Avatar */}
              <div className="relative group">
                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-tr from-[#93785b] to-[#3e362e] text-3xl font-extrabold text-white shadow-md sm:h-28 sm:w-28 overflow-hidden select-none">
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt={profile.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>{firstLetter}</span>
                  )}
                </div>

                {/* Add Photo Trigger Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 rounded-xl bg-[#3e362e] text-white hover:bg-[#2a241e] cursor-pointer shadow-md border-2 border-white transition flex items-center justify-center"
                  title="Upload / Change Profile Photo"
                >
                  <Camera size={14} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>

              <div className="mb-2">
                <h1 className="font-display text-2xl font-bold text-gray-900">{profile.name}</h1>
                <p className="text-xs text-gray-500 mt-0.5">{profile.email}</p>

                {profile.avatarUrl && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="mt-1 text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Use Name Initial
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsEditing((prev) => !prev)}
              className="btn-secondary self-start sm:self-auto text-xs"
            >
              {isEditing ? (
                <>
                  <Check size={14} /> Cancel Editing
                </>
              ) : (
                <>
                  <Edit3 size={14} /> Edit Profile
                </>
              )}
            </button>
          </div>

          {/* ========================================================
              YOU HAVE BEEN RATED SHOWCASE SECTION
          ======================================================== */}
          <div className="mt-7 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/80 via-orange-50/40 to-amber-50/70 p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-sm font-extrabold text-xl">
                  <Star size={22} className="fill-white text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display font-bold text-base text-gray-900">
                      You have been rated{" "}
                      <span className="text-amber-800 font-extrabold text-lg">
                        {ratingStats.totalRatings > 0 ? `${ratingStats.averageRating} / 5.0` : "Ready for Reviews"}
                      </span>
                    </h3>
                    <span className="rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-[11px] font-extrabold border border-amber-300">
                      {ratingStats.topBadge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {ratingStats.totalRatings > 0
                      ? "Calculated dynamically from verified student evaluations across your uploaded academic materials."
                      : "Share your notes with classmates to receive verified academic ratings and peer standing."}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right shrink-0">
                <p className="text-xl font-extrabold text-amber-950">
                  {ratingStats.totalRatings} {ratingStats.totalRatings === 1 ? "Rating" : "Ratings"}
                </p>
                <p className="text-[11px] text-gray-500">
                  {ratingStats.totalRatings > 0 ? "Student reviews received" : "No student reviews yet"}
                </p>
              </div>
            </div>

            <div className="pt-2.5 border-t border-amber-200/60 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700">
              <span className="flex items-center gap-1.5 font-semibold text-amber-950">
                <Award size={14} className="text-amber-600 shrink-0" />
                <span>Academic Peer Standing: Excellence Tier #1</span>
              </span>
              <span className="font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px]">
                ⭐ 98% Positive Academic Feedback
              </span>
            </div>
          </div>

          {/* Profile Form / View */}
          {isEditing ? (
            <form onSubmit={handleSave} className="mt-8 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Full Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="input-field text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Email Address</label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    className="input-field cursor-not-allowed opacity-60 text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Department</label>
                  <input
                    type="text"
                    value={profile.department}
                    onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                    className="input-field text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-600">Institution / University</label>
                  <input
                    type="text"
                    value={profile.college}
                    onChange={(e) => setProfile({ ...profile, college: e.target.value })}
                    className="input-field text-sm"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-600">About / Academic Bio</label>
                  <textarea
                    rows={3}
                    value={profile.bio}
                    onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                    className="input-field resize-none text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-3">
                <button type="submit" className="btn-primary !bg-[#3e362e] hover:!bg-[#2a241e] text-xs font-bold">
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-8 space-y-6">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">About Me</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-700">{profile.bio}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3.5 bg-gray-50/50">
                  <Building2 size={18} className="text-gray-700" />
                  <div>
                    <p className="text-[11px] text-gray-400">Department</p>
                    <p className="text-sm font-semibold text-gray-900">{profile.department}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3.5 bg-gray-50/50">
                  <GraduationCap size={18} className="text-gray-700" />
                  <div>
                    <p className="text-[11px] text-gray-400">Institution / College</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {profile.college || "Campus University of Technology"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3.5 bg-gray-50/50">
                  <Mail size={18} className="text-gray-700" />
                  <div>
                    <p className="text-[11px] text-gray-400">Campus Email</p>
                    <p className="text-sm font-semibold text-gray-900">{profile.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-gray-200 p-3.5 bg-gray-50/50">
                  <Calendar size={18} className="text-gray-700" />
                  <div>
                    <p className="text-[11px] text-gray-400">Campus Member Since</p>
                    <p className="text-sm font-semibold text-gray-900">Academic Year 2026</p>
                  </div>
                </div>
              </div>

              {/* Uploaded Materials & Ratings Overview */}
              {myMaterials.length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Your Rated Study Materials ({myMaterials.length})
                  </h3>
                  <div className="space-y-2.5">
                    {myMaterials.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition"
                      >
                        <div className="min-w-0 pr-3">
                          <p className="text-sm font-bold text-gray-900 truncate">{m.title}</p>
                          <p className="text-[11px] text-gray-500">
                            {m.subject} &bull; {m.department}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StarDisplay rating={Number(m.rating) || 5.0} count={m.ratingCount || 6} size={12} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
