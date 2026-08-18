// js/supabase-client.js
//
// Central Supabase client for LUXE.
// All direct communication with Supabase should happen through this file.
//
// Other frontend files should use:
//   window.LuxeAuth
//   window.LuxeProfile
//   window.LuxeOrders
//
// Do NOT redeclare a global variable named `supabase` here because the
// Supabase CDN already exposes `window.supabase`.

// ---------------------------------------------------------------------
// SUPABASE CONFIGURATION
// ---------------------------------------------------------------------

const SUPABASE_URL = "https://usqnacxmcbewifgmrtjs.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcW5hY3htY2Jld2lmZ21ydGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDUzMjAsImV4cCI6MjEwMjYyMTMyMH0.ucHyOGcAIgtlEI14U5yv5sMVSGpn7w3YoOGc6RdIjK0";

// The anon / publishable key is safe to expose in frontend code.
// Security should be enforced through Supabase Row Level Security (RLS).
//
// NEVER put the Supabase service_role key in frontend code.

// ---------------------------------------------------------------------
// CONFIGURATION CHECK
// ---------------------------------------------------------------------

const isSupabaseConfigured = () => {
  return (
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.length > 0 &&
    SUPABASE_ANON_KEY.length > 0 &&
    !SUPABASE_URL.includes("YOUR_SUPABASE") &&
    !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE") &&
    !SUPABASE_ANON_KEY.includes("PASTE_YOUR")
  );
};

// ---------------------------------------------------------------------
// CREATE SUPABASE CLIENT
// ---------------------------------------------------------------------

let supabaseClient = null;

if (typeof window !== "undefined") {
  if (!window.supabase) {
    console.error(
      "[LUXE] Supabase SDK was not found. Make sure the Supabase CDN script loads before supabase-client.js.",
    );
  } else if (!isSupabaseConfigured()) {
    console.error(
      "[LUXE] Supabase is not configured. Add the correct project URL and anon/publishable key.",
    );
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
      console.error("[LUXE] Failed to initialize Supabase:", error);
    }
  }
}

// ---------------------------------------------------------------------
// AUTHENTICATION
// ---------------------------------------------------------------------

const LuxeAuth = {
  isReady() {
    return !!supabaseClient;
  },

  async signUp(email, password, fullName) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is not configured.",
        },
      };
    }

    try {
      return await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });
    } catch (error) {
      console.error("[LUXE] Signup error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to create account.",
        },
      };
    }
  },

  async verifySignupOtp(email, token) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is not configured.",
        },
      };
    }

    try {
      return await supabaseClient.auth.verifyOtp({
        email,
        token,
        type: "signup",
      });
    } catch (error) {
      console.error("[LUXE] OTP verification error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to verify the code.",
        },
      };
    }
  },

  async resendSignupOtp(email) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is not configured.",
        },
      };
    }

    try {
      return await supabaseClient.auth.resend({
        type: "signup",
        email,
      });
    } catch (error) {
      console.error("[LUXE] OTP resend error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to resend verification code.",
        },
      };
    }
  },

  async signInWithPassword(email, password) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is not configured.",
        },
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
        error: {
          message: error?.message || "Unable to sign in.",
        },
      };
    }
  },

  async signInWithMagicLink(email) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is not configured.",
        },
      };
    }

    try {
      return await supabaseClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
        },
      });
    } catch (error) {
      console.error("[LUXE] Magic-link error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to send magic link.",
        },
      };
    }
  },

  async signOut() {
    if (!supabaseClient) {
      return {
        error: {
          message: "Account service is not configured.",
        },
      };
    }

    try {
      return await supabaseClient.auth.signOut();
    } catch (error) {
      console.error("[LUXE] Sign-out error:", error);

      return {
        error: {
          message: error?.message || "Unable to sign out.",
        },
      };
    }
  },

  async getCurrentUser() {
    if (!supabaseClient) {
      return null;
    }

    try {
      const {
        data: { session },
        error,
      } = await supabaseClient.auth.getSession();

      if (error) {
        console.error("[LUXE] Session error:", error);
        return null;
      }

      return session?.user || null;
    } catch (error) {
      console.error("[LUXE] Failed to retrieve session:", error);
      return null;
    }
  },

  async getSession() {
    if (!supabaseClient) {
      return null;
    }

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

  onAuthStateChange(callback) {
    if (!supabaseClient || typeof callback !== "function") {
      return null;
    }

    return supabaseClient.auth.onAuthStateChange((_event, session) => {
      callback(session?.user || null);
    });
  },
};

// ---------------------------------------------------------------------
// USER PROFILE
// ---------------------------------------------------------------------

const LuxeProfile = {
  async get(userId) {
    if (!supabaseClient || !userId) {
      return null;
    }

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
        error: {
          message: "Account service is not configured.",
        },
      };
    }

    if (!userId) {
      return {
        data: null,
        error: {
          message: "User ID is required.",
        },
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
        error: {
          message: error?.message || "Unable to update profile.",
        },
      };
    }
  },
};

// ---------------------------------------------------------------------
// ORDERS
// ---------------------------------------------------------------------

const LuxeOrders = {
  async createOrder(userId, items, totals, shippingAddress) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Order service is not configured.",
        },
      };
    }

    if (!userId) {
      return {
        data: null,
        error: {
          message: "You must be logged in to create an order.",
        },
      };
    }

    if (!Array.isArray(items) || items.length === 0) {
      return {
        data: null,
        error: {
          message: "Your cart is empty.",
        },
      };
    }

    if (!totals) {
      return {
        data: null,
        error: {
          message: "Order totals are missing.",
        },
      };
    }

    try {
      const orderNumber = "LX-" + Math.floor(100000 + Math.random() * 900000);

      const { data: order, error: orderError } = await supabaseClient
        .from("orders")
        .insert({
          user_id: userId,
          order_number: orderNumber,
          subtotal: totals.subtotal,
          shipping: totals.shipping,
          tax: totals.tax,
          total: totals.total,
          status: "processing",
          shipping_address: shippingAddress || null,
        })
        .select()
        .single();

      if (orderError) {
        console.error("[LUXE] Order creation error:", orderError);

        return {
          data: null,
          error: orderError,
        };
      }

      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: String(item.id),
        product_name: item.name,
        price: item.price,
        quantity: item.quantity,
        image_url: item.image || "",
      }));

      const { error: itemsError } = await supabaseClient
        .from("order_items")
        .insert(orderItems);

      if (itemsError) {
        console.error("[LUXE] Order items creation error:", itemsError);

        return {
          data: null,
          error: itemsError,
        };
      }

      return {
        data: order,
        error: null,
      };
    } catch (error) {
      console.error("[LUXE] Unexpected order creation error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to create order.",
        },
      };
    }
  },

  async getOrders(userId) {
    if (!supabaseClient || !userId) {
      return [];
    }

    try {
      const { data, error } = await supabaseClient
        .from("orders")
        .select("*, order_items(*)")
        .eq("user_id", userId)
        .order("created_at", {
          ascending: false,
        });

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

// ---------------------------------------------------------------------
// CONNECTION TEST
// ---------------------------------------------------------------------

const testSupabaseConnection = async () => {
  if (!supabaseClient) {
    console.error("[LUXE] Supabase client is unavailable.");
    return false;
  }

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
// PRODUCTS
// Real, shared, server-side product catalog (replaces the old
// localStorage-only version — that one was only ever visible in the
// browser that used it, not to real visitors).
// Writes are allowed only for the owner email — enforced by the
// database's Row Level Security policies (see supabase/migrations),
// so even if someone calls these functions directly from devtools,
// the database itself rejects the write unless they're really logged
// in as the owner.
// ---------------------------------------------------------------------

const LuxeProducts = {
  // Row shape from the DB (snake_case) -> shape the rest of the site
  // already expects (camelCase), so products.js / shop.js / etc.
  // don't need to know the difference.
  _fromRow(row) {
    return {
      id: row.id,
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

  _toRow(p) {
    const price = parseFloat(p.price) || 0;
    const oldPrice =
      p.oldPrice !== undefined && p.oldPrice !== null && p.oldPrice !== ""
        ? parseFloat(p.oldPrice)
        : null;
    return {
      name: p.name || "Untitled Product",
      brand: p.brand || "Luxe",
      category: p.category || "Men",
      subcategory: p.subcategory || "General",
      price,
      old_price: oldPrice,
      image: p.image || "",
      hover_image: p.hoverImage || p.image || "",
      rating: parseFloat(p.rating) || 5.0,
      discount: !!(oldPrice && oldPrice > price),
      description: p.description || "",
      sizes: Array.isArray(p.sizes)
        ? p.sizes
        : String(p.sizes || "").split(",").map((s) => s.trim()).filter(Boolean),
      colors: Array.isArray(p.colors)
        ? p.colors
        : String(p.colors || "").split(",").map((s) => s.trim()).filter(Boolean),
      in_stock: p.inStock !== undefined ? !!p.inStock : true,
      tags: Array.isArray(p.tags)
        ? p.tags
        : String(p.tags || "")
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
    };
  },

  // Public read — works for every visitor, logged in or not.
  async getAll() {
    if (!supabaseClient) {
      return { data: null, error: { message: "Backend not configured" } };
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
      return { data: data.map(this._fromRow), error: null };
    } catch (error) {
      console.error("[LUXE] Products fetch error:", error);
      return { data: null, error: { message: error?.message || "Unable to load products." } };
    }
  },

  // Owner-only (blocked by RLS for anyone else).
  async create(productData) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Backend not configured" } };
    }
    try {
      // Mirrors the old "max id + 1" logic so ids stay simple
      // sequential numbers like the original catalog used.
      const { data: existing, error: maxErr } = await supabaseClient
        .from("products")
        .select("id")
        .order("id", { ascending: false })
        .limit(1);
      if (maxErr) return { data: null, error: maxErr };
      const nextId = existing && existing.length ? existing[0].id + 1 : 1;

      const row = { id: nextId, ...this._toRow(productData) };
      const { data, error } = await supabaseClient
        .from("products")
        .insert(row)
        .select()
        .single();
      if (error) {
        console.error("[LUXE] Failed to add product:", error);
        return { data: null, error };
      }
      return { data: this._fromRow(data), error: null };
    } catch (error) {
      console.error("[LUXE] Product create error:", error);
      return { data: null, error: { message: error?.message || "Unable to add product." } };
    }
  },

  async update(id, productData) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Backend not configured" } };
    }
    try {
      const row = this._toRow(productData);
      const { data, error } = await supabaseClient
        .from("products")
        .update(row)
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
      return { data: null, error: { message: error?.message || "Unable to update product." } };
    }
  },

  async remove(id) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured" } };
    }
    try {
      const { error } = await supabaseClient.from("products").delete().eq("id", Number(id));
      if (error) console.error("[LUXE] Failed to delete product:", error);
      return { error };
    } catch (error) {
      console.error("[LUXE] Product delete error:", error);
      return { error: { message: error?.message || "Unable to delete product." } };
    }
  },

  // One-time helper: pushes the old hardcoded catalog (window.products,
  // shipped as a fallback in products.js) into the database. Safe to
  // click more than once — it skips ids that already exist.
  async importStarterCatalog(catalogArray) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured" } };
    }
    try {
      const { data: existing, error: exErr } = await supabaseClient
        .from("products")
        .select("id");
      if (exErr) return { error: exErr };
      const existingIds = new Set((existing || []).map((r) => r.id));
      const rows = catalogArray
        .filter((p) => !existingIds.has(p.id))
        .map((p) => ({ id: p.id, ...this._toRow(p) }));
      if (!rows.length) return { error: null, imported: 0 };
      const { error } = await supabaseClient.from("products").insert(rows);
      if (error) return { error };
      return { error: null, imported: rows.length };
    } catch (error) {
      console.error("[LUXE] Catalog import error:", error);
      return { error: { message: error?.message || "Unable to import catalog." } };
    }
  },
};

// ---------------------------------------------------------------------
// SITE UPDATES  (announcement banner: post + delete)
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
      return { data: [], error: { message: "Backend not configured" } };
    }
    try {
      const { data, error } = await supabaseClient
        .from("site_updates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) console.error("[LUXE] Failed to load site updates:", error);
      return { data: data || [], error };
    } catch (error) {
      console.error("[LUXE] Site updates fetch error:", error);
      return { data: [], error: { message: error?.message || "Unable to load updates." } };
    }
  },

  async create(title, message) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured" } };
    }
    try {
      const result = await supabaseClient.from("site_updates").insert({ title, message });
      if (result.error) console.error("[LUXE] Failed to post update:", result.error);
      return result;
    } catch (error) {
      console.error("[LUXE] Site update create error:", error);
      return { error: { message: error?.message || "Unable to post update." } };
    }
  },

  async remove(id) {
    if (!supabaseClient) {
      return { error: { message: "Backend not configured" } };
    }
    try {
      const result = await supabaseClient.from("site_updates").delete().eq("id", id);
      if (result.error) console.error("[LUXE] Failed to delete update:", result.error);
      return result;
    } catch (error) {
      console.error("[LUXE] Site update delete error:", error);
      return { error: { message: error?.message || "Unable to delete update." } };
    }
  },
};

// ---------------------------------------------------------------------
// EXPOSE SAFE APPLICATION API
// ---------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.LuxeAuth = LuxeAuth;
  window.LuxeProfile = LuxeProfile;
  window.LuxeOrders = LuxeOrders;
  window.LuxeProducts = LuxeProducts;
  window.LuxeUpdates = LuxeUpdates;

  window.isSupabaseConfigured = isSupabaseConfigured;
  window.testSupabaseConnection = testSupabaseConnection;
}
