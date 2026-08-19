// js/supabase-client.js
//
// Central Supabase client for LUXE.
// All browser-side Supabase communication goes through the window.Luxe*
// APIs exposed at the bottom of this file.
//
// IMPORTANT:
// - `window.supabase` belongs to the Supabase CDN.
// - This file uses `supabaseClient` to avoid the old global collision.
// - The anon/publishable key is intentionally public.
// - NEVER expose a service_role or secret key in frontend code.

const SUPABASE_URL = "https://usqnacxmcbewifgmrtjs.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcW5hY3htY2Jld2lmZ21ydGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDUzMjAsImV4cCI6MjEwMjYyMTMyMH0.ucHyOGcAIgtlEI14U5yv5sMVSGpn7w3YoOGc6RdIjK0";

const isSupabaseConfigured = () =>
  Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes("YOUR_SUPABASE") &&
      !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE") &&
      !SUPABASE_ANON_KEY.includes("PASTE_YOUR")
  );

function pageUrl(relativePath) {
  if (typeof window === "undefined") return relativePath;
  return new URL(relativePath, window.location.href).toString();
}

let supabaseClient = null;

if (typeof window !== "undefined") {
  if (!window.supabase) {
    console.error(
      "[LUXE] Supabase SDK missing. Load @supabase/supabase-js before supabase-client.js."
    );
  } else if (!isSupabaseConfigured()) {
    console.error("[LUXE] Supabase credentials are not configured.");
  } else {
    try {
      supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }
      );
      console.log("[LUXE] Supabase client initialized.");
    } catch (error) {
      console.error("[LUXE] Supabase initialization failed:", error);
    }
  }
}

const LuxeAuth = {
  isReady() {
    return !!supabaseClient;
  },

  async signUp(email, password, fullName) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: pageUrl("login.html?verified=true"),
        },
      });
    } catch (error) {
      console.error("[LUXE] Signup error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to create account." },
      };
    }
  },

  async resendSignupConfirmation(email) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: pageUrl("login.html?verified=true"),
        },
      });
    } catch (error) {
      console.error("[LUXE] Confirmation resend error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to resend confirmation email.",
        },
      };
    }
  },

  async signInWithPassword(email, password) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
    } catch (error) {
      console.error("[LUXE] Login error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to sign in." },
      };
    }
  },

  async signInWithMagicLink(email) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: pageUrl("index.html"),
        },
      });
    } catch (error) {
      console.error("[LUXE] Magic-link error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to send sign-in link." },
      };
    }
  },

  async resetPasswordForEmail(email) {
    if (!supabaseClient) {
      return {
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: pageUrl("reset-password.html"),
      });
    } catch (error) {
      console.error("[LUXE] Password reset request error:", error);
      return {
        error: { message: error?.message || "Unable to send reset email." },
      };
    }
  },

  async updatePassword(newPassword) {
    if (!supabaseClient) {
      return {
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.updateUser({
        password: newPassword,
      });
    } catch (error) {
      console.error("[LUXE] Password update error:", error);
      return {
        error: { message: error?.message || "Unable to update password." },
      };
    }
  },

  async signOut() {
    if (!supabaseClient) {
      return {
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.signOut();
    } catch (error) {
      console.error("[LUXE] Sign-out error:", error);
      return {
        error: { message: error?.message || "Unable to sign out." },
      };
    }
  },

  async getSession() {
    if (!supabaseClient) return null;

    try {
      const {
        data: { session },
        error,
      } = await supabaseClient.auth.getSession();

      if (error) {
        console.error("[LUXE] Session error:", error);
        return null;
      }

      return session || null;
    } catch (error) {
      console.error("[LUXE] Failed to retrieve session:", error);
      return null;
    }
  },

  async getCurrentUser() {
    const session = await this.getSession();
    return session?.user || null;
  },

  onAuthStateChange(callback) {
    if (!supabaseClient || typeof callback !== "function") {
      return null;
    }

    const { data } = supabaseClient.auth.onAuthStateChange(
      (event, session) => {
        callback(session?.user || null, event);
      }
    );

    return data?.subscription || null;
  },
};

const LuxeProfile = {
  async get(userId) {
    if (!supabaseClient || !userId) return null;

    try {
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("[LUXE] Failed to fetch profile:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("[LUXE] Profile fetch error:", error);
      return null;
    }
  },

  async update(userId, fields) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Profile service is not configured." },
      };
    }

    if (!userId) {
      return {
        data: null,
        error: { message: "User ID is required." },
      };
    }

    try {
      return await supabaseClient
        .from("profiles")
        .update({
          ...fields,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();
    } catch (error) {
      console.error("[LUXE] Profile update error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to update profile." },
      };
    }
  },
};

const LuxeOrders = {
  async createOrder(items, shippingAddress) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Order service is not configured." },
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        data: null,
        error: { message: "Your cart is empty." },
      };
    }

    try {
      const rpcItems = items.map((item) => ({
        product_id: Number(item.product_id ?? item.id),
        quantity: Number(item.quantity),
      }));

      const invalidItem = rpcItems.some(
        (item) =>
          !Number.isInteger(item.product_id) ||
          item.product_id <= 0 ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0
      );

      if (invalidItem) {
        return {
          data: null,
          error: { message: "Your cart contains invalid items." },
        };
      }

      const { data, error } = await supabaseClient.rpc(
        "create_order_secure",
        {
          p_items: rpcItems,
          p_shipping_address: shippingAddress || {},
        }
      );

      if (error) {
        console.error("[LUXE] Order creation error:", error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error("[LUXE] Unexpected order creation error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to create order." },
      };
    }
  },

  async getOrders(userId) {
    if (!supabaseClient || !userId) return [];

    try {
      const { data, error } = await supabaseClient
        .from("orders")
        .select("*, order_items(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[LUXE] Failed to load orders:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[LUXE] Orders fetch error:", error);
      return [];
    }
  },
};

const LuxeAdmins = {
  async getRole() {
    if (!supabaseClient) return null;

    try {
      const { data, error } = await supabaseClient.rpc(
        "current_admin_role"
      );

      if (error) {
        console.error("[LUXE] Admin role check error:", error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error("[LUXE] Admin role check error:", error);
      return null;
    }
  },

  async isAdmin() {
    if (!supabaseClient) return false;

    try {
      const { data, error } = await supabaseClient.rpc("is_admin");
      if (error) return false;
      return data === true;
    } catch (error) {
      console.error("[LUXE] Admin check error:", error);
      return false;
    }
  },

  async isOwner() {
    if (!supabaseClient) return false;

    try {
      const { data, error } = await supabaseClient.rpc("is_owner");
      if (error) return false;
      return data === true;
    } catch (error) {
      console.error("[LUXE] Owner check error:", error);
      return false;
    }
  },

  async getAll() {
    if (!supabaseClient) {
      return {
        data: [],
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { data, error } = await supabaseClient.rpc("list_admins");
      return { data: data || [], error };
    } catch (error) {
      console.error("[LUXE] Team fetch error:", error);
      return {
        data: [],
        error: { message: error?.message || "Unable to load team." },
      };
    }
  },

  async add(email) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { error } = await supabaseClient.rpc(
        "admin_add_by_email",
        {
          p_email: String(email || "").trim().toLowerCase(),
        }
      );

      return { error };
    } catch (error) {
      console.error("[LUXE] Add admin error:", error);
      return {
        error: {
          message: error?.message || "Unable to add team member.",
        },
      };
    }
  },

  async remove(userId) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { error } = await supabaseClient.rpc("admin_remove", {
        p_user_id: userId,
      });

      return { error };
    } catch (error) {
      console.error("[LUXE] Remove admin error:", error);
      return {
        error: {
          message: error?.message || "Unable to remove team member.",
        },
      };
    }
  },
};

const LuxeStorage = {
  BUCKET: "luxe-uploads",

  _sanitizeName(filename) {
    return String(filename || "image").replace(
      /[^a-zA-Z0-9.\-_]/g,
      "_"
    );
  },

  _uniquePath(folder, file) {
    const unique =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${folder}/${unique}-${this._sanitizeName(file.name)}`;
  },

  async _upload(file, path) {
    if (!supabaseClient) {
      return {
        url: null,
        error: { message: "Backend not configured." },
      };
    }

    if (typeof File !== "undefined" && !(file instanceof File)) {
      return {
        url: null,
        error: { message: "Select a valid file." },
      };
    }

    if (file.type && !file.type.startsWith("image/")) {
      return {
        url: null,
        error: { message: "Only image files are allowed." },
      };
    }

    try {
      const { error: uploadError } = await supabaseClient.storage
        .from(this.BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
          cacheControl: "3600",
        });

      if (uploadError) {
        console.error("[LUXE] Upload error:", uploadError);
        return { url: null, error: uploadError };
      }

      const { data } = supabaseClient.storage
        .from(this.BUCKET)
        .getPublicUrl(path);

      return {
        url: data?.publicUrl || null,
        error: null,
      };
    } catch (error) {
      console.error("[LUXE] Upload error:", error);
      return {
        url: null,
        error: { message: error?.message || "Upload failed." },
      };
    }
  },

  async uploadProductImage(file) {
    return await this._upload(
      file,
      this._uniquePath("products", file)
    );
  },

  async uploadAvatar(file, userId) {
    return await this._upload(
      file,
      this._uniquePath(`avatars/${userId}`, file)
    );
  },
};

const LuxeProducts = {
  _fromRow(row) {
    return {
      id: Number(row.id),
      name: row.name,
      brand: row.brand,
      category: row.category,
      subcategory: row.subcategory,
      price: Number(row.price),
      oldPrice:
        row.old_price !== null && row.old_price !== undefined
          ? Number(row.old_price)
          : null,
      image: row.image,
      hoverImage: row.hover_image || row.image,
      rating: Number(row.rating),
      discount: !!row.discount,
      description: row.description || "",
      sizes: row.sizes || [],
      colors: row.colors || [],
      inStock: !!row.in_stock,
      tags: row.tags || [],
    };
  },

  _toRow(product) {
    const price = Number.parseFloat(product.price);
    const oldPrice =
      product.oldPrice !== undefined &&
      product.oldPrice !== null &&
      product.oldPrice !== ""
        ? Number.parseFloat(product.oldPrice)
        : null;

    return {
      name: String(product.name || "Untitled Product").trim(),
      brand: String(product.brand || "Luxe").trim(),
      category: String(product.category || "Men").trim(),
      subcategory: String(product.subcategory || "General").trim(),
      price: Number.isFinite(price) ? price : 0,
      old_price: Number.isFinite(oldPrice) ? oldPrice : null,
      image: String(product.image || "").trim(),
      hover_image: String(
        product.hoverImage || product.image || ""
      ).trim(),
      rating: Number.parseFloat(product.rating) || 5.0,
      discount: Boolean(
        Number.isFinite(oldPrice) &&
          oldPrice > (Number.isFinite(price) ? price : 0)
      ),
      description: String(product.description || "").trim(),
      sizes: Array.isArray(product.sizes)
        ? product.sizes
        : String(product.sizes || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
      colors: Array.isArray(product.colors)
        ? product.colors
        : String(product.colors || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
      in_stock:
        product.inStock !== undefined ? !!product.inStock : true,
      tags: Array.isArray(product.tags)
        ? product.tags
            .map((tag) => String(tag).trim().toLowerCase())
            .filter(Boolean)
        : String(product.tags || "")
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
    };
  },

  async getAll() {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        console.error("[LUXE] Failed to load products:", error);
        return { data: null, error };
      }

      return {
        data: (data || []).map((row) => this._fromRow(row)),
        error: null,
      };
    } catch (error) {
      console.error("[LUXE] Products fetch error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to load products." },
      };
    }
  },

  async create(productData) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from("products")
        .insert(this._toRow(productData))
        .select()
        .single();

      if (error) {
        console.error("[LUXE] Failed to add product:", error);
        return { data: null, error };
      }

      return { data: this._fromRow(data), error: null };
    } catch (error) {
      console.error("[LUXE] Product create error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to add product." },
      };
    }
  },

  async update(id, productData) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from("products")
        .update(this._toRow(productData))
        .eq("id", Number(id))
        .select()
        .single();

      if (error) {
        console.error("[LUXE] Failed to update product:", error);
        return { data: null, error };
      }

      return { data: this._fromRow(data), error: null };
    } catch (error) {
      console.error("[LUXE] Product update error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to update product.",
        },
      };
    }
  },

  async remove(id) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { error } = await supabaseClient
        .from("products")
        .delete()
        .eq("id", Number(id));

      return { error };
    } catch (error) {
      console.error("[LUXE] Product delete error:", error);
      return {
        error: {
          message: error?.message || "Unable to delete product.",
        },
      };
    }
  },

  async importStarterCatalog(catalogArray) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
        imported: 0,
      };
    }

    try {
      const { data: existing, error: existingError } =
        await supabaseClient
          .from("products")
          .select("id");

      if (existingError) {
        return { error: existingError, imported: 0 };
      }

      const existingIds = new Set(
        (existing || []).map((row) => Number(row.id))
      );

      const rows = (catalogArray || [])
        .filter((product) => Number.isInteger(Number(product.id)))
        .filter(
          (product) => !existingIds.has(Number(product.id))
        )
        .map((product) => ({
          id: Number(product.id),
          ...this._toRow(product),
        }));

      if (!rows.length) {
        return { error: null, imported: 0 };
      }

      const { error } = await supabaseClient
        .from("products")
        .insert(rows);

      if (error) {
        return { error, imported: 0 };
      }

      const { error: syncError } = await supabaseClient.rpc(
        "sync_products_id_sequence"
      );

      if (syncError) {
        console.error(
          "[LUXE] Product sequence sync failed:",
          syncError
        );
        return {
          error: syncError,
          imported: rows.length,
        };
      }

      return { error: null, imported: rows.length };
    } catch (error) {
      console.error("[LUXE] Catalog import error:", error);
      return {
        error: {
          message:
            error?.message || "Unable to import starter catalog.",
        },
        imported: 0,
      };
    }
  },
};

const LuxeUpdates = {
  async getActive() {
    if (!supabaseClient) return [];

    try {
      const { data, error } = await supabaseClient
        .from("site_updates")
        .select("*")
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.error("[LUXE] Failed to load site update:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[LUXE] Site update fetch error:", error);
      return [];
    }
  },

  async getAll() {
    if (!supabaseClient) {
      return {
        data: [],
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { data, error } = await supabaseClient
        .from("site_updates")
        .select("*")
        .order("created_at", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      console.error("[LUXE] Site updates fetch error:", error);
      return {
        data: [],
        error: { message: error?.message || "Unable to load updates." },
      };
    }
  },

  async create(title, message) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
      };
    }

    try {
      return await supabaseClient
        .from("site_updates")
        .insert({
          title: String(title || "").trim(),
          message: String(message || "").trim(),
        });
    } catch (error) {
      console.error("[LUXE] Site update create error:", error);
      return {
        error: { message: error?.message || "Unable to post update." },
      };
    }
  },

  async remove(id) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
      };
    }

    try {
      return await supabaseClient
        .from("site_updates")
        .delete()
        .eq("id", id);
    } catch (error) {
      console.error("[LUXE] Site update delete error:", error);
      return {
        error: {
          message: error?.message || "Unable to delete update.",
        },
      };
    }
  },
};

const testSupabaseConnection = async () => {
  if (!supabaseClient) return false;

  try {
    const { error } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("[LUXE] Supabase connection test failed:", error);
      return false;
    }

    console.log("[LUXE] Supabase connection looks healthy.");
    return true;
  } catch (error) {
    console.error("[LUXE] Supabase connection test failed:", error);
    return false;
  }
};

if (typeof window !== "undefined") {
  window.LuxeAuth = LuxeAuth;
  window.LuxeProfile = LuxeProfile;
  window.LuxeOrders = LuxeOrders;
  window.LuxeAdmins = LuxeAdmins;
  window.LuxeStorage = LuxeStorage;
  window.LuxeProducts = LuxeProducts;
  window.LuxeUpdates = LuxeUpdates;

  window.isSupabaseConfigured = isSupabaseConfigured;
  window.testSupabaseConnection = testSupabaseConnection;
}
