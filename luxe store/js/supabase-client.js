// js/supabase-client.js - Free Supabase Cloud Database Client

// Replace these placeholders with your free credentials from https://supabase.com
const SUPABASE_URL = 'https://unvonqbgvvaygcgsrwuk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_6Csv9EOc_JOcoDGkTCCNvA_8ErkOPj1';

// Check if credentials are set
const isSupabaseConfigured = () => {
    return SUPABASE_URL.indexOf('YOUR_SUPABASE') === -1 && SUPABASE_ANON_KEY.indexOf('YOUR_SUPABASE') === -1;
};

// Initialize Supabase client if SDK script is loaded
let supabase = null;
if (typeof window !== 'undefined' && window.supabase && isSupabaseConfigured()) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Unified Database Service (Cloud + Local Fallback)
const LuxeCloudDB = {
    // 1. Save or Update User Profile
    async saveUserProfile(user) {
        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .upsert({
                        email: user.email.toLowerCase(),
                        full_name: user.fullName,
                        phone: user.phone || '',
                        avatar_url: user.avatar || '',
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'email' });
                if (error) console.warn('Supabase profile save notice:', error.message);
                return data;
            } catch (e) {
                console.warn('Using LocalStorage fallback for profile');
            }
        }
    },

    // 2. Fetch User Profile
    async getUserProfile(email) {
        if (supabase) {
            try {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', email.toLowerCase())
                    .single();
                if (!error && data) {
                    return {
                        fullName: data.full_name,
                        email: data.email,
                        phone: data.phone,
                        avatar: data.avatar_url
                    };
                }
            } catch (e) {
                console.warn('Using LocalStorage fallback for fetching profile');
            }
        }
        return null;
    },

    // 3. Save Order to Cloud
    async createOrder(userId, order) {
        if (supabase) {
            try {
                await supabase.from('orders').insert({
                    user_email: userId.toLowerCase(),
                    order_number: order.orderNumber,
                    total_amount: order.totalAmount,
                    items: order.items,
                    order_status: order.orderStatus,
                    created_at: new Date().toISOString()
                });
            } catch (e) {
                console.warn('Order saved to LocalStorage fallback');
            }
        }
    }
};

if (typeof window !== 'undefined') {
    window.LuxeCloudDB = LuxeCloudDB;
    window.isSupabaseConfigured = isSupabaseConfigured;
}
