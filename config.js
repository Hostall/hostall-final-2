// HOSTALL Configuration
// Secure configuration for Supabase connection
const CONFIG = {
  supabase: {
    url: 'https://pjnqhdhlcgrrmfzscswv.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqbnFoZGhsY2dycm1menNjc3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTg3NDMsImV4cCI6MjA2NjUzNDc0M30.UVaJXabJDPMSHgDzUk3tOEv9sAFSjqSRNEYroypqyGs'
  },
  app: {
    name: 'HOSTALL',
    version: '2.0',
    debug: false
  }
};

// Initialize Supabase when config is loaded
let supabaseClient = null;

function initializeSupabase() {
  if (typeof supabase !== 'undefined' && CONFIG.supabase.url && CONFIG.supabase.key) {
    try {
      supabaseClient = supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.key);
      console.log('✅ Supabase initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Supabase initialization failed:', error);
      return false;
    }
  }
  return false;
}

// Export for use in other modules
window.CONFIG = CONFIG;
window.initializeSupabase = initializeSupabase;
window.getSupabaseClient = () => supabaseClient;