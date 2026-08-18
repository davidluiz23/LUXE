// js/supabase-client.js
//
// This file is the ONE place that talks to Supabase directly.
// Everything else (auth.js, checkout.js) calls the functions below
// instead of touching `supabase` directly — that way, if you ever
// swap backends, you only edit this file.

const SUPABASE_URL = "https://unvonqbgvvaygcgsrwuk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzcW5hY3htY2Jld2lmZ21ydGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDUzMjAsImV4cCI6MjEwMjYyMTMyMH0.ucHyOGcAIgtlEI14U5yv5sMVSGpn7w3YoOGc6RdIjK0";

// This "anon key" is SAFE to have visible in frontend code — it's not
// a secret. It only grants whatever access your Row Level Security
// policies allow (see schema.sql). The real gate is on the database,
// not on hiding this string.
const isSupabaseConfigured = () => {
  return (
    SUPABASE_URL.indexOf("YOUR_SUPABASE") === -1 &&
    SUPABASE_ANON_KEY.indexOf("YOUR_SUPABASE") === -1
  );
};

let supabase = null;
if (
  typeof window !== "undefined" &&
  window.supabase &&
  isSupabaseConfigured()
) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ---------------------------------------------------------------------
// AUTH
// Passwords never touch our code — signUp/signInWithPassword send them
// straight to Supabase over HTTPS, which hashes and stores them.
// ---------------------------------------------------------------------
const LuxeAuth = {
  isReady() {
    return !!supabase;
  },

  // Step 1 of signup: creates the auth.users row (unconfirmed) and
  // triggers Supabase to email a 6-digit code to the user.
  async signUp(email, password, fullName) {
    if (!supabase) return { error: { message: "Backend not configured" } };
    return await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
  },

  // Step 2: user types the code from their email, we confirm it.
  // On success, Supabase also logs them in (returns a session).
  async verifySignupOtp(email, token) {
    if (!supabase) return { error: { message: "Backend not configured" } };
    return await supabase.auth.verifyOtp({ email, token, type: "signup" });
  },

  async resendSignupOtp(email) {
    if (!supabase) return { error: { message: "Backend not configured" } };
    return await supabase.auth.resend({ type: "signup", email });
  },

  async signInWithPassword(email, password) {
    if (!supabase) return { error: { message: "Backend not configured" } };
    return await supabase.auth.signInWithPassword({ email, password });
  },

  async signInWithMagicLink(email) {
    if (!supabase) return { error: { message: "Backend not configured" } };
    return await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
  },

  async signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  // Returns the logged-in user (or null) using the session Supabase
  // already stored in the browser — no password needed to check this.
  async getCurrentUser() {
    if (!supabase) return null;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session ? session.user : null;
  },

  // Fires whenever login/logout state changes anywhere in the app.
  onAuthStateChange(callback) {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((_event, session) => {
      callback(session ? session.user : null);
    });
  },
};

// ---------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------
const LuxeProfile = {
  async get(userId) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) return null;
    return data;
  },

  async update(userId, fields) {
    if (!supabase) return { error: { message: "Backend not configured" } };
    return await supabase
      .from("profiles")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", userId);
  },
};

// ---------------------------------------------------------------------
// ORDERS (transactions)
// ---------------------------------------------------------------------
const LuxeOrders = {
  // items: [{ id, name, price, quantity, image }]
  // totals: { subtotal, shipping, tax, total }
  async createOrder(userId, items, totals, shippingAddress) {
    if (!supabase) return { error: { message: "Backend not configured" } };

    const orderNumber = "LX-" + Math.floor(100000 + Math.random() * 900000);

    const { data: order, error: orderError } = await supabase
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

    if (orderError) return { error: orderError };

    const rows = items.map((item) => ({
      order_id: order.id,
      product_id: String(item.id),
      product_name: item.name,
      price: item.price,
      quantity: item.quantity,
      image_url: item.image || "",
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(rows);
    if (itemsError) return { error: itemsError };

    return { data: order };
  },

  async getOrders(userId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data;
  },
};

if (typeof window !== "undefined") {
  window.LuxeAuth = LuxeAuth;
  window.LuxeProfile = LuxeProfile;
  window.LuxeOrders = LuxeOrders;
  window.isSupabaseConfigured = isSupabaseConfigured;
}
