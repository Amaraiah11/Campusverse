import { supabase, isSupabaseConfigured } from "../config/supabase.js";

export const authController = {
  /**
   * User Registration
   */
  async register(req, res, next) {
    try {
      const { name, full_name, email, password, department = "Computer Science & Engineering", role = "student" } = req.body;
      const resolvedName = (name || full_name || "").trim();

      if (!email || !password || !resolvedName) {
        return res.status(400).json({ detail: "Name, email, and password are required." });
      }

      if (password.length < 6) {
        return res.status(400).json({ detail: "Password must be at least 6 characters long." });
      }

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            data: {
              full_name: resolvedName,
              department,
              role,
            },
          },
        });

        if (error) {
          return res.status(400).json({ detail: error.message });
        }

        const user = data.user;
        const token = data.session?.access_token || "auth-session-token";

        // Upsert into public.profiles
        if (user) {
          await supabase.from("profiles").upsert({
            id: user.id,
            full_name: resolvedName,
            email: email.trim().toLowerCase(),
            department,
            role,
          });
        }

        return res.status(201).json({
          message: "Registration successful!",
          token,
          user: {
            id: user.id,
            name: resolvedName,
            email: user.email,
            department,
            role,
          },
        });
      }

      // Offline simulation fallback
      const fakeUser = {
        id: `usr_${Date.now()}`,
        name: resolvedName,
        email: email.trim().toLowerCase(),
        department,
        role,
      };

      return res.status(201).json({
        message: "Registration successful (Local mode)",
        token: "demo-token",
        user: fakeUser,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * User Login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ detail: "Email and password are required." });
      }

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          return res.status(401).json({ detail: error.message });
        }

        const user = data.user;
        const token = data.session.access_token;

        // Fetch user profile from public.profiles
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        return res.json({
          message: "Login successful!",
          token,
          user: {
            id: user.id,
            name: profile?.full_name || user.user_metadata?.full_name || "Student",
            email: user.email,
            department: profile?.department || user.user_metadata?.department || "General",
            role: profile?.role || "student",
          },
        });
      }

      // Offline simulation fallback
      const cleanName = email.includes("@") ? email.split("@")[0] : "Student";
      const fakeUser = {
        id: "demo-usr-1",
        name: cleanName,
        email: email.trim().toLowerCase(),
        department: "Computer Science & Engineering",
        role: "student",
      };

      return res.json({
        message: "Login successful (Local mode)",
        token: "demo-token",
        user: fakeUser,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Admin Login
   */
  async adminLogin(req, res, next) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ detail: "Admin email and password are required." });
      }

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          return res.status(401).json({ detail: error.message });
        }

        const user = data.user;
        const token = data.session.access_token;

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("id", user.id)
          .single();

        if (profile?.role !== "admin") {
          return res.status(403).json({ detail: "Access denied. Admin credentials required." });
        }

        return res.json({
          message: "Admin login successful!",
          token,
          user: {
            id: user.id,
            name: profile.full_name || "Administrator",
            email: user.email,
            role: "admin",
          },
        });
      }

      // Offline simulation fallback
      return res.json({
        message: "Admin login successful (Local mode)",
        token: "demo-token",
        user: {
          id: "admin-demo-1",
          name: "System Administrator",
          email: email.trim().toLowerCase(),
          role: "admin",
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Get Current Authenticated Profile
   */
  async me(req, res) {
    return res.json({ user: req.user });
  },

  /**
   * Update Profile
   */
  async updateProfile(req, res, next) {
    try {
      const { full_name, department } = req.body;
      const userId = req.user.id;

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from("profiles")
          .update({
            full_name,
            department,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId)
          .select()
          .single();

        if (error) return res.status(400).json({ detail: error.message });
        return res.json({ message: "Profile updated successfully!", profile: data });
      }

      return res.json({
        message: "Profile updated (Local mode)",
        profile: { ...req.user, full_name, department },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Logout
   */
  async logout(req, res) {
    if (isSupabaseConfigured()) {
      await supabase.auth.signOut().catch(() => {});
    }
    return res.json({ message: "Logged out successfully." });
  },
};
