// src/config/supabaseClient.js
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env (handled automatically)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;

// Create and export the Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);
module.exports = supabase;
