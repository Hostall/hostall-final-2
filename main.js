// HOSTALL Main Application Controller
// This file handles app initialization and basic functionality

class App {
  constructor() {
    this.currentSection = 'home';
    this.isInitialized = false;
  }

  // Initialize the application
  async init() {
    try {
      console.log('🚀 Initializing HOSTALL...');
      
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
      }

      // Initialize Supabase
      if (!window.initializeSupabase()) {
        console.warn('⚠️ Supabase initialization failed, retrying...');
        setTimeout(() => window.initializeSupabase(), 2000);
      }

      // Initialize managers
      await this.initializeManagers();

      // Setup navigation
      this.setupNavigation();

      // Setup event listeners
      this.setupEventListeners();

      // Load initial data
      await this.loadInitialData();

      this.isInitialized = true;
      console.log('✅ HOSTALL initialized successfully');
    } catch (error) {
      console.error('❌ App initialization failed:', error);
    }
  }

  // Initialize all managers
  async initializeManagers() {
    try {
      // Wait for managers to be available
      const maxRetries = 10;
      let retries = 0;
      
      while ((!window.hostelManager || !window.adminManager) && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
      }

      if (window.hostelManager) {
        await window.hostelManager.init();
        console.log('✅ Hostel manager initialized');
      }

      if (window.adminManager) {
        window.adminManager.init();
        console.log('✅ Admin manager initialized');
      }
    } catch (error) {
      console.error('❌ Manager initialization failed:', error);
    }
  }

  // Setup navigation functionality
  setupNavigation() {
    // Show initial section
    this.showSection(this.currentSection);
    
    // Setup mobile menu
    window.toggleMobileMenu = () => {
      const mobileMenu = document.querySelector('.mobile-menu');
      if (mobileMenu) {
        mobileMenu.classList.toggle('hidden');
      }
    };

    // Setup section navigation
    window.showSection = (sectionName) => {
      // Hide all sections
      document.querySelectorAll('.section').forEach(section => {
        section.classList.add('hidden');
      });

      // Show target section
      const targetSection = document.getElementById(sectionName);
      if (targetSection) {
        targetSection.classList.remove('hidden');
        this.currentSection = sectionName;
      }

      // Update navigation links
      document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${sectionName}`) {
          link.classList.add('active');
        }
      });

      // Hide mobile menu after selection
      const mobileMenu = document.querySelector('.mobile-menu');
      if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
      }
    };

    // Scroll to hostels function
    window.scrollToHostels = () => {
      const hostelsSection = document.getElementById('public-list');
      if (hostelsSection) {
        hostelsSection.scrollIntoView({ behavior: 'smooth' });
      }
    };
  }

  // Setup event listeners
  setupEventListeners() {
    // Admin login form
    const loginForm = document.getElementById('admin-login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', this.handleAdminLogin.bind(this));
    }

    // Search and filter functionality
    const searchInput = document.getElementById('search-input');
    const genderFilter = document.getElementById('gender-filter');
    const locationFilter = document.getElementById('location-filter');

    if (searchInput) {
      searchInput.addEventListener('input', this.handleSearch.bind(this));
    }

    if (genderFilter) {
      genderFilter.addEventListener('change', this.handleFilterChange.bind(this));
    }

    if (locationFilter) {
      locationFilter.addEventListener('change', this.handleFilterChange.bind(this));
    }

    // WhatsApp chat
    window.openWhatsApp = () => {
      const phoneNumber = '+923001234567';
      const message = 'Hi! I found your hostels on HOSTALL. I would like to know more about available rooms.';
      const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    };
  }

  // Handle admin login
  async handleAdminLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;

    if (!email || !password) {
      alert('Please enter both email and password');
      return;
    }

    try {
      const result = await window.adminManager.login(email, password);
      
      if (result.success) {
        // Hide login form and show dashboard
        document.getElementById('admin-login').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        
        // Update dashboard data
        this.updateDashboardStats();
      } else {
        alert('Login failed: ' + result.error);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    }
  }

  // Handle search functionality
  handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    
    if (window.hostelManager) {
      // Filter hostels based on search term
      const filteredHostels = window.hostelManager.hostels.filter(hostel => {
        return hostel.name?.toLowerCase().includes(searchTerm) ||
               hostel.location?.toLowerCase().includes(searchTerm) ||
               hostel.details?.toLowerCase().includes(searchTerm);
      });
      
      // Update display with filtered results
      this.displayFilteredHostels(filteredHostels);
    }
  }

  // Handle filter changes
  handleFilterChange() {
    const genderFilter = document.getElementById('gender-filter').value;
    const locationFilter = document.getElementById('location-filter').value;

    if (window.hostelManager) {
      // Update filters
      window.hostelManager.filters.gender = genderFilter;
      window.hostelManager.filters.location = locationFilter;
      
      // Re-render hostels
      window.hostelManager.renderHostelCards();
    }
  }

  // Display filtered hostels
  displayFilteredHostels(hostels) {
    const hostelGrid = document.getElementById('public-list');
    if (!hostelGrid) return;

    if (hostels.length === 0) {
      hostelGrid.innerHTML = `
        <div class="col-span-full text-center py-12">
          <h3 class="text-xl font-semibold text-gray-700 mb-2">No hostels found</h3>
          <p class="text-gray-500">Try adjusting your search criteria</p>
        </div>
      `;
      return;
    }

    hostelGrid.innerHTML = '';
    hostels.forEach(hostel => {
      const card = window.hostelManager.createHostelCard(hostel);
      hostelGrid.appendChild(card);
    });
  }

  // Load initial data
  async loadInitialData() {
    try {
      // Hide loading indicator after a delay
      setTimeout(() => {
        const loadingIndicator = document.getElementById('loading-hostels');
        if (loadingIndicator) {
          loadingIndicator.style.display = 'none';
        }
      }, 3000);
    } catch (error) {
      console.error('❌ Failed to load initial data:', error);
    }
  }

  // Update dashboard statistics
  async updateDashboardStats() {
    try {
      if (window.hostelManager && window.hostelManager.hostels) {
        const totalHostels = window.hostelManager.hostels.length;
        const activeListings = window.hostelManager.hostels.filter(h => h.status !== 'inactive').length;
        
        // Update dashboard display
        const dashboardElements = document.querySelectorAll('#admin-dashboard h3');
        if (dashboardElements.length >= 2) {
          dashboardElements[0].textContent = totalHostels;
          dashboardElements[1].textContent = activeListings;
        }
      }
    } catch (error) {
      console.error('❌ Failed to update dashboard stats:', error);
    }
  }
}

// Initialize app when DOM is ready
const app = new App();

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// Export for global access
window.app = app;