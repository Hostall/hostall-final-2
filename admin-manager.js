// HOSTALL Admin Management Functions
// This file contains all admin-related functionality

class AdminManager {
  constructor() {
    this.currentUser = null;
    this.isAuthenticated = false;
  }

  // Initialize admin functionality
  init() {
    this.setupEventListeners();
    this.checkAuthStatus();
  }

  // Check authentication status
  async checkAuthStatus() {
    try {
      const client = window.getSupabaseClient();
      if (!client) return false;

      const { data: { session } } = await client.auth.getSession();
      if (session) {
        this.currentUser = session.user;
        this.isAuthenticated = true;
        console.log('✅ Admin authenticated');
        return true;
      }
    } catch (error) {
      console.error('❌ Auth check failed:', error);
    }
    
    this.isAuthenticated = false;
    return false;
  }

  // Admin login
  async login(email, password) {
    try {
      const client = window.getSupabaseClient();
      if (!client) {
        throw new Error('Supabase client not available');
      }

      const { data, error } = await client.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        throw error;
      }

      this.currentUser = data.user;
      this.isAuthenticated = true;
      console.log('✅ Admin login successful');
      return { success: true, user: data.user };
    } catch (error) {
      console.error('❌ Login failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Admin logout
  async logout() {
    try {
      const client = window.getSupabaseClient();
      if (!client) return;

      await client.auth.signOut();
      this.currentUser = null;
      this.isAuthenticated = false;
      console.log('✅ Admin logged out');
    } catch (error) {
      console.error('❌ Logout failed:', error);
    }
  }

  // Add new hostel
  async addHostel(hostelData) {
    try {
      const client = window.getSupabaseClient();
      if (!client || !this.isAuthenticated) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await client
        .from('hostels')
        .insert([hostelData])
        .select();

      if (error) {
        throw error;
      }

      console.log('✅ Hostel added successfully');
      return { success: true, data: data[0] };
    } catch (error) {
      console.error('❌ Add hostel failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Update hostel
  async updateHostel(id, updates) {
    try {
      const client = window.getSupabaseClient();
      if (!client || !this.isAuthenticated) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await client
        .from('hostels')
        .update(updates)
        .eq('id', id)
        .select();

      if (error) {
        throw error;
      }

      console.log('✅ Hostel updated successfully');
      return { success: true, data: data[0] };
    } catch (error) {
      console.error('❌ Update hostel failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Delete hostel
  async deleteHostel(id) {
    try {
      const client = window.getSupabaseClient();
      if (!client || !this.isAuthenticated) {
        throw new Error('Not authenticated');
      }

      const { error } = await client
        .from('hostels')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      console.log('✅ Hostel deleted successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Delete hostel failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Implementation for admin form handlers, etc.
  }
}

// Global admin manager instance
window.adminManager = new AdminManager();