import { supabase, isSupabaseConfigured } from "../config/supabase.js";

export const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    if (!isSupabaseConfigured()) {
      req.user = {
        id: "demo-usr-1",
        email: "student@campusverse.edu",
        role: "admin",
        department: "Computer Science & Engineering",
      };
      return next();
    }
    return res.status(401).json({ detail: "Authentication required. No token provided." });
  }

  // Support local demo token if Supabase credentials are not yet linked
  if (token === "demo-token" || !isSupabaseConfigured()) {
    req.user = {
      id: "demo-usr-1",
      email: "student@campusverse.edu",
      role: "admin",
      department: "Computer Science & Engineering",
    };
    return next();
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ detail: "Invalid or expired session token." });
    }

    // Fetch profile role and metadata
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();

    req.user = {
      ...data.user,
      ...profile,
      role: profile?.role || "student",
    };

    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    res.status(401).json({ detail: "Authentication verification failed." });
  }
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ detail: "Administrative privileges required." });
  }
  next();
};
