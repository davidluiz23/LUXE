// js/supabase-client.js
//
// Central Supabase client for ALKEBULAN.
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
    !SUPABASE_ANON_KEY.includes("PASTE_YOUR"),
  );

function pageUrl(relativePath) {
  if (typeof window === "undefined") return relativePath;
  return new URL(relativePath, window.location.href).toString();
}

function safeAuthReturnPath(path) {
  return path === "checkout.html" ? path : "index.html";
}

function oauthCallbackUrl(returnPath) {
  const destination = safeAuthReturnPath(returnPath);
  return pageUrl(`auth-callback.html?returnTo=${encodeURIComponent(destination)}`);
}

function syncStorefrontSessionCache(user, profile = null) {
  if (typeof window === "undefined") return;

  if (!user) {
    localStorage.removeItem("luxe_user");
    localStorage.removeItem("luxe_logged_in");
    return;
  }

  localStorage.setItem(
    "luxe_user",
    JSON.stringify({
      id: user.id,
      email: user.email || "",
      fullName:
        profile?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        "",
    }),
  );
  localStorage.setItem("luxe_logged_in", "true");
}

let supabaseClient = null;

if (typeof window !== "undefined") {
  if (!window.supabase) {
    console.error(
      "[ALKEBULAN] Supabase SDK missing. Load @supabase/supabase-js before supabase-client.js.",
    );
  } else if (!isSupabaseConfigured()) {
    console.error("[ALKEBULAN] Supabase credentials are not configured.");
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
      console.log("[ALKEBULAN] Supabase client initialized.");
    } catch (error) {
      console.error("[ALKEBULAN] Supabase initialization failed:", error);
    }
  }
}

const LuxeAuth = {
  isReady() {
    return !!supabaseClient;
  },

  async requestSignupVerification(fullName, email, captchaToken = null) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.functions.invoke("signup-flow", {
        body: {
          action: "request",
          fullName,
          email,
          captchaToken,
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Signup error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to send verification email.",
        },
      };
    }
  },

  async checkSignupToken(token) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.functions.invoke("signup-flow", {
        body: {
          action: "check",
          token,
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Signup token check error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to check verification link.",
        },
      };
    }
  },

  async checkSignupCode(email, code) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.functions.invoke("signup-flow", {
        body: {
          action: "check",
          email,
          code,
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Signup code check error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to check verification code.",
        },
      };
    }
  },

  async completeSignup(token, password) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.functions.invoke("signup-flow", {
        body: {
          action: "complete",
          token,
          password,
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Signup completion error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to complete signup.",
        },
      };
    }
  },

  async completeSignupWithCode(email, code, password) {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.functions.invoke("signup-flow", {
        body: {
          action: "complete",
          email,
          code,
          password,
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Signup code completion error:", error);
      return {
        data: null,
        error: {
          message: error?.message || "Unable to complete signup.",
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
      console.error("[ALKEBULAN] Login error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to sign in." },
      };
    }
  },

  async signInWithGoogle(returnPath = "index.html") {
    if (!supabaseClient) {
      return {
        data: null,
        error: { message: "Account service is not configured." },
      };
    }

    try {
      return await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: oauthCallbackUrl(returnPath),
          queryParams: {
            prompt: "select_account",
          },
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Google sign-in error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to start Google sign-in." },
      };
    }
  },

  async signInWithMagicLink(email, returnPath = "index.html") {
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
          emailRedirectTo: pageUrl(safeAuthReturnPath(returnPath)),
        },
      });
    } catch (error) {
      console.error("[ALKEBULAN] Magic-link error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to send sign-in link." },
      };
    }
  },

  async requestPasswordReset(email, portal = "customer") {
    if (!supabaseClient) {
      return {
        error: { message: "Account service is not configured." },
      };
    }

    const normalizedPortal = portal === "admin" ? "admin" : "customer";

    const redirectTo = pageUrl(
      `reset-password.html?portal=${normalizedPortal}`,
    );

    try {
      const { data, error } = await supabaseClient.functions.invoke(
        "password-reset",
        {
          body: {
            email: String(email || "")
              .trim()
              .toLowerCase(),
            portal: normalizedPortal,
            redirectTo,
          },
        },
      );

      if (error) {
        console.error("[ALKEBULAN] Password reset gateway error:", error);
        return { error };
      }

      return {
        data: data || { ok: true },
        error: null,
      };
    } catch (error) {
      console.error("[ALKEBULAN] Password reset request error:", error);
      return {
        error: {
          message: error?.message || "Unable to request password reset.",
        },
      };
    }
  },

  // Backward-compatible customer reset alias.
  async resetPasswordForEmail(email) {
    return await this.requestPasswordReset(email, "customer");
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
      console.error("[ALKEBULAN] Password update error:", error);
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
      // A Web Push endpoint remains active after the tab closes. Revoke it
      // before signing out so a shared browser cannot receive another
      // customer's private order notifications.
      if (window.LuxePush?.isSupported()) {
        await window.LuxePush.unsubscribe().catch(() => null);
      }
      return await supabaseClient.auth.signOut();
    } catch (error) {
      console.error("[ALKEBULAN] Sign-out error:", error);
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
        console.error("[ALKEBULAN] Session error:", error);
        return null;
      }

      return session || null;
    } catch (error) {
      console.error("[ALKEBULAN] Failed to retrieve session:", error);
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

    const { data } = supabaseClient.auth.onAuthStateChange((event, session) => {
      callback(session?.user || null, event);
    });

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
        console.error("[ALKEBULAN] Failed to fetch profile:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("[ALKEBULAN] Profile fetch error:", error);
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
      console.error("[ALKEBULAN] Profile update error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to update profile." },
      };
    }
  },

  async updateCommunicationPreferences(emailUpdates, whatsappUpdates) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      return await supabaseClient.rpc("update_communication_preferences", {
        p_email_updates: !!emailUpdates,
        p_whatsapp_updates: !!whatsappUpdates,
      });
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to save preferences." } };
    }
  },
};

const LuxeCommerce = {
  async getSettings() {
    const fallback = {
      whatsappVerificationRequired: false,
      whatsappDefaultCountryCode: "234",
    };
    if (!supabaseClient) return fallback;
    try {
      const { data, error } = await supabaseClient.rpc("commerce_public_settings");
      if (error) {
        console.warn("[ALKEBULAN] Could not load commerce settings:", error.message);
        return fallback;
      }
      return { ...fallback, ...(data || {}) };
    } catch (error) {
      console.warn("[ALKEBULAN] Could not load commerce settings:", error);
      return fallback;
    }
  },
};

const LuxeMetrics = {
  async getPublic() {
    if (!supabaseClient) {
      return { data: null, error: { message: "Metrics service is not configured." } };
    }
    try {
      const { data, error } = await supabaseClient.rpc("public_store_metrics_v1");
      return { data: data || null, error };
    } catch (error) {
      return {
        data: null,
        error: { message: error?.message || "Unable to load store metrics." },
      };
    }
  },
};

// Storefront money formatting is intentionally display-only. Orders and
// quotes continue to send product IDs and let PostgreSQL calculate the
// authoritative USD totals; NGN is shown as the catalog's local-price aid.
const LuxeMoney = {
  _format(value, currency, locale, fractionDigits) {
    if (value === null || value === undefined || value === "") return "";
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "";
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(amount);
    } catch {
      const symbol = currency === "NGN" ? "₦" : "$";
      return `${symbol}${amount.toFixed(fractionDigits)}`;
    }
  },

  formatUSD(value) {
    return this._format(value, "USD", "en-US", 2);
  },

  formatNGN(value) {
    return this._format(value, "NGN", "en-NG", 0);
  },

  forProduct(product, oldPrice = false) {
    const usdValue = oldPrice
      ? product?.oldPriceUSD ?? product?.oldPrice
      : product?.priceUSD ?? product?.price;
    const ngnValue = oldPrice ? product?.oldPriceNGN : product?.priceNGN;
    const usd = this.formatUSD(usdValue);
    const ngn = this.formatNGN(ngnValue);
    return {
      usd,
      ngn,
      text: [usd, ngn].filter(Boolean).join(" / "),
    };
  },
};

const LuxeContact = {
  async submit(payload = {}) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Contact service is not configured." } };
    }
    const values = {
      name: String(payload.name || "").trim().slice(0, 120),
      email: String(payload.email || "").trim().toLowerCase().slice(0, 254),
      phone: String(payload.phone || "").trim().slice(0, 40),
      subject: String(payload.subject || "").trim().slice(0, 180),
      message: String(payload.message || "").trim().slice(0, 5000),
    };
    if (!values.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || !values.message) {
      return { data: null, error: { message: "Enter your name, a valid email address, and a message." } };
    }
    try {
      const { data, error } = await supabaseClient.rpc("submit_contact_message", {
        p_name: values.name,
        p_email: values.email,
        p_phone: values.phone || null,
        p_subject: values.subject || null,
        p_message: values.message,
      });
      return { data: data || null, error };
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to send your message." } };
    }
  },
};

const LuxeNewsletter = {
  async subscribe(email, source = "storefront") {
    if (!supabaseClient) {
      return { data: null, error: { message: "Newsletter service is not configured." } };
    }
    const normalizedEmail = String(email || "").trim().toLowerCase().slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return { data: null, error: { message: "Enter a valid email address." } };
    }
    try {
      const { data, error } = await supabaseClient.rpc("subscribe_newsletter", {
        p_email: normalizedEmail,
        p_source: String(source || "storefront").trim().slice(0, 80) || "storefront",
      });
      return { data: data || null, error };
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to subscribe right now." } };
    }
  },
};

const LuxeWhatsApp = {
  async _invoke(body) {
    if (!supabaseClient) {
      return { data: null, error: { message: "Verification service is not configured." } };
    }
    try {
      const result = await supabaseClient.functions.invoke("whatsapp-verification", { body });
      if (result.error?.context && typeof result.error.context.json === "function") {
        try {
          const detail = await result.error.context.clone().json();
          return { data: detail, error: result.error };
        } catch { /* Keep the original gateway error. */ }
      }
      return result;
    } catch (error) {
      return {
        data: null,
        error: { message: error?.message || "WhatsApp verification is unavailable." },
      };
    }
  },

  async requestCode(phone) {
    return await this._invoke({ action: "request", phone });
  },

  async verifyCode(phone, code) {
    return await this._invoke({ action: "verify", phone, code });
  },

  normalizePhone(phone, countryCode = "234") {
    let digits = String(phone || "").replace(/\D/g, "");
    const country = String(countryCode || "234").replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = country + digits.slice(1);
    return /^[1-9][0-9]{6,14}$/.test(digits) ? `+${digits}` : null;
  },
};

const LuxeOrders = {
  async createOrder(items, shippingAddress, contact, paymentProvider = "whatsapp", idempotencyKey, promoCode = null) {
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
        size: String(item.size || "").trim().slice(0, 80) || null,
        color: String(item.color || "").trim().slice(0, 80) || null,
      }));

      const invalidItem = rpcItems.some(
        (item) =>
          !Number.isInteger(item.product_id) ||
          item.product_id <= 0 ||
          !Number.isInteger(item.quantity) ||
          item.quantity <= 0 ||
          item.quantity > 99,
      );

      if (invalidItem) {
        return {
          data: null,
          error: { message: "Your cart contains invalid items." },
        };
      }

      const { data, error } = await supabaseClient.rpc("create_order_secure_v3", {
        p_items: rpcItems,
        p_shipping_address: shippingAddress || {},
        p_contact: contact || {},
        p_payment_provider: paymentProvider,
        p_idempotency_key: idempotencyKey,
        p_promo_code: promoCode || null,
      });

      if (error) {
        console.error("[ALKEBULAN] Order creation error:", error);
        return { data: null, error };
      }

      return { data, error: null };
    } catch (error) {
      console.error("[ALKEBULAN] Unexpected order creation error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to create order." },
      };
    }
  },

  async quote(items, promoCode = null) {
    if (!supabaseClient) return { data: null, error: { message: "Order service is not configured." } };
    const rpcItems = (items || []).map((item) => ({
      product_id: Number(item.product_id ?? item.id),
      quantity: Number(item.quantity),
      size: String(item.size || "").trim().slice(0, 80) || null,
      color: String(item.color || "").trim().slice(0, 80) || null,
    }));
    const invalidItem = rpcItems.some((item) =>
      !Number.isInteger(item.product_id) || item.product_id <= 0 ||
      !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99
    );
    if (invalidItem) {
      return { data: null, error: { message: "Your cart contains invalid items." } };
    }
    try {
      return await supabaseClient.rpc("order_quote_secure_v1", {
        p_items: rpcItems,
        p_promo_code: promoCode || null,
      });
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to calculate order total." } };
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
        console.error("[ALKEBULAN] Failed to load orders:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[ALKEBULAN] Orders fetch error:", error);
      return [];
    }
  },

  async getByPaymentReference(reference) {
    if (!supabaseClient || !reference) return null;
    try {
      const { data, error } = await supabaseClient
        .from("orders")
        .select("id,order_number,payment_status")
        .eq("payment_reference", reference)
        .maybeSingle();

      if (error) {
        console.error("[ALKEBULAN] Payment order lookup failed:", error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error("[ALKEBULAN] Payment order lookup error:", error);
      return null;
    }
  },

  async getAdminOrdersPage({ search = "", status = null, limit = 40, cursor = null } = {}) {
    if (!supabaseClient) {
      return {
        data: { orders: [], hasMore: false, nextCursor: null },
        error: { message: "Backend not configured." },
      };
    }

    const safeSearch = String(search || "").trim().slice(0, 120);
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 40)));
    const beforeCreatedAt = cursor?.createdAt || null;
    const beforeId = cursor?.id || null;

    try {
      const result = await supabaseClient.rpc("admin_list_orders_v3", {
        p_search: safeSearch,
        p_status: status || null,
        p_limit: safeLimit,
        p_before_created_at: beforeCreatedAt,
        p_before_id: beforeId,
      });

      if (!result.error) {
        const payload = result.data || {};
        return {
          data: {
            orders: Array.isArray(payload.orders) ? payload.orders : [],
            hasMore: payload.hasMore === true,
            nextCursor: payload.nextCursor || null,
          },
          error: null,
        };
      }

      const functionMissing = result.error.code === "PGRST202" ||
        String(result.error.message || "").includes("admin_list_orders_v3");
      if (!functionMissing) {
        return {
          data: { orders: [], hasMore: false, nextCursor: null },
          error: result.error,
        };
      }

      // Safe rollout fallback while the cursor migration reaches production.
      // Legacy RPCs are unpaged, so only use them for the first request.
      if (beforeCreatedAt || beforeId) {
        return {
          data: { orders: [], hasMore: false, nextCursor: null },
          error: null,
        };
      }
      const legacy = safeSearch
        ? await this.searchAdminOrders(safeSearch)
        : await this.getAdminOrders();
      return {
        data: {
          orders: legacy.data || [],
          hasMore: false,
          nextCursor: null,
        },
        error: legacy.error || null,
      };
    } catch (error) {
      return {
        data: { orders: [], hasMore: false, nextCursor: null },
        error: { message: error?.message || "Unable to load orders." },
      };
    }
  },

  async getAdminOrders() {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_list_orders_v2");
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error: { message: error?.message || "Unable to load orders." } };
    }
  },

  async searchAdminOrders(query) {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    const search = String(query || "").trim().slice(0, 120);
    if (!search) return await this.getAdminOrders();

    try {
      const result = await supabaseClient.rpc("admin_search_orders_v1", { p_search: search });
      if (!result.error) return { data: result.data || [], error: null };

      const functionMissing = result.error.code === "PGRST202" ||
        String(result.error.message || "").includes("admin_search_orders_v1");
      if (!functionMissing) return { data: [], error: result.error };

      // Safe deployment fallback while the migration reaches production.
      const fallback = await this.getAdminOrders();
      if (fallback.error) return fallback;
      const needle = search.toLowerCase();
      const digits = needle.replace(/\D/g, "").replace(/^0+/, "") || "0";
      const matches = (fallback.data || []).filter((order) => {
        const orderValues = [
          order.id, order.order_number, order.payment_reference,
          order.contact_name, order.contact_email, order.contact_phone,
        ];
        if (orderValues.some((value) => String(value || "").toLowerCase().includes(needle))) return true;
        return (order.order_items || []).some((item) => {
          const productId = String(item.product_id || "");
          const productRef = /^\d+$/.test(productId)
            ? `alk-${productId.padStart(4, "0")}`
            : productId.toLowerCase();
          return String(item.product_name || "").toLowerCase().includes(needle) ||
            productId.toLowerCase().includes(needle) ||
            productRef.includes(needle) ||
            (/^(alk[ -]?)?\d+$/i.test(search) && (productId.replace(/^0+/, "") || "0") === digits);
        });
      });
      return { data: matches, error: null };
    } catch (error) {
      return { data: [], error: { message: error?.message || "Unable to search orders." } };
    }
  },

  async updateAdminOrder(orderId, fields = {}) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      const expectedVersion = Number(fields.expectedVersion);
      const result = await supabaseClient.rpc("admin_update_order_v3", {
        p_order_id: orderId,
        p_status: fields.status,
        p_estimated_min_days: fields.estimatedMinDays || null,
        p_estimated_max_days: fields.estimatedMaxDays || null,
        p_waybill_url: fields.waybillUrl || null,
        p_expected_version: Number.isSafeInteger(expectedVersion) && expectedVersion >= 0
          ? expectedVersion
          : null,
      });

      // Keep a safe rollout path while the new migration reaches production.
      if (result.error && (
        result.error.code === "PGRST202" ||
        String(result.error.message || "").includes("admin_update_order_v3")
      )) {
        return await supabaseClient.rpc("admin_update_order_v2", {
          p_order_id: orderId,
          p_status: fields.status,
          p_estimated_min_days: fields.estimatedMinDays || null,
          p_estimated_max_days: fields.estimatedMaxDays || null,
          p_waybill_url: fields.waybillUrl || null,
          p_expected_updated_at: fields.expectedUpdatedAt || null,
        });
      }
      return result;
    } catch (error) {
      console.error("[ALKEBULAN] Admin order update error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to update order." },
      };
    }
  },

  async markAllAdminSeen() {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      return await supabaseClient.rpc("admin_mark_all_orders_seen");
    } catch (error) {
      console.error("[ALKEBULAN] Admin order seen-state update error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to mark orders as seen." },
      };
    }
  },

  async getAdminUnseenCount() {
    if (!supabaseClient) return { data: 0, error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_unseen_order_count");
      const count = Number(data);
      return {
        data: Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0,
        error,
      };
    } catch (error) {
      console.error("[ALKEBULAN] Admin unseen order count error:", error);
      return {
        data: 0,
        error: { message: error?.message || "Unable to count unseen orders." },
      };
    }
  },

  async sendWhatsAppNotifications(action, orderId) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    return await supabaseClient.functions.invoke("order-notifications", {
      body: { action, orderId },
    });
  },
};

const LuxeNotifications = {
  async getAll() {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient
        .from("user_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error: { message: error?.message || "Unable to load notifications." } };
    }
  },

  async markAllRead() {
    if (!supabaseClient) return { error: { message: "Backend not configured." } };
    return await supabaseClient
      .from("user_notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
  },

  async getUnreadCount() {
    if (!supabaseClient) return { data: 0, error: { message: "Backend not configured." } };
    try {
      const { count, error } = await supabaseClient
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      return { data: count || 0, error };
    } catch (error) {
      return { data: 0, error: { message: error?.message || "Unable to count notifications." } };
    }
  },
};

function decodeApplicationServerKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function applicationServerKeysMatch(subscription, expected) {
  const active = subscription?.options?.applicationServerKey;
  if (!active) return false;
  const current = new Uint8Array(active);
  if (current.length !== expected.length) return false;
  return current.every((value, index) => value === expected[index]);
}

const LuxePush = {
  isSupported() {
    return typeof window !== "undefined" && window.isSecureContext &&
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  },

  async _registration() {
    if (!this.isSupported()) throw new Error("Browser push requires HTTPS (or localhost) and a supported browser.");
    const workerUrl = new URL("sw.js", window.location.href);
    await navigator.serviceWorker.register(workerUrl.href);
    return await navigator.serviceWorker.ready;
  },

  async _invoke(body) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      return await supabaseClient.functions.invoke("push-notifications", { body });
    } catch (error) {
      return { data: null, error: { message: error?.message || "Push service is unavailable." } };
    }
  },

  async getState() {
    if (!this.isSupported()) {
      return {
        supported: false,
        subscribed: false,
        permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      };
    }
    try {
      const registration = await this._registration();
      const subscription = await registration.pushManager.getSubscription();
      return { supported: true, subscribed: !!subscription, permission: Notification.permission };
    } catch (error) {
      return { supported: true, subscribed: false, permission: Notification.permission, error };
    }
  },

  async subscribe() {
    if (!this.isSupported()) {
      return { data: null, error: { message: "Open the site over HTTPS (or localhost) to enable browser push." } };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        data: null,
        error: { message: permission === "denied" ? "Notifications are blocked in your browser settings." : "Notification permission was not granted." },
      };
    }

    const config = await this._invoke({ action: "config" });
    if (config.error || !config.data?.publicKey) {
      return { data: null, error: config.error || { message: "Push keys are not configured." } };
    }

    try {
      const registration = await this._registration();
      const applicationServerKey = decodeApplicationServerKey(config.data.publicKey);
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && !applicationServerKeysMatch(subscription, applicationServerKey)) {
        await subscription.unsubscribe();
        subscription = null;
      }
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      const saved = await this._invoke({ action: "subscribe", subscription: subscription.toJSON() });
      if (saved.error) return { data: null, error: saved.error };
      return { data: { subscribed: true }, error: null };
    } catch (error) {
      return { data: null, error: { message: error?.message || "Could not enable browser push." } };
    }
  },

  async syncExisting() {
    if (!this.isSupported() || Notification.permission !== "granted") return { data: null, error: null };
    try {
      const registration = await this._registration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return { data: null, error: null };
      return await this._invoke({ action: "subscribe", subscription: subscription.toJSON() });
    } catch (error) {
      return { data: null, error: { message: error?.message || "Could not refresh push subscription." } };
    }
  },

  async unsubscribe() {
    if (!this.isSupported()) return { data: { subscribed: false }, error: null };
    try {
      const registration = await this._registration();
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return { data: { subscribed: false }, error: null };
      const endpoint = subscription.endpoint;
      const serverResult = await this._invoke({ action: "unsubscribe", endpoint });
      await subscription.unsubscribe();
      return serverResult.error
        ? { data: { subscribed: false }, error: serverResult.error }
        : { data: { subscribed: false }, error: null };
    } catch (error) {
      return { data: null, error: { message: error?.message || "Could not disable browser push." } };
    }
  },

  async broadcastUpdate(title, message) {
    return await this._invoke({ action: "broadcast_update", title, message });
  },
};

const LuxePayments = {
  async request(action, orderId) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    return await supabaseClient.functions.invoke("payment-gateway", {
      body: { action, orderId },
    });
  },
  async initialize(orderId) { return await this.request("initialize", orderId); },
  async verify(orderId) { return await this.request("verify", orderId); },
};

const LuxeAdmins = {
  async getRole() {
    if (!supabaseClient) return null;

    try {
      const { data, error } = await supabaseClient.rpc("current_admin_role");

      if (error) {
        console.error("[ALKEBULAN] Admin role check error:", error);
        return null;
      }

      return data || null;
    } catch (error) {
      console.error("[ALKEBULAN] Admin role check error:", error);
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
      console.error("[ALKEBULAN] Admin check error:", error);
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
      console.error("[ALKEBULAN] Owner check error:", error);
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
      console.error("[ALKEBULAN] Team fetch error:", error);
      return {
        data: [],
        error: { message: error?.message || "Unable to load team." },
      };
    }
  },

  async touchPresence() {
    if (!supabaseClient) return { error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_touch_presence");
      return { data, error };
    } catch (error) {
      return { error: { message: error?.message || "Unable to update presence." } };
    }
  },

  async add(email) {
    if (!supabaseClient) {
      return {
        error: { message: "Backend not configured." },
      };
    }

    try {
      const { error } = await supabaseClient.rpc("admin_add_by_email", {
        p_email: String(email || "")
          .trim()
          .toLowerCase(),
      });

      return { error };
    } catch (error) {
      console.error("[ALKEBULAN] Add admin error:", error);
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
      console.error("[ALKEBULAN] Remove admin error:", error);
      return {
        error: {
          message: error?.message || "Unable to remove team member.",
        },
      };
    }
  },
};

const LuxePresence = {
  _storageKey: "alkebulan_presence_session_id",
  _heartbeatTimer: null,
  _listenersBound: false,

  getSessionId() {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    try {
      const stored = window.localStorage.getItem(this._storageKey);
      if (stored && uuidPattern.test(stored)) return stored;

      const sessionId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (character) =>
            (Number(character) ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(character) / 4)))).toString(16),
          );
      window.localStorage.setItem(this._storageKey, sessionId);
      return sessionId;
    } catch (_error) {
      return null;
    }
  },

  currentPath() {
    const path = String(window.location?.pathname || "/").slice(0, 160);
    return path || "/";
  },

  async touch() {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    const sessionId = this.getSessionId();
    if (!sessionId) return { data: null, error: { message: "Browser storage is unavailable." } };

    try {
      const { data, error } = await supabaseClient.rpc("touch_visitor_presence", {
        p_session_id: sessionId,
        p_current_path: this.currentPath(),
      });
      return { data, error };
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to update visitor presence." } };
    }
  },

  async getOnline(limit = 100) {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_list_online_visitors", {
        p_limit: Math.min(Math.max(Number(limit) || 100, 1), 200),
      });
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error: { message: error?.message || "Unable to load live visitors." } };
    }
  },

  start() {
    if (!supabaseClient || this._heartbeatTimer) return;
    if (/\/admin(?:\.html)?\/?$/i.test(window.location?.pathname || "")) return;

    const heartbeat = () => {
      if (document.visibilityState !== "hidden") this.touch().catch(() => null);
    };

    heartbeat();
    this._heartbeatTimer = window.setInterval(heartbeat, 45000);

    if (!this._listenersBound) {
      document.addEventListener("visibilitychange", heartbeat);
      window.addEventListener("pageshow", heartbeat);
      this._listenersBound = true;
    }
  },
};

const LuxeCustomers = {
  async getAll(search = "", limit = 100) {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_list_customers", {
        p_search: String(search || "").trim(),
        p_limit: Math.min(100, Math.max(1, Number(limit) || 100)),
      });
      return { data: data || [], error };
    } catch (error) {
      return { data: [], error: { message: error?.message || "Unable to load customers." } };
    }
  },

  async sendMessage(userId, title, message, channels) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      const result = await supabaseClient.functions.invoke("admin-messaging", {
        body: { action: "send", userId, title, message, channels },
      });
      if (result.error?.context && typeof result.error.context.json === "function") {
        try {
          return { data: await result.error.context.clone().json(), error: result.error };
        } catch { /* Return the original function error below. */ }
      }
      return result;
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to send message." } };
    }
  },

  async getDetail(userId) {
    if (!supabaseClient || !userId) return { data: null, error: { message: "Customer service is unavailable." } };
    try {
      const [detail, commerce] = await Promise.all([
        supabaseClient.rpc("admin_customer_detail", { p_user_id: userId }),
        supabaseClient.rpc("admin_customer_commerce_history", { p_user_id: userId }),
      ]);
      if (detail.error) return detail;
      if (commerce.error && commerce.error.code !== "PGRST202") return commerce;
      return {
        data: { ...(detail.data || {}), ...(commerce.data || {}) },
        error: null,
      };
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to load customer history." } };
    }
  },

  async setSuspension(userId, suspended, reason, confirmation) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      const result = await supabaseClient.functions.invoke("account-administration", {
        body: { action: "set_suspension", userId, suspended: !!suspended, reason, confirmation },
      });
      if (result.error?.context && typeof result.error.context.json === "function") {
        try {
          return { data: await result.error.context.clone().json(), error: result.error };
        } catch { /* Return the original function error below. */ }
      }
      return result;
    } catch (error) {
      return { data: null, error: { message: error?.message || "Unable to change account access." } };
    }
  },

  async getRecentActivity(limit = 30) {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_recent_activity", {
        p_limit: Math.min(100, Math.max(1, Math.trunc(Number(limit) || 30))),
      });
      return { data: Array.isArray(data) ? data : [], error };
    } catch (error) {
      console.error("[ALKEBULAN] Admin activity fetch error:", error);
      return {
        data: [],
        error: { message: error?.message || "Unable to load recent activity." },
      };
    }
  },
};

const LuxePromotions = {
  async getAll() {
    if (!supabaseClient) return { data: [], error: { message: "Backend not configured." } };
    try {
      const { data, error } = await supabaseClient.rpc("admin_list_promotions");
      return { data: Array.isArray(data) ? data : [], error };
    } catch (error) {
      console.error("[ALKEBULAN] Promotion fetch error:", error);
      return {
        data: [],
        error: { message: error?.message || "Unable to load promotions." },
      };
    }
  },

  async save(promotion = {}) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      return await supabaseClient.rpc("admin_upsert_promotion", {
        p_id: promotion.id || null,
        p_code: promotion.code,
        p_percent_off: promotion.percentOff,
        p_minimum_subtotal: promotion.minimumSubtotal || 0,
        p_max_redemptions: promotion.maxRedemptions || null,
        p_per_user_limit: promotion.perUserLimit || 1,
        p_starts_at: promotion.startsAt || null,
        p_ends_at: promotion.endsAt || null,
        p_active: promotion.active !== false,
      });
    } catch (error) {
      console.error("[ALKEBULAN] Promotion save error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to save promotion." },
      };
    }
  },

  async setActive(id, active) {
    if (!supabaseClient) return { data: null, error: { message: "Backend not configured." } };
    try {
      return await supabaseClient.rpc("admin_set_promotion_active", {
        p_id: id,
        p_active: !!active,
      });
    } catch (error) {
      console.error("[ALKEBULAN] Promotion status update error:", error);
      return {
        data: null,
        error: { message: error?.message || "Unable to update promotion status." },
      };
    }
  },
};

// ---------------------------------------------------------------------
// RESPONSIVE PRODUCT MEDIA
//
// Cloudinary keeps the uploaded master untouched. Storefront images use
// derived URLs sized for the device, with a content-aware 4:5 crop on cards.
// This prevents stretching and avoids downloading an 8K master into a 300px
// product tile. The original URL remains available on the product page.
// ---------------------------------------------------------------------

const LuxeMedia = {
  PRODUCT_ASPECT_RATIO: 4 / 5,
  PLACEHOLDER_PATH: "assets/brand/product-placeholder.svg",
  MAX_PRODUCT_BYTES: 40 * 1024 * 1024,
  MAX_PRODUCT_PIXELS: 100 * 1000 * 1000,
  RECOMMENDED_WIDTH: 1200,
  RECOMMENDED_HEIGHT: 1500,
  ALLOWED_IMAGE_TYPES: new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/heic",
    "image/heif",
  ]),
  ALLOWED_IMAGE_EXTENSIONS: new Set(["jpg", "jpeg", "png", "webp", "avif", "heic", "heif"]),
  _uploadMetadata: new Map(),
  PRESETS: {
    card: {
      widths: [240, 360, 480, 640, 800, 1000],
      width: 640,
      height: 800,
      crop: "fill",
      gravity: "auto",
      quality: "auto:good",
      sizes: "(max-width: 480px) 48vw, (max-width: 768px) 46vw, (max-width: 1200px) 31vw, 23vw",
    },
    detail: {
      widths: [480, 720, 960, 1280, 1600, 1920, 2400],
      width: 1280,
      height: 1600,
      crop: "limit",
      quality: "auto:best",
      sizes: "(max-width: 900px) 100vw, 58vw",
    },
    thumb: {
      widths: [96, 160, 240, 320, 480],
      width: 240,
      height: 300,
      crop: "fill",
      gravity: "auto",
      quality: "auto:good",
      sizes: "(max-width: 900px) 24vw, 150px",
    },
    compact: {
      widths: [80, 120, 180, 240, 320],
      width: 180,
      height: 225,
      crop: "fill",
      gravity: "auto",
      quality: "auto:eco",
      sizes: "120px",
    },
    admin: {
      widths: [160, 240, 360, 480, 640],
      width: 360,
      height: 450,
      crop: "fill",
      gravity: "auto",
      quality: "auto:good",
      sizes: "180px",
    },
  },

  escapeAttribute(value) {
    return window.LuxeUtils.escapeAttr(value);
  },

  placeholderUrl() {
    try {
      return new URL(this.PLACEHOLDER_PATH, document.baseURI).href;
    } catch {
      return this.PLACEHOLDER_PATH;
    }
  },

  rememberUpload(url, media = {}) {
    const safe = this.safeImageUrl(url);
    const publicId = String(media.publicId || media.public_id || "").trim();
    if (!safe || !publicId) return null;
    const normalized = {
      publicId,
      width: Number(media.width) || null,
      height: Number(media.height) || null,
      bytes: Number(media.bytes) || null,
      format: String(media.format || "").trim() || null,
      originalFilename: String(media.originalFilename || media.original_filename || "").trim() || null,
    };
    this._uploadMetadata.set(safe, normalized);
    return normalized;
  },

  metadataFor(url) {
    const safe = this.safeImageUrl(url);
    return safe ? this._uploadMetadata.get(safe) || null : null;
  },

  safeImageUrl(value, { allowLocalPreview = false } = {}) {
    const candidate = String(value || "").trim();
    if (!candidate) return "";
    if (allowLocalPreview && /^(blob:|data:image\/)/i.test(candidate)) return candidate;
    try {
      const url = new URL(candidate, typeof window !== "undefined" ? window.location.href : undefined);
      if (url.protocol === "https:") return url.href;
      if (
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ) return url.href;
    } catch { /* Invalid or unsafe image URL. */ }
    return "";
  },

  isCloudinaryUrl(value) {
    const safe = this.safeImageUrl(value);
    if (!safe) return false;
    try {
      const url = new URL(safe);
      return (
        (url.hostname === "res.cloudinary.com" || url.hostname.endsWith(".res.cloudinary.com")) &&
        url.pathname.includes("/image/upload/")
      );
    } catch {
      return false;
    }
  },

  publicIdFromUrl(value) {
    const safe = this.safeImageUrl(value);
    if (!safe || !this.isCloudinaryUrl(safe)) return "";
    try {
      const segments = new URL(safe).pathname.split("/").filter(Boolean);
      const uploadIndex = segments.indexOf("upload");
      const versionIndex = segments.findIndex((segment, index) => index > uploadIndex && /^v\d+$/.test(segment));
      if (uploadIndex < 0 || versionIndex < 0 || versionIndex >= segments.length - 1) return "";
      const encodedPath = segments.slice(versionIndex + 1).join("/").replace(/\.[a-z0-9]+$/i, "");
      const publicId = decodeURIComponent(encodedPath).trim();
      return publicId &&
        /^[A-Za-z0-9][A-Za-z0-9_./-]{0,254}$/.test(publicId) &&
        !/(^|\/)\.\.(\/|$)/.test(publicId)
        ? publicId
        : "";
    } catch {
      return "";
    }
  },

  cloudinaryUrl(value, options = {}) {
    const safe = this.safeImageUrl(value);
    if (!safe || !this.isCloudinaryUrl(safe)) return safe;

    const width = Math.min(8192, Math.max(16, Math.round(Number(options.width) || 640)));
    const requestedHeight = Number(options.height);
    const height = Number.isFinite(requestedHeight)
      ? Math.min(8192, Math.max(16, Math.round(requestedHeight)))
      : null;
    const crop = ["fill", "fit", "limit", "pad"].includes(options.crop) ? options.crop : "fill";
    const gravity = /^[a-z_]+$/i.test(options.gravity || "") ? options.gravity : "auto";
    const quality = /^auto(?::(?:best|good|eco|low))?$/.test(options.quality || "")
      ? options.quality
      : "auto:good";
    const transformation = [
      `c_${crop}`,
      crop === "fill" ? `g_${gravity}` : "",
      `w_${width}`,
      height && crop !== "limit" ? `h_${height}` : "",
      `q_${quality}`,
      "f_auto",
    ].filter(Boolean).join(",");

    try {
      const url = new URL(safe);
      const marker = "/image/upload/";
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex < 0) return safe;
      const before = url.pathname.slice(0, markerIndex + marker.length);
      const after = url.pathname.slice(markerIndex + marker.length);
      url.pathname = `${before}${transformation}/${after}`;
      return url.href;
    } catch {
      return safe;
    }
  },

  responsive(value, options = {}) {
    const original = this.safeImageUrl(value, { allowLocalPreview: !!options.allowLocalPreview });
    const preset = this.PRESETS[options.preset] || this.PRESETS.card;
    const config = { ...preset, ...options };
    if (!original) return { original: "", src: "", srcset: "", sizes: config.sizes || "100vw", config };
    if (!this.isCloudinaryUrl(original)) {
      return { original, src: original, srcset: "", sizes: config.sizes || "100vw", config };
    }

    const heightForWidth = (width) => config.height && config.width
      ? Math.round(width * (config.height / config.width))
      : undefined;
    const build = (width) => this.cloudinaryUrl(original, {
      width,
      height: heightForWidth(width),
      crop: config.crop,
      gravity: config.gravity,
      quality: config.quality,
    });
    const widths = [...new Set((config.widths || [config.width]).map(Number))]
      .filter((width) => Number.isFinite(width) && width > 0)
      .sort((left, right) => left - right);
    return {
      original,
      src: build(config.width),
      srcset: widths.map((width) => `${build(width)} ${width}w`).join(", "),
      sizes: config.sizes || "100vw",
      config,
    };
  },

  attributes(value, options = {}) {
    const media = this.responsive(value, options);
    const escape = (item) => this.escapeAttribute(item);
    const priority = !!options.priority;
    const displaySource = media.src || this.placeholderUrl();
    const attributes = [
      `src="${escape(displaySource)}"`,
      media.srcset ? `srcset="${escape(media.srcset)}"` : "",
      media.srcset ? `sizes="${escape(media.sizes)}"` : "",
      `alt="${escape(options.alt || "")}"`,
      `width="${Math.round(media.config.width || 640)}"`,
      `height="${Math.round(media.config.height || 800)}"`,
      `loading="${priority ? "eager" : "lazy"}"`,
      `decoding="async"`,
      priority ? `fetchpriority="high"` : `fetchpriority="auto"`,
      `data-luxe-original="${escape(media.original)}"`,
      `data-luxe-placeholder="${escape(this.placeholderUrl())}"`,
      options.className ? `class="${escape(options.className)}"` : "",
    ];
    return attributes.filter(Boolean).join(" ");
  },

  apply(image, value, options = {}) {
    if (!image) return null;
    const media = this.responsive(value, { ...options, allowLocalPreview: true });
    image.src = media.src || this.placeholderUrl();
    if (media.srcset) {
      image.srcset = media.srcset;
      image.sizes = media.sizes;
    } else {
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
    }
    image.width = Math.round(media.config.width || 640);
    image.height = Math.round(media.config.height || 800);
    image.loading = options.priority ? "eager" : "lazy";
    image.decoding = "async";
    image.fetchPriority = options.priority ? "high" : "auto";
    if (options.alt !== undefined) image.alt = String(options.alt || "");
    image.dataset.luxeOriginal = media.original;
    image.dataset.luxePlaceholder = this.placeholderUrl();
    delete image.dataset.luxeOriginalFallbackUsed;
    delete image.dataset.luxePlaceholderUsed;
    this.bindFallback(image);
    return media;
  },

  bindFallback(image) {
    if (!image || image.dataset.luxeFallbackBound === "true") return;
    image.dataset.luxeFallbackBound = "true";
    image.addEventListener("error", () => {
      const original = this.safeImageUrl(image.dataset.luxeOriginal, { allowLocalPreview: true });
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      const current = this.safeImageUrl(image.currentSrc || image.src, { allowLocalPreview: true });
      if (original && current !== original && image.dataset.luxeOriginalFallbackUsed !== "true") {
        image.dataset.luxeOriginalFallbackUsed = "true";
        image.src = original;
        return;
      }
      const placeholder = image.dataset.luxePlaceholder || this.placeholderUrl();
      if (placeholder && current !== placeholder && image.dataset.luxePlaceholderUsed !== "true") {
        image.dataset.luxePlaceholderUsed = "true";
        image.src = placeholder;
      }
    });
  },

  hydrate(root = document) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll("img[data-luxe-original]").forEach((image) => this.bindFallback(image));
  },

  async validateProductFile(file) {
    if (typeof File !== "undefined" && !(file instanceof File)) {
      return { data: null, error: { message: "Select a valid image file." } };
    }
    const extension = String(file?.name || "").split(".").pop().toLowerCase();
    const declaredType = String(file?.type || "").toLowerCase();
    const typeAllowed = this.ALLOWED_IMAGE_TYPES.has(declaredType);
    const extensionAllowed = this.ALLOWED_IMAGE_EXTENSIONS.has(extension);
    if (!file || (!typeAllowed && !(declaredType === "" && extensionAllowed))) {
      return { data: null, error: { message: "Use a JPG, PNG, WebP, AVIF, HEIC or HEIF image." } };
    }
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > this.MAX_PRODUCT_BYTES) {
      return { data: null, error: { message: "Product images must be 40 MB or smaller. Your Cloudinary plan may have a lower limit." } };
    }

    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const ascii = (start, length) => String.fromCharCode(...header.slice(start, start + length));
    const detected =
      (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff && "jpeg") ||
      (header[0] === 0x89 && ascii(1, 3) === "PNG" && "png") ||
      (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP" && "webp") ||
      (ascii(4, 4) === "ftyp" && ["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(ascii(8, 4)) && "bmff") ||
      "";
    if (!detected) {
      return { data: null, error: { message: "The selected file does not contain a supported image." } };
    }

    let width = null;
    let height = null;
    let previewUrl = "";
    try {
      previewUrl = URL.createObjectURL(file);
      const dimensions = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = previewUrl;
      });
      width = dimensions.width;
      height = dimensions.height;
    } catch {
      // Some browsers cannot preview HEIC/HEIF even though Cloudinary can ingest it.
      if (!(["image/heic", "image/heif"].includes(declaredType) || ["heic", "heif"].includes(extension))) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        return { data: null, error: { message: "This image is damaged or cannot be decoded by the browser." } };
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = "";
    }

    const pixels = width && height ? width * height : null;
    if (pixels && pixels > this.MAX_PRODUCT_PIXELS) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      return { data: null, error: { message: "This image exceeds the safe 100-megapixel upload limit." } };
    }

    return {
      data: {
        width,
        height,
        pixels,
        megapixels: pixels ? pixels / 1000000 : null,
        previewUrl,
        recommended: !!(width && height && width >= this.RECOMMENDED_WIDTH && height >= this.RECOMMENDED_HEIGHT),
        format: detected,
      },
      error: null,
    };
  },
};

const LuxeStorage = {
  BUCKET: "luxe-uploads",
  ALLOWED_IMAGE_TYPES: new Set([
    "image/jpeg", "image/png", "image/webp", "image/avif",
  ]),

  _sanitizeName(filename) {
    return String(filename || "image").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  },

  _uniquePath(folder, file) {
    const unique =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return `${folder}/${unique}-${this._sanitizeName(file.name)}`;
  },

  _validateImage(file, maxBytes = 8 * 1024 * 1024) {
    if (typeof File !== "undefined" && !(file instanceof File)) {
      return { message: "Select a valid file." };
    }
    if (!file || !this.ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { message: "Use a JPG, PNG, WebP or AVIF image." };
    }
    if (!Number.isFinite(file.size) || file.size < 1 || file.size > maxBytes) {
      return { message: `Image must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.` };
    }
    return null;
  },

  async _upload(file, path, maxBytes = 8 * 1024 * 1024) {
    if (!supabaseClient) {
      return {
        url: null,
        error: { message: "Backend not configured." },
      };
    }

    const validationError = this._validateImage(file, maxBytes);
    if (validationError) return { url: null, error: validationError };

    try {
      const { error: uploadError } = await supabaseClient.storage
        .from(this.BUCKET)
        .upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
          cacheControl: "31536000",
        });

      if (uploadError) {
        console.error("[ALKEBULAN] Upload error:", uploadError);
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
      console.error("[ALKEBULAN] Upload error:", error);
      return {
        url: null,
        error: { message: error?.message || "Upload failed." },
      };
    }
  },

  async uploadProductImage(file, validation = null) {
    if (!supabaseClient) {
      return { url: null, error: { message: "Backend not configured." } };
    }
    const inspection = validation?.data ? validation : await LuxeMedia.validateProductFile(file);
    if (inspection.error) return { url: null, error: inspection.error };

    try {
      const signed = await supabaseClient.functions.invoke("cloudinary-upload-signature", {
        body: { action: "sign_product_image" },
      });
      if (signed.error || !signed.data?.uploadUrl || !signed.data?.fields) {
        let message = signed.error?.message || "Cloudinary upload is not configured.";
        try {
          const context = await signed.error?.context?.json?.();
          if (context?.error === "cloudinary_not_configured") {
            message = "Cloudinary is not configured yet. Add its project secrets and redeploy the signing function.";
          } else if (context?.error) {
            message = String(context.error).replace(/_/g, " ");
          }
        } catch { /* Keep the safe message above. */ }
        return { url: null, error: { message } };
      }

      const formData = new FormData();
      formData.append("file", file);
      Object.entries(signed.data.fields).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      const response = await fetch(signed.data.uploadUrl, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.secure_url) {
        return {
          url: null,
          error: { message: payload?.error?.message || "Cloudinary could not upload this image." },
        };
      }
      const media = {
        publicId: payload.public_id || "",
        public_id: payload.public_id || "",
        width: Number(payload.width) || inspection.data?.width || null,
        height: Number(payload.height) || inspection.data?.height || null,
        bytes: Number(payload.bytes) || file.size,
        format: payload.format || inspection.data?.format || "",
        originalFilename: payload.original_filename || file.name,
      };
      LuxeMedia.rememberUpload(payload.secure_url, media);
      return { url: payload.secure_url, media, error: null };
    } catch (error) {
      console.error("[ALKEBULAN] Cloudinary upload error:", error);
      return {
        url: null,
        error: { message: error?.message || "Cloudinary upload failed." },
      };
    }
  },

  async uploadAvatar(file, userId) {
    return await this._upload(
      file,
      this._uniquePath(`avatars/${userId}`, file),
      5 * 1024 * 1024,
    );
  },
};

const LuxeProducts = {
  _fromRow(row) {
    const product = {
      id: Number(row.id),
      name: row.name,
      brand: row.brand,
      category: row.category,
      subcategory: row.subcategory,
      price: Number(row.price),
      priceUSD: Number(row.price),
      priceNGN:
        row.price_ngn !== null && row.price_ngn !== undefined
          ? Number(row.price_ngn)
          : null,
      oldPrice:
        row.old_price !== null && row.old_price !== undefined
          ? Number(row.old_price)
          : null,
      oldPriceUSD:
        row.old_price !== null && row.old_price !== undefined
          ? Number(row.old_price)
          : null,
      oldPriceNGN:
        row.old_price_ngn !== null && row.old_price_ngn !== undefined
          ? Number(row.old_price_ngn)
          : null,
      image: row.image,
      imagePublicId: row.image_public_id || "",
      hoverImage: row.hover_image || "",
      hoverImagePublicId: row.hover_image_public_id || "",
      rating: Number(row.rating),
      reviewCount:
        row.review_count !== null && row.review_count !== undefined
          ? Math.max(0, Number(row.review_count) || 0)
          : null,
      discount: !!row.discount,
      description: row.description || "",
      sizes: row.sizes || [],
      colors: row.colors || [],
      inStock: !!row.in_stock,
      stockQuantity: row.stock_quantity !== null && row.stock_quantity !== undefined
        ? Math.max(0, Math.trunc(Number(row.stock_quantity) || 0))
        : (row.in_stock ? 1 : 0),
      tags: row.tags || [],
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
    LuxeMedia.rememberUpload(product.image, { publicId: product.imagePublicId });
    LuxeMedia.rememberUpload(product.hoverImage, { publicId: product.hoverImagePublicId });
    return product;
  },

  _toRow(product) {
    const price = Number.parseFloat(product.price);
    const priceNGN = Number.parseFloat(product.priceNGN);
    const oldPrice =
      product.oldPrice !== undefined &&
      product.oldPrice !== null &&
      product.oldPrice !== ""
        ? Number.parseFloat(product.oldPrice)
        : null;
    const oldPriceNGN =
      product.oldPriceNGN !== undefined &&
      product.oldPriceNGN !== null &&
      product.oldPriceNGN !== ""
        ? Number.parseFloat(product.oldPriceNGN)
        : null;

    const image = String(product.image || "").trim();
    const hoverImage = String(product.hoverImage || "").trim();
    const imagePublicId = String(
      product.imagePublicId || LuxeMedia.metadataFor(image)?.publicId || "",
    ).trim();
    const hoverImagePublicId = String(
      product.hoverImagePublicId || LuxeMedia.metadataFor(hoverImage)?.publicId || "",
    ).trim();

    return {
      name: String(product.name || "Untitled Product").trim(),
      brand: String(product.brand || window.LuxeBrand?.name || "ALKEBULAN").trim(),
      category: String(product.category || "Men").trim(),
      subcategory: String(product.subcategory || "General").trim(),
      price: Number.isFinite(price) ? price : 0,
      price_ngn: Number.isFinite(priceNGN) ? priceNGN : null,
      old_price: Number.isFinite(oldPrice) ? oldPrice : null,
      old_price_ngn: Number.isFinite(oldPriceNGN) ? oldPriceNGN : null,
      image,
      image_public_id: imagePublicId || null,
      hover_image: hoverImage,
      hover_image_public_id: hoverImagePublicId || null,
      rating: Number.parseFloat(product.rating) || 5.0,
      discount: Boolean(
        (Number.isFinite(oldPrice) &&
          oldPrice > (Number.isFinite(price) ? price : 0)) ||
        (Number.isFinite(oldPriceNGN) &&
          oldPriceNGN > (Number.isFinite(priceNGN) ? priceNGN : 0)),
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
      stock_quantity: product.stockQuantity !== undefined && product.stockQuantity !== null
        ? Math.min(1000000, Math.max(0, Math.trunc(Number(product.stockQuantity) || 0)))
        : (product.inStock === false ? 0 : 1),
      in_stock: product.stockQuantity !== undefined
        ? Number(product.stockQuantity) > 0
        : (product.inStock !== undefined ? !!product.inStock : true),
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
      const [productResult, trendingResult] = await Promise.all([
        supabaseClient.from("products").select("*").order("id", { ascending: false }),
        supabaseClient.rpc("get_trending_products", { p_limit: 8, p_days: 30 }),
      ]);
      const { data, error } = productResult;

      if (error) {
        console.error("[ALKEBULAN] Failed to load products:", error);
        return { data: null, error };
      }

      const trending = new Map(
        (trendingResult.data || []).map((row) => [Number(row.product_id), Number(row.units_sold)]),
      );
      return {
        data: (data || []).map((row) => ({
          ...this._fromRow(row),
          trending: trending.has(Number(row.id)),
          unitsSold: trending.get(Number(row.id)) || 0,
        })),
        error: null,
      };
    } catch (error) {
      console.error("[ALKEBULAN] Products fetch error:", error);
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
        console.error("[ALKEBULAN] Failed to add product:", error);
        return { data: null, error };
      }

      return { data: this._fromRow(data), error: null };
    } catch (error) {
      console.error("[ALKEBULAN] Product create error:", error);
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
        console.error("[ALKEBULAN] Failed to update product:", error);
        return { data: null, error };
      }

      return { data: this._fromRow(data), error: null };
    } catch (error) {
      console.error("[ALKEBULAN] Product update error:", error);
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
      console.error("[ALKEBULAN] Product delete error:", error);
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
      const { data: existing, error: existingError } = await supabaseClient
        .from("products")
        .select("id");

      if (existingError) {
        return { error: existingError, imported: 0 };
      }

      const existingIds = new Set(
        (existing || []).map((row) => Number(row.id)),
      );

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

      if (error) {
        return { error, imported: 0 };
      }

      const { error: syncError } = await supabaseClient.rpc(
        "sync_products_id_sequence",
      );

      if (syncError) {
        console.error("[ALKEBULAN] Product sequence sync failed:", syncError);
        return {
          error: syncError,
          imported: rows.length,
        };
      }

      return { error: null, imported: rows.length };
    } catch (error) {
      console.error("[ALKEBULAN] Catalog import error:", error);
      return {
        error: {
          message: error?.message || "Unable to import starter catalog.",
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
        console.error("[ALKEBULAN] Failed to load site update:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("[ALKEBULAN] Site update fetch error:", error);
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
      console.error("[ALKEBULAN] Site updates fetch error:", error);
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
      return await supabaseClient.from("site_updates").insert({
        title: String(title || "").trim(),
        message: String(message || "").trim(),
      });
    } catch (error) {
      console.error("[ALKEBULAN] Site update create error:", error);
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
      return await supabaseClient.from("site_updates").delete().eq("id", id);
    } catch (error) {
      console.error("[ALKEBULAN] Site update delete error:", error);
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
      console.error("[ALKEBULAN] Supabase connection test failed:", error);
      return false;
    }

    console.log("[ALKEBULAN] Supabase connection looks healthy.");
    return true;
  } catch (error) {
    console.error("[ALKEBULAN] Supabase connection test failed:", error);
    return false;
  }
};

// ---------------------------------------------------------------------
// STOREFRONT UI INTEGRATION
//
// - Adds an Admin link only for authenticated owner/admin accounts.
// - Makes direct product-card images fill the fixed image area without
//   distortion. This changes DISPLAY only; Storage keeps original bytes.
// ---------------------------------------------------------------------

function ensureProductCardImageFit() {
  if (typeof document === "undefined") return;

  if (document.getElementById("luxe-product-card-image-fit")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "luxe-product-card-image-fit";
  style.textContent = `
    .product-image > img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
    }
  `;

  document.head.appendChild(style);
}

function removeInjectedAdminNavLinks() {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll('[data-luxe-admin-nav="true"]')
    .forEach((element) => element.remove());
}

function addAdminLinkToList(listElement) {
  if (!listElement) return;

  const alreadyHasAdminLink = Array.from(
    listElement.querySelectorAll("a"),
  ).some((anchor) => {
    const href = anchor.getAttribute("href") || "";
    return href === "admin.html" || href.endsWith("/admin.html");
  });

  if (alreadyHasAdminLink) return;

  const item = document.createElement("li");
  item.dataset.luxeAdminNav = "true";

  const link = document.createElement("a");
  link.href = "admin.html";
  if (listElement.closest(".mobile-menu") && document.documentElement.classList.contains("alkebulan-site")) {
    const label = document.createElement("span");
    label.textContent = "Admin";
    link.append(label);
  } else {
    link.textContent = "Admin";
  }
  link.setAttribute("aria-label", "Open ALKEBULAN Admin Console");

  item.appendChild(link);
  listElement.appendChild(item);
}

async function syncAdminNavigation() {
  return await syncStorefrontNavigation();
}

function safeNavigationImage(value) {
  return LuxeMedia.safeImageUrl(value);
}

function createSafeNavigationIcon(name, className) {
  if (typeof document === "undefined" || typeof DOMParser === "undefined") return null;

  const svgNamespace = "http://www.w3.org/2000/svg";
  const allowedAttributes = {
    svg: new Set([
      "class", "viewBox", "fill", "stroke", "stroke-width",
      "stroke-linecap", "stroke-linejoin", "aria-hidden", "focusable",
    ]),
    path: new Set(["d"]),
    circle: new Set(["cx", "cy", "r"]),
    rect: new Set(["x", "y", "width", "height", "rx", "ry"]),
    ellipse: new Set(["cx", "cy", "rx", "ry"]),
    line: new Set(["x1", "y1", "x2", "y2"]),
    polyline: new Set(["points"]),
    polygon: new Set(["points"]),
    g: new Set(),
  };
  const numericValue = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
  const numericList = /^[-+\d.eE,\s]+$/;
  const pathData = /^[MmZzLlHhVvCcSsQqTtAa\d.eE,+\-\s]+$/;

  const isSafeAttributeValue = (attributeName, value) => {
    if (!value || value.length > 2_000 || /[<>\u0000-\u001F]/.test(value)) return false;
    if (attributeName === "class") {
      return value.split(/\s+/).every((token) => /^[A-Za-z_][\w-]*$/.test(token));
    }
    if (attributeName === "viewBox" || attributeName === "points") return numericList.test(value);
    if (attributeName === "d") return pathData.test(value);
    if (attributeName === "fill") return value === "none" || value === "currentColor";
    if (attributeName === "stroke") return value === "none" || value === "currentColor";
    if (attributeName === "stroke-linecap" || attributeName === "stroke-linejoin") {
      return ["butt", "round", "square", "miter", "bevel"].includes(value);
    }
    if (attributeName === "aria-hidden") return value === "true";
    if (attributeName === "focusable") return value === "false";
    return numericValue.test(value);
  };

  try {
    const markup = window.LuxeIcons?.svg(name, className);
    if (typeof markup !== "string" || !markup || markup.length > 10_000) return null;

    const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    if (parsed.querySelector("parsererror")) return null;

    // Parsed markup is never inserted. Rebuild only the small SVG subset used
    // by the internal icon API so future icon sources cannot add executable DOM.
    let nodeCount = 0;
    const rebuild = (source) => {
      const elementName = source.localName;
      nodeCount += 1;
      if (
        !Object.prototype.hasOwnProperty.call(allowedAttributes, elementName) ||
        nodeCount > 32 ||
        source.prefix
      ) {
        return null;
      }
      const elementAttributes = allowedAttributes[elementName];

      const target = document.createElementNS(svgNamespace, elementName);
      for (const attribute of Array.from(source.attributes)) {
        if (
          attribute.prefix ||
          !elementAttributes.has(attribute.name) ||
          !isSafeAttributeValue(attribute.name, attribute.value)
        ) {
          return null;
        }
        target.setAttribute(attribute.name, attribute.value);
      }

      for (const child of Array.from(source.children)) {
        const safeChild = rebuild(child);
        if (!safeChild) return null;
        target.appendChild(safeChild);
      }
      return target;
    };

    const icon = rebuild(parsed.documentElement);
    return icon?.localName === "svg" ? icon : null;
  } catch (error) {
    console.warn("[ALKEBULAN] Navigation icon could not be rendered safely:", error);
    return null;
  }
}

function renderAccountControls(user, profile) {
  document.querySelectorAll('.user-icon:not([href="index.html"])').forEach((anchor) => {
    anchor.replaceChildren();
    if (!user) {
      anchor.href = "login.html";
      anchor.title = "Sign in";
      anchor.setAttribute("aria-label", "Sign in to your ALKEBULAN account");
      const icon = createSafeNavigationIcon("user", "nav-svg-icon");
      if (icon) anchor.appendChild(icon);
      return;
    }

    anchor.href = "dashboard.html";
    const name = profile?.full_name || user.user_metadata?.full_name || user.email || "Member";
    anchor.title = name;
    anchor.setAttribute("aria-label", `Open ${name}'s account`);
    const avatarUrl = safeNavigationImage(profile?.avatar_url);
    if (avatarUrl) {
      const image = document.createElement("img");
      image.className = "nav-user-avatar";
      image.src = avatarUrl;
      image.alt = "";
      anchor.appendChild(image);
      return;
    }

    const initial = document.createElement("span");
    initial.className = "nav-user-initial";
    initial.textContent = String(name).trim().charAt(0).toUpperCase() || "M";
    anchor.appendChild(initial);
  });
}

function ensureNavbarNotificationControls() {
  document.querySelectorAll(".nav-icons").forEach((container) => {
    if (container.querySelector(".notification-icon")) return;
    const link = document.createElement("a");
    link.className = "notification-icon";
    link.href = "dashboard.html?tab=notifications";
    link.title = "Notifications";
    link.setAttribute("aria-label", "Open notifications");
    link.hidden = true;
    const icon = createSafeNavigationIcon("bell", "nav-svg-icon");
    if (icon) link.appendChild(icon);
    const badge = document.createElement("span");
    badge.className = "navbar-notification-badge";
    badge.hidden = true;
    badge.textContent = "0";
    link.appendChild(badge);
    container.insertBefore(link, container.querySelector(".user-icon, .hamburger"));
  });
}

function updateNavbarNotificationBadge(count, signedIn = true) {
  const safeCount = Math.max(0, Number(count) || 0);
  document.querySelectorAll(".notification-icon").forEach((link) => {
    link.hidden = !signedIn;
    const badge = link.querySelector(".navbar-notification-badge");
    if (!badge) return;
    badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
    badge.hidden = safeCount < 1;
  });
}

async function syncStorefrontNavigation() {
  if (typeof document === "undefined") return;
  ensureNavbarNotificationControls();
  removeInjectedAdminNavLinks();

  if (!supabaseClient) {
    renderAccountControls(null, null);
    updateNavbarNotificationBadge(0, false);
    return;
  }

  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    const user = session?.user || null;
    if (sessionError || !user) {
      syncStorefrontSessionCache(null);
      renderAccountControls(null, null);
      updateNavbarNotificationBadge(0, false);
      return;
    }

    const [profileResult, notificationResult, roleResult] = await Promise.all([
      supabaseClient.from("profiles").select("full_name,avatar_url").eq("id", user.id).maybeSingle(),
      LuxeNotifications.getUnreadCount(),
      supabaseClient.rpc("current_admin_role"),
    ]);

    syncStorefrontSessionCache(user, profileResult.data || null);
    renderAccountControls(user, profileResult.data || null);
    updateNavbarNotificationBadge(notificationResult.data, true);
    if (!roleResult.error && ["owner", "admin"].includes(roleResult.data)) {
      addAdminLinkToList(document.querySelector(".nav-links ul"));
      addAdminLinkToList(document.querySelector(".mobile-menu ul"));
    }
  } catch (error) {
    console.warn("[ALKEBULAN] Could not refresh navigation:", error);
  }
}

function initializeStorefrontUiIntegration() {
  ensureProductCardImageFit();

  const refresh = () => {
    syncStorefrontNavigation();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    refresh();
  }

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(() => {
      // Do not make another Supabase call synchronously from inside
      // the auth callback. Queue it for the next turn instead.
      setTimeout(refresh, 0);
    });
  }
}

if (typeof window !== "undefined") {
  window.LuxeAuth = LuxeAuth;
  window.LuxeProfile = LuxeProfile;
  window.LuxeCommerce = LuxeCommerce;
  window.LuxeMetrics = LuxeMetrics;
  window.LuxeMoney = LuxeMoney;
  window.LuxeContact = LuxeContact;
  window.LuxeNewsletter = LuxeNewsletter;
  window.LuxeWhatsApp = LuxeWhatsApp;
  window.LuxeOrders = LuxeOrders;
  window.LuxeNotifications = LuxeNotifications;
  window.LuxePush = LuxePush;
  window.LuxePayments = LuxePayments;
  window.LuxeAdmins = LuxeAdmins;
  window.LuxePresence = LuxePresence;
  window.LuxeCustomers = LuxeCustomers;
  window.LuxePromotions = LuxePromotions;
  window.LuxeMedia = LuxeMedia;
  window.LuxeStorage = LuxeStorage;
  window.LuxeProducts = LuxeProducts;
  window.LuxeUpdates = LuxeUpdates;

  window.isSupabaseConfigured = isSupabaseConfigured;
  window.testSupabaseConnection = testSupabaseConnection;
  window.syncAdminNavigation = syncAdminNavigation;
  window.syncStorefrontNavigation = syncStorefrontNavigation;
  window.updateNavbarNotificationBadge = updateNavbarNotificationBadge;

  initializeStorefrontUiIntegration();
  LuxePresence.start();
}
