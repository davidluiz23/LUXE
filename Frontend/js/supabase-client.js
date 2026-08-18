// js/supabase-client.js
//
// Central Supabase client for LUXE.
//
// Other files should use:
//   window.LuxeAuth
//   window.LuxeProfile
//   window.LuxeOrders
//
// IMPORTANT:
// The Supabase CDN exposes `window.supabase`.
// We therefore call our initialized instance `supabaseClient`
// to avoid global name collisions.

// ---------------------------------------------------------------------
// SUPABASE CONFIG
// ---------------------------------------------------------------------

const SUPABASE_URL = "https://unvonqbgvvaygcgsrwuk.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcW5hY3htY2Jld2lmZ21ydGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDUzMjAsImV4cCI6MjEwMjYyMTMyMH0.ucHyOGcAIgtlEI14U5yv5sMVSGpn7w3YoOGc6RdIjK0";

// ---------------------------------------------------------------------
// CONFIG CHECK
// ---------------------------------------------------------------------

const isSupabaseConfigured = () => {
  return Boolean(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_ANON_KEY.includes("PASTE_YOUR"),
  );
};

// ---------------------------------------------------------------------
// CREATE CLIENT
// ---------------------------------------------------------------------

let supabaseClient = null;

if (typeof window !== "undefined") {
  if (!window.supabase) {
    console.error(
      "[LUXE] Supabase SDK was not found. Load the Supabase CDN before supabase-client.js.",
    );
  } else if (!isSupabaseConfigured()) {
    console.error("[LUXE] Supabase credentials are missing.");
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

      console.log("[LUXE] Supabase initialized successfully.");
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

  // ---------------------------------------------------------------
  // SIGN UP
  //
  // Supabase sends an EMAIL CONFIRMATION LINK.
  // No OTP entry is needed.
  // ---------------------------------------------------------------

  async signUp(email, password, fullName) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is unavailable.",
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

          // After the user clicks the confirmation link,
          // Supabase redirects them here.
          emailRedirectTo: `${window.location.origin}/Frontend/login.html`,
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

  // ---------------------------------------------------------------
  // RESEND SIGNUP CONFIRMATION LINK
  // ---------------------------------------------------------------

  async resendSignupConfirmation(email) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is unavailable.",
        },
      };
    }

    try {
      return await supabaseClient.auth.resend({
        type: "signup",
        email,

        options: {
          emailRedirectTo: `${window.location.origin}/Frontend/login.html`,
        },
      });
    } catch (error) {
      console.error("[LUXE] Resend confirmation error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to resend confirmation email.",
        },
      };
    }
  },

  // ---------------------------------------------------------------
  // PASSWORD LOGIN
  // ---------------------------------------------------------------

  async signInWithPassword(email, password) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is unavailable.",
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

  // ---------------------------------------------------------------
  // MAGIC LINK LOGIN
  //
  // This is for signing in WITHOUT password.
  // Supabase emails the user a link.
  // ---------------------------------------------------------------

  async signInWithMagicLink(email) {
    if (!supabaseClient) {
      return {
        data: null,
        error: {
          message: "Account service is unavailable.",
        },
      };
    }

    try {
      return await supabaseClient.auth.signInWithOtp({
        email,

        options: {
          shouldCreateUser: false,

          emailRedirectTo: `${window.location.origin}/Frontend/index.html`,
        },
      });
    } catch (error) {
      console.error("[LUXE] Magic link error:", error);

      return {
        data: null,
        error: {
          message: error?.message || "Unable to send sign-in link.",
        },
      };
    }
  },

  // ---------------------------------------------------------------
  // SIGN OUT
  // ---------------------------------------------------------------

  async signOut() {
    if (!supabaseClient) {
      return {
        error: {
          message: "Account service is unavailable.",
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

  // ---------------------------------------------------------------
  // CURRENT USER
  // ---------------------------------------------------------------

  async getCurrentUser() {
    if (!supabaseClient) {
      return null;
    }

    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (error) {
      console.error("[LUXE] Session lookup error:", error);
      return null;
    }

    return session?.user || null;
  },

  // ---------------------------------------------------------------
  // AUTH STATE CHANGES
  //
  // Handles:
  // - login
  // - logout
  // - confirmation link redirects
  // - magic link redirects
  // ---------------------------------------------------------------

  onAuthStateChange(callback) {
    if (!supabaseClient || typeof callback !== "function") {
      return null;
    }

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      console.log("[LUXE] Auth event:", event);

      callback(session?.user || null, event);
    });

    return data?.subscription || null;
  },
};

// ---------------------------------------------------------------------
// PROFILE
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
        console.error("[LUXE] Profile fetch failed:", error);
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
          message: "Profile service is unavailable.",
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
          message: "Order service is unavailable.",
        },
      };
    }

    if (!userId) {
      return {
        data: null,
        error: {
          message: "You must be signed in to place an order.",
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
        console.error("[LUXE] Order creation failed:", orderError);

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
        console.error("[LUXE] Order item creation failed:", itemsError);

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
      console.error("[LUXE] Unexpected order error:", error);

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
        console.error("[LUXE] Orders fetch failed:", error);
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
      console.error("[LUXE] Supabase connection failed:", error);
      return false;
    }

    console.log("[LUXE] Supabase connection is healthy.");

    return true;
  } catch (error) {
    console.error("[LUXE] Connection test failed:", error);
    return false;
  }
};

// ---------------------------------------------------------------------
// EXPOSE APP API
// ---------------------------------------------------------------------

if (typeof window !== "undefined") {
  window.LuxeAuth = LuxeAuth;
  window.LuxeProfile = LuxeProfile;
  window.LuxeOrders = LuxeOrders;

  window.isSupabaseConfigured = isSupabaseConfigured;
  window.testSupabaseConnection = testSupabaseConnection;
}
