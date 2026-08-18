// js/supabase-client.js
//
// Central Supabase client for LUXE.
// Frontend code talks to Supabase through the window.Luxe* APIs below.
//
// IMPORTANT:
// - The Supabase CDN owns `window.supabase`.
// - This file uses `supabaseClient` to avoid the old global-name collision.
// - The anon/publishable key is intentionally public. RLS protects the data.
// - NEVER place a service_role/secret key in frontend code.

// ---------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------

const SUPABASE_URL = "https://usqnacxmcbewifgmrtjs.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcW5hY3htY2Jld2lmZ21ydGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDUzMjAsImV4cCI6MjEwMjYyMTMyMH0.ucHyOGcAIgtlEI14U5yv5sMVSGpn7w3YoOGc6RdIjK0";

const isSupabaseConfigured = () =>
  Boolean(
    SUPABASE_URL &&
      SUPABASE_ANON_KEY &&
      !SUPABASE_URL.includes("YOUR_SUPABASE") &&
      !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE") &&
      !SUPABASE_ANON_KEY.includes("PASTE_YOUR"),
  );

function authRedirectUrl(relativePath) {
  if (typeof window === "undefined") return relativePath;
  return new URL(relativePath, window.location.href).toString();
}

// ---------------------------------------------------------------------
// CLIENT
// ---------------------------------------------------------------------

let supabaseClient = null;

if (typeof window !== "undefined") {
  if (!window.supabase) {
    console.error(
      "[LUXE] Supabase SDK missing. Load @supabase/supabase-js before supabase-client.js.",
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
        },
      );

      console.log("[LUXE] Supabase client initialized.");
    } catch (error) {
      console.error("[LUXE] Supabase initialization failed:", error);
    }
  }
}

// ---------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------

const LuxeAuth = {
  isReady() {
    return !!supabaseClient;
  },

  async signUp(email, password, fullName) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Account service is unavailable." } };
    }

    try {
      return await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          // Relative URL works locally and in production as long as
          // the resulting URL is allowed in Supabase Auth URL settings.
          emailRedirectTo: authRedirectUrl("login.html?verified=true"),
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
      return { data: null, error: { message: "Account service is unavailable." } };
    }

    try {
      return await supabaseClient.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: authRedirectUrl("login.html?verified=true"),
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
      return { data: null, error: { message: "Account service is unavailable." } };
    }

    try {
      return await supabaseClient.auth.signInWithPassword({ email, password });
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
      return { data: null, error: { message: "Account service is unavailable." } };
    }

    try {
      return await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: authRedirectUrl("index.html"),
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

  async signOut() {
    if (!supabaseClient) {
      return { error: { message: "Account service is unavailable." } };
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
        console.error("[LUXE] Session lookup error:", error);
        return null;
      }

      return session || null;
    } catch (error) {
      console.error("[LUXE] Session lookup failed:", error);
      return null;
    }
  },

  async getCurrentUser() {
    const session = await this.getSession();
    return session?.user || null;
  },

  onAuthStateChange(callback) {
    if (!supabaseClient || typeof callback !== "function") return null;

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      callback(session?.user || null, event);
    });

    return data?.subscription || null;
  },
};

// ---------------------------------------------------------------------
// ADMIN AUTHORIZATION
// No owner email is hardcoded in the browser.
// The database decides whether auth.uid() belongs to admin_users.
// ---------------------------------------------------------------------

const LuxeAdmin = {
  async isAdmin() {
    if (!supabaseClient) return false;

    try {
      const { data, error } = await supabaseClient.rpc("is_admin");

      if (error) {
        console.error("[LUXE] Admin check failed:", error);
        return false;
      }

      return data === true;
    } catch (error) {
      console.error("[LUXE] Admin check failed:", error);
      return false;
    }
  },
};

// ---------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------

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
        console.error("[LUXE] Profile fetch failed:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("[LUXE] Profile fetch failed:", error);
      return null;
    }
  },

  async update(userId, fields) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Profile service is unavailable." } };
    }

    if (!userId) {
      return { data: null, error: { message: "User ID is required." } };
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
      console.error("[LUXE] Profile update failed:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to update profile." },
      };
    }
  },
};

// ---------------------------------------------------------------------
// ORDERS
//
// The browser sends ONLY product IDs + quantities + shipping address.
// Prices/tax/shipping/final total are calculated inside Postgres.
// The RPC creates the order and its items atomically.
// ---------------------------------------------------------------------

const LuxeOrders = {
  async createOrder(items, shippingAddress) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Order service is unavailable." } };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return { data: null, error: { message: "Your cart is empty." } };
    }

    const safeItems = items.map((item) => ({
      product_id: Number(item.product_id ?? item.id),
      quantity: Number(item.quantity),
    }));

    if (
      safeItems.some(
        (item) =>
          !Number.isInteger(item.product_id) ||
          item.product_id <= 0 ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0,
      )
    ) {
      return { data: null, error: { message: "Your cart contains invalid items." } };
    }

    try {
      const { data, error } = await supabaseClient.rpc("create_order_secure", {
        p_items: safeItems,
        p_shipping_address: shippingAddress || {},
      });

      if (error) {
        console.error("[LUXE] Secure order creation failed:", error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error("[LUXE] Secure order creation failed:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to place order." },
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
        console.error("[LUXE] Orders fetch failed:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[LUXE] Orders fetch failed:", error);
      return [];
    }
  },
};

// ---------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------

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
      hover_image: String(product.hoverImage || product.image || "").trim(),
      rating: Number.parseFloat(product.rating) || 5.0,
      discount: Boolean(
        Number.isFinite(oldPrice) && oldPrice > (Number.isFinite(price) ? price : 0),
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
      in_stock: product.inStock !== undefined ? !!product.inStock : true,
      tags: Array.isArray(product.tags)
        ? product.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)
        : String(product.tags || "")
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
    };
  },

  async getAll() {
    if (!supabaseClient) {
      return { data: null, error: { message: "Backend not configured." } };
    }

    try {
      const { data, error } = await supabaseClient
        .from("products")
        .select("*")
        .order("id", { ascending: false });

      if (error) {
        console.error("[LUXE] Product fetch failed:", error);
        return { data: null, error };
      }

      return {
        data: (data || []).map((row) => this._fromRow(row)),
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: { message: error?.message || "Unable to load products." },
      };
    }
  },

  async create(productData) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Backend not configured." } };
    }

    try {
      // ID is generated by Postgres. No browser-side max(id)+1 race.
      const { data, error } = await supabaseClient
        .from("products")
        .insert(this._toRow(productData))
        .select()
        .single();

      if (error) return { data: null, error };

      return { data: this._fromRow(data), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: error?.message || "Unable to add product." },
      };
    }
  },

  async update(id, productData) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Backend not configured." } };
    }

    try {
      const { data, error } = await supabaseClient
        .from("products")
        .update(this._toRow(productData))
        .eq("id", Number(id))
        .select()
        .single();

      if (error) return { data: null, error };

      return { data: this._fromRow(data), error: null };
    } catch (error) {
      return {
        data: null,
        error: { message: error?.message || "Unable to update product." },
      };
    }
  },

  async remove(id) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured." } };
    }

    try {
      const { error } = await supabaseClient
        .from("products")
        .delete()
        .eq("id", Number(id));

      return { error };
    } catch (error) {
      return {
        error: { message: error?.message || "Unable to delete product." },
      };
    }
  },

  async importStarterCatalog(catalogArray) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured." }, imported: 0 };
    }

    try {
      const { data: existing, error: existingError } = await supabaseClient
        .from("products")
        .select("id");

      if (existingError) return { error: existingError, imported: 0 };

      const existingIds = new Set((existing || []).map((row) => Number(row.id)));

      const rows = (catalogArray || [])
        .filter((product) => Number.isInteger(Number(product.id)))
        .filter((product) => !existingIds.has(Number(product.id)))
        .map((product) => ({
          id: Number(product.id),
          ...this._toRow(product),
        }));

      if (!rows.length) {
        return { error: null, imported: 0 };
      }

      const { error } = await supabaseClient.from("products").insert(rows);

      if (error) return { error, imported: 0 };

      // Explicit starter IDs do not automatically move a sequence.
      // This admin-only RPC moves it past the highest imported ID.
      const { error: syncError } = await supabaseClient.rpc(
        "sync_products_id_sequence",
      );

      if (syncError) {
        console.error("[LUXE] Product ID sequence sync failed:", syncError);
        return { error: syncError, imported: rows.length };
      }

      return { error: null, imported: rows.length };
    } catch (error) {
      return {
        error: { message: error?.message || "Unable to import starter catalog." },
        imported: 0,
      };
    }
  },
};

// ---------------------------------------------------------------------
// SITE UPDATES
// ---------------------------------------------------------------------

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
        console.error("[LUXE] Site update fetch failed:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[LUXE] Site update fetch failed:", error);
      return [];
    }
  },

  async getAll() {
    if (!supabaseClient) {
      return { data: [], error: { message: "Backend not configured." } };
    }

    try {
      const { data, error } = await supabaseClient
        .from("site_updates")
        .select("*")
        .order("created_at", { ascending: false });

      return { data: data || [], error };
    } catch (error) {
      return {
        data: [],
        error: { message: error?.message || "Unable to load updates." },
      };
    }
  },

  async create(title, message) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured." } };
    }

    try {
      return await supabaseClient.from("site_updates").insert({
        title: String(title || "").trim(),
        message: String(message || "").trim(),
      });
    } catch (error) {
      return {
        error: { message: error?.message || "Unable to post update." },
      };
    }
  },

  async remove(id) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured." } };
    }

    try {
      return await supabaseClient.from("site_updates").delete().eq("id", id);
    } catch (error) {
      return {
        error: { message: error?.message || "Unable to delete update." },
      };
    }
  },
};

// ---------------------------------------------------------------------
// CONNECTION TEST
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// PUBLIC APP API
// ---------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.LuxeAuth = LuxeAuth;
  window.LuxeAdmin = LuxeAdmin;
  window.LuxeProfile = LuxeProfile;
  window.LuxeOrders = LuxeOrders;
  window.LuxeProducts = LuxeProducts;
  window.LuxeUpdates = LuxeUpdates;

  window.isSupabaseConfigured = isSupabaseConfigured;
  window.testSupabaseConnection = testSupabaseConnection;
}
