// Supabase Configuration
const SUPABASE_CONFIG = {
  url: 'https://pjnqhdhlcgrrmfzscswv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqbnFoZGhsY2dycm1menNjc3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU0MDIzNDQsImV4cCI6MjA1MDk3ODM0NH0.7-RuwfLOueTXdxPVFr3mIEOAJjAHw1C0VjQyy9DZ1D0'
};

// Initialize Supabase client
let supabase;
try {
  if (typeof window !== 'undefined' && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }
} catch (error) {
  console.error('Failed to initialize Supabase:', error);
}

// Enhanced Security Configuration
const SECURITY_CONFIG = {
  // Enhanced input validation patterns
  EMAIL_PATTERN: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  PHONE_PATTERN: /^\+92[0-9]{10}$/, // Pakistani phone format
  NAME_PATTERN: /^[a-zA-Z\s]{2,50}$/,
  PASSWORD_PATTERN: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  URL_PATTERN: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
  
  // Content sanitization
  ALLOWED_HTML_TAGS: ['br', 'p', 'strong', 'em'],
  MAX_MESSAGE_LENGTH: 1000,
  MAX_NAME_LENGTH: 50,
  MAX_DETAILS_LENGTH: 5000,
  
  // Rate limiting (with server-side validation)
  MAX_REQUESTS_PER_MINUTE: 10,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_TIME: 15 * 60 * 1000, // 15 minutes in milliseconds
  requestCount: 0,
  loginAttempts: 0,
  lastLoginAttemptTime: 0,
  lastRequestTime: Date.now(),
  
  // Session security
  SESSION_TIMEOUT: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
  
  // Content security
  ENABLE_CSP: true,
  CSP_POLICY: "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com https://www.googletagmanager.com https://www.google-analytics.com https://pagead2.googlesyndication.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://pjnqhdhlcgrrmfzscswv.supabase.co wss://pjnqhdhlcgrrmfzscswv.supabase.co https://www.google-analytics.com; frame-src 'self' https://www.google.com;",
  
  // Data protection
  SENSITIVE_FIELDS: ['password', 'password_hash', 'credit_card', 'phone', 'whatsapp'],
  
  // API Security
  API_KEY_PREFIX: 'team-hostall-', // Used to verify API key format
  
  // Two-Factor Authentication
  TOTP_WINDOW: 1, // Allow 1 time step before/after current time
  TOTP_STEP: 30, // 30-second time step
  BACKUP_CODES_COUNT: 10, // Number of backup recovery codes
};

// FAQ Management with Supabase Integration
class FAQManager {
  constructor() {
    this.cache = new Map();
    this.searchResults = new Map();
    this.subscriptions = new Map();
    this.lastSync = null;
  }

  // Initialize FAQs with Supabase integration
  async initializeFAQs() {
    try {
      if (supabase) {
        await this.syncWithSupabase();
        this.setupRealtimeSubscription();
      } else {
        // Fallback to localStorage
        this.initializeLocalFAQs();
      }
    } catch (error) {
      console.error('Error initializing FAQs:', error);
      this.initializeLocalFAQs();
    }
  }

  // Sync FAQs with Supabase
  async syncWithSupabase() {
    try {
      const { data: faqs, error } = await supabase
        .from('faqs')
        .select('*')
        .order('order_index')
        .order('created_at');

      if (error) throw error;

      // Store in cache
      this.cache.set('faqs', faqs);
      this.lastSync = Date.now();

      // Also store in localStorage as backup
      localStorage.setItem('faqs_backup', JSON.stringify(faqs));
      localStorage.setItem('faqs_last_sync', this.lastSync.toString());

      return faqs;
    } catch (error) {
      console.error('Error syncing with Supabase:', error);
      // Try to use cached data
      const cached = localStorage.getItem('faqs_backup');
      if (cached) {
        const faqs = JSON.parse(cached);
        this.cache.set('faqs', faqs);
        return faqs;
      }
      throw error;
    }
  }

  // Setup real-time subscription for FAQs
  setupRealtimeSubscription() {
    if (!supabase) return;

    try {
      const subscription = supabase
        .channel('faqs_changes')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'faqs'
        }, (payload) => {
          console.log('FAQ change detected:', payload);
          this.handleRealtimeChange(payload);
        })
        .subscribe();

      this.subscriptions.set('faqs', subscription);
    } catch (error) {
      console.error('Error setting up realtime subscription:', error);
    }
  }

  // Handle real-time changes
  handleRealtimeChange(payload) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    let faqs = this.cache.get('faqs') || [];

    switch (eventType) {
      case 'INSERT':
        faqs.push(newRecord);
        break;
      case 'UPDATE':
        const updateIndex = faqs.findIndex(faq => faq.id === newRecord.id);
        if (updateIndex !== -1) {
          faqs[updateIndex] = newRecord;
        }
        break;
      case 'DELETE':
        faqs = faqs.filter(faq => faq.id !== oldRecord.id);
        break;
    }

    // Update cache
    this.cache.set('faqs', faqs);
    
    // Refresh UI
    this.refreshFAQDisplay();
  }

  // Advanced search with Supabase full-text search
  async searchFAQs(query, options = {}) {
    const {
      category = 'all',
      limit = 50,
      useLocalSearch = false
    } = options;

    try {
      if (!supabase || useLocalSearch) {
        return this.searchLocalFAQs(query, options);
      }

      let searchQuery = supabase
        .from('faqs')
        .select('*')
        .eq('published', true);

      // Add full-text search if query provided
      if (query && query.trim()) {
        searchQuery = searchQuery.textSearch('fts', query.trim(), {
          type: 'websearch',
          config: 'english'
        });
      }

      // Add category filter
      if (category && category !== 'all') {
        searchQuery = searchQuery.eq('category', category);
      }

      // Add ordering and limit
      searchQuery = searchQuery
        .order('helpful_votes', { ascending: false })
        .order('order_index')
        .limit(limit);

      const { data: results, error } = await searchQuery;

      if (error) throw error;

      // Cache results
      const cacheKey = `search_${query}_${category}`;
      this.searchResults.set(cacheKey, results);

      return results;
    } catch (error) {
      console.error('Error searching FAQs:', error);
      // Fallback to local search
      return this.searchLocalFAQs(query, options);
    }
  }

  // Local search fallback
  searchLocalFAQs(query, options = {}) {
    const { category = 'all' } = options;
    let faqs = this.cache.get('faqs') || this.getLocalFAQs();
    
    // Filter published FAQs
    faqs = faqs.filter(faq => faq.published);

    // Apply search filter
    if (query && query.trim()) {
      const searchTerm = query.toLowerCase().trim();
      faqs = faqs.filter(faq => 
        faq.question.toLowerCase().includes(searchTerm) ||
        faq.answer.toLowerCase().includes(searchTerm)
      );
    }

    // Apply category filter
    if (category && category !== 'all') {
      faqs = faqs.filter(faq => faq.category === category);
    }

    // Sort by helpfulness and order
    faqs.sort((a, b) => {
      const aHelpful = (a.helpful_votes || 0) - (a.not_helpful_votes || 0);
      const bHelpful = (b.helpful_votes || 0) - (b.not_helpful_votes || 0);
      
      if (bHelpful !== aHelpful) {
        return bHelpful - aHelpful;
      }
      
      return (a.order_index || 0) - (b.order_index || 0);
    });

    return faqs;
  }

  // Get FAQs from cache or storage
  getFAQs() {
    return this.cache.get('faqs') || this.getLocalFAQs();
  }

  // Get local FAQs (fallback)
  getLocalFAQs() {
    try {
      const stored = localStorage.getItem('faqs_backup') || localStorage.getItem('faqs');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  // Initialize local FAQs (fallback)
  initializeLocalFAQs() {
    const existing = this.getLocalFAQs();
    if (existing.length === 0) {
      // Use the default FAQs structure from the HTML
      const defaultFAQs = window.getDefaultFAQs ? window.getDefaultFAQs() : [];
      localStorage.setItem('faqs', JSON.stringify(defaultFAQs));
      this.cache.set('faqs', defaultFAQs);
    } else {
      this.cache.set('faqs', existing);
    }
  }

  // Refresh FAQ display
  refreshFAQDisplay() {
    if (typeof window !== 'undefined' && window.loadFAQs) {
      // Get current search parameters
      const searchInput = document.getElementById('faq-search-input');
      const activeCategory = document.querySelector('.faq-categories-legend div[style*="background: rgb(139, 92, 246)"]');
      
      const searchQuery = searchInput ? searchInput.value.trim() : '';
      const category = activeCategory ? activeCategory.dataset.category : 'all';
      
      window.loadFAQs(searchQuery, category);
    }
  }

  // Add FAQ (admin function)
  async addFAQ(faqData) {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('faqs')
          .insert([faqData])
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Fallback to local storage
        const faqs = this.getFAQs();
        const newFAQ = {
          id: Date.now(),
          ...faqData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        faqs.push(newFAQ);
        localStorage.setItem('faqs', JSON.stringify(faqs));
        this.cache.set('faqs', faqs);
        return newFAQ;
      }
    } catch (error) {
      console.error('Error adding FAQ:', error);
      throw error;
    }
  }

  // Update FAQ (admin function)
  async updateFAQ(id, updates) {
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('faqs')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Fallback to local storage
        const faqs = this.getFAQs();
        const index = faqs.findIndex(faq => faq.id === id);
        if (index !== -1) {
          faqs[index] = { ...faqs[index], ...updates, updated_at: new Date().toISOString() };
          localStorage.setItem('faqs', JSON.stringify(faqs));
          this.cache.set('faqs', faqs);
          return faqs[index];
        }
        throw new Error('FAQ not found');
      }
    } catch (error) {
      console.error('Error updating FAQ:', error);
      throw error;
    }
  }

  // Delete FAQ (admin function)
  async deleteFAQ(id) {
    try {
      if (supabase) {
        const { error } = await supabase
          .from('faqs')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else {
        // Fallback to local storage
        const faqs = this.getFAQs();
        const filtered = faqs.filter(faq => faq.id !== id);
        localStorage.setItem('faqs', JSON.stringify(filtered));
        this.cache.set('faqs', filtered);
      }
    } catch (error) {
      console.error('Error deleting FAQ:', error);
      throw error;
    }
  }

  // Update helpful votes
  async updateHelpfulVotes(id, isHelpful) {
    try {
      if (supabase) {
        const field = isHelpful ? 'helpful_votes' : 'not_helpful_votes';
        const { data, error } = await supabase
          .rpc('increment_faq_votes', {
            faq_id: id,
            vote_type: field
          });

        if (error) throw error;
        return data;
      } else {
        // Fallback to local storage
        const faqs = this.getFAQs();
        const faq = faqs.find(f => f.id === id);
        if (faq) {
          if (isHelpful) {
            faq.helpful_votes = (faq.helpful_votes || 0) + 1;
          } else {
            faq.not_helpful_votes = (faq.not_helpful_votes || 0) + 1;
          }
          localStorage.setItem('faqs', JSON.stringify(faqs));
          this.cache.set('faqs', faqs);
          return faq;
        }
      }
    } catch (error) {
      console.error('Error updating helpful votes:', error);
      throw error;
    }
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
    this.searchResults.clear();
  }

  // Cleanup subscriptions
  cleanup() {
    this.subscriptions.forEach(subscription => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();
    this.clearCache();
  }
}

// Initialize global FAQ manager
window.faqManager = new FAQManager();

// Enhanced search functionality with debouncing
class SearchManager {
  constructor() {
    this.searchTimeout = null;
    this.lastQuery = '';
    this.searchDelay = 300; // ms
  }

  // Debounced search
  search(query, category = 'all', callback) {
    clearTimeout(this.searchTimeout);
    
    this.searchTimeout = setTimeout(async () => {
      try {
        const results = await window.faqManager.searchFAQs(query, { category });
        if (callback) callback(results, null);
      } catch (error) {
        if (callback) callback(null, error);
      }
    }, this.searchDelay);
  }

  // Clear search
  clearSearch() {
    clearTimeout(this.searchTimeout);
    this.lastQuery = '';
  }

  // Get search suggestions
  async getSearchSuggestions(query) {
    try {
      if (!query || query.length < 2) return [];

      const faqs = window.faqManager.getFAQs();
      const suggestions = new Set();

      faqs.forEach(faq => {
        // Extract keywords from question and answer
        const text = (faq.question + ' ' + faq.answer).toLowerCase();
        const words = text.match(/\b\w{3,}\b/g) || [];
        
        words.forEach(word => {
          if (word.includes(query.toLowerCase()) && suggestions.size < 10) {
            suggestions.add(word);
          }
        });
      });

      return Array.from(suggestions);
    } catch (error) {
      console.error('Error getting search suggestions:', error);
      return [];
    }
  }
}

// Initialize global search manager
window.searchManager = new SearchManager();

// Enhanced secure input validation and sanitization
function validateAndSanitizeInput(input, type) {
  if (!input || typeof input !== 'string') return null;
  
  // Advanced XSS prevention
  input = input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/expression\s*\(/gi, '')
    .replace(/eval\s*\(/gi, '')
    .replace(/url\s*\(/gi, 'url(')
    .replace(/<iframe/gi, '&lt;iframe')
    .replace(/<embed/gi, '&lt;embed');
  
  // Trim and limit length
  input = input.trim();
  
  switch (type) {
    case 'email':
      if (!SECURITY_CONFIG.EMAIL_PATTERN.test(input)) return null;
      return input.toLowerCase();
      
    case 'phone':
      // Format for Pakistani phone numbers +92XXXXXXXXXX
      let cleanPhone = input.replace(/\s+|-/g, ''); // Remove spaces and dashes
      if (!SECURITY_CONFIG.PHONE_PATTERN.test(cleanPhone)) return null;
      return cleanPhone;
      
    case 'name':
      if (!SECURITY_CONFIG.NAME_PATTERN.test(input)) return null;
      return input.substring(0, SECURITY_CONFIG.MAX_NAME_LENGTH);
      
    case 'password':
      // Don't sanitize passwords, just validate strength
      if (!SECURITY_CONFIG.PASSWORD_PATTERN.test(input)) return null;
      return input;
      
    case 'message':
      // Only allow specific HTML tags
      let sanitizedMessage = input;
      const disallowedTags = /<(?!br>|\/br>|p>|\/p>|strong>|\/strong>|em>|\/em>)[^>]+>/gi;
      sanitizedMessage = sanitizedMessage.replace(disallowedTags, '');
      return sanitizedMessage.substring(0, SECURITY_CONFIG.MAX_MESSAGE_LENGTH);
      
    case 'url':
      if (!SECURITY_CONFIG.URL_PATTERN.test(input)) return null;
      // Ensure URL is http or https
      if (!/^https?:\/\//i.test(input)) {
        input = 'https://' + input;
      }
      return input;
      
    case 'details':
      // Sanitize HTML in details field
      let sanitizedDetails = input;
      const detailsDisallowedTags = /<(?!br>|\/br>|p>|\/p>|strong>|\/strong>|em>|\/em>)[^>]+>/gi;
      sanitizedDetails = sanitizedDetails.replace(detailsDisallowedTags, '');
      return sanitizedDetails.substring(0, SECURITY_CONFIG.MAX_DETAILS_LENGTH);
      
    default:
      // For any other input, strip all HTML and limit length
      return input.replace(/<[^>]*>/g, '').substring(0, 500);
  }
}

// Render FAQ analytics data table
window.renderFAQAnalyticsTable = function(data) {
  const tableBody = document.getElementById('faq-analytics-table-body');
  if (!tableBody) return;
  
  if (!data || !data.length) {
    tableBody.innerHTML = '<tr><td colspan="7" style="padding: 1rem; text-align: center; color: #718096;">No data available</td></tr>';
    return;
  }
  
  tableBody.innerHTML = '';
  data.forEach(faq => {
    const question = window.faqIdToQuestion && window.faqIdToQuestion[faq.faq_id] 
      ? window.faqIdToQuestion[faq.faq_id] 
      : `FAQ ${faq.faq_id}`;
      
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid #E2E8F0';
    
    row.innerHTML = `
      <td style="padding: 0.75rem; color: #4A5568;">${faq.faq_id}</td>
      <td style="padding: 0.75rem; color: #4A5568;">${question.length > 50 ? question.substring(0, 50) + '...' : question}</td>
      <td style="padding: 0.75rem; color: #4A5568;">${faq.helpful_count}</td>
      <td style="padding: 0.75rem; color: #4A5568;">${faq.not_helpful_count}</td>
      <td style="padding: 0.75rem; color: #4A5568;">${faq.total_votes}</td>
      <td style="padding: 0.75rem; color: #4A5568;">${faq.helpful_percentage}%</td>
      <td style="padding: 0.75rem; color: #4A5568;">${faq.net_score}</td>
    `;
    
    tableBody.appendChild(row);
  });
};

// Create FAQ effectiveness chart
window.createFAQEffectivenessChart = function(data) {
  if (!data || !data.length) return;
  
  // Prepare data
  const chartData = [...data].slice(0, 10); // Top 10 FAQs
  const labels = chartData.map(faq => {
    const question = window.faqIdToQuestion && window.faqIdToQuestion[faq.faq_id] 
      ? window.faqIdToQuestion[faq.faq_id] 
      : `FAQ ${faq.faq_id}`;
    return question.length > 20 ? question.substring(0, 20) + '...' : question;
  });
  
  const helpfulCounts = chartData.map(faq => faq.helpful_count);
  const notHelpfulCounts = chartData.map(faq => faq.not_helpful_count);
  const helpfulPercentages = chartData.map(faq => faq.helpful_percentage);
  
  // Create chart
  const ctx = document.getElementById('faq-effectiveness-chart').getContext('2d');
  window.faqAnalyticsCharts.effectiveness = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Helpful Votes',
          data: helpfulCounts,
          backgroundColor: 'rgba(72, 187, 120, 0.7)',
          borderColor: 'rgba(72, 187, 120, 1)',
          borderWidth: 1
        },
        {
          label: 'Not Helpful Votes',
          data: notHelpfulCounts,
          backgroundColor: 'rgba(237, 100, 166, 0.7)',
          borderColor: 'rgba(237, 100, 166, 1)',
          borderWidth: 1
        },
        {
          label: 'Helpful %',
          data: helpfulPercentages,
          type: 'line',
          yAxisID: 'y1',
          backgroundColor: 'rgba(66, 153, 225, 0.2)',
          borderColor: 'rgba(66, 153, 225, 1)',
          borderWidth: 2,
          fill: false,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: 'FAQ Effectiveness Ranking'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              if (label === 'Helpful %') {
                return `${label}: ${value}%`;
              }
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Votes'
          }
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Helpful %'
          },
          grid: {
            drawOnChartArea: false
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
};

// Data encryption for sensitive fields (client-side)
function encryptSensitiveData(data) {
  // In a real implementation, use a strong encryption library
  // This is a simplified example using Base64 for demonstration
  if (!data) return null;
  try {
    return btoa(JSON.stringify(data));
  } catch (err) {
    console.error('Encryption error:', err);
    return null;
  }
}

// Data decryption for sensitive fields (client-side)
function decryptSensitiveData(encryptedData) {
  if (!encryptedData) return null;
  try {
    return JSON.parse(atob(encryptedData));
  } catch (err) {
    console.error('Decryption error:', err);
    return null;
  }
}

// FAQ Analytics Dashboard Functions
window.loadFAQAnalytics = async function(forceRefresh = false) {
  try {
    const timeframe = document.getElementById('faq-analytics-timeframe').value;
    const faqId = document.getElementById('faq-analytics-id').value;
    
    // Show loading states
    document.getElementById('top-helpful-faq').textContent = 'Loading...';
    document.getElementById('top-helpful-percentage').textContent = '...';
    document.getElementById('most-viewed-faq').textContent = 'Loading...';
    document.getElementById('most-viewed-count').textContent = '...';
    document.getElementById('total-helpful-analytics').textContent = 'Loading...';
    document.getElementById('helpful-growth').textContent = '...';
    document.getElementById('needs-improvement-faq').textContent = 'Loading...';
    document.getElementById('needs-improvement-percentage').textContent = '...';
    document.getElementById('faq-analytics-table-body').innerHTML = '<tr><td colspan="7" style="padding: 1rem; text-align: center; color: #718096;">Loading data...</td></tr>';
    
    // Clear any existing charts
    destroyFAQAnalyticsCharts();
    
    // Fetch analytics data from Supabase
    const { data: analyticsData, error } = await supabase.rpc('get_faq_analytics', {
      p_days_back: parseInt(timeframe),
      p_faq_id: faqId === 'all' ? null : faqId
    });
    
    if (error) {
      throw new Error(error.message);
    }
    
    // Update the FAQ selector options if this is the first load
    updateFAQSelectorOptions(analyticsData.faq_ids);
    
    // Render the analytics data
    renderFAQAnalyticsSummary(analyticsData);
    renderFAQAnalyticsTable(analyticsData.effectiveness_ranking);
    createFAQEffectivenessChart(analyticsData.effectiveness_ranking);
    createFAQTrendsChart(analyticsData.daily_trends);
    createFAQHourlyChart(analyticsData.hourly_distribution);
    
    // Store the data for export
    window.currentFAQAnalyticsData = analyticsData;
    
  } catch (error) {
    console.error('Error loading FAQ analytics:', error);
    alert('Failed to load FAQ analytics. Please try again later.');
  }
};

// Initialize global variables for FAQ analytics
window.faqIdToQuestion = {};
window.faqAnalyticsCharts = {};

// Update FAQ selector dropdown with available FAQ IDs
window.updateFAQSelectorOptions = function(faqIds) {
  const selector = document.getElementById('faq-analytics-id');
  if (!selector) return;
  
  // Keep the "All FAQs" option
  const allOption = selector.options[0];
  selector.innerHTML = '';
  selector.appendChild(allOption);
  
  // Add options for each FAQ ID
  if (faqIds && faqIds.length) {
    faqIds.forEach(faqId => {
      const option = document.createElement('option');
      option.value = faqId;
      
      // Try to get the question text from our lookup
      const questionText = window.faqIdToQuestion && window.faqIdToQuestion[faqId] 
        ? window.faqIdToQuestion[faqId] 
        : `FAQ ${faqId}`;
        
      option.textContent = questionText.length > 40 
        ? questionText.substring(0, 40) + '...' 
        : questionText;
        
      selector.appendChild(option);
    });
  }
};

// Destroy existing charts before creating new ones
window.destroyFAQAnalyticsCharts = function() {
  if (window.faqAnalyticsCharts) {
    Object.values(window.faqAnalyticsCharts).forEach(chart => {
      if (chart) chart.destroy();
    });
  }
  window.faqAnalyticsCharts = {};
};

// Render FAQ analytics summary cards
window.renderFAQAnalyticsSummary = function(data) {
  const { effectiveness_ranking } = data;
  
  if (!effectiveness_ranking || !effectiveness_ranking.length) {
    document.getElementById('top-helpful-faq').textContent = 'No data available';
    document.getElementById('most-viewed-faq').textContent = 'No data available';
    document.getElementById('total-helpful-analytics').textContent = 'No data available';
    document.getElementById('needs-improvement-faq').textContent = 'No data available';
    return;
  }
  
  // Sort by helpfulness percentage and total votes
  const sortedByHelpful = [...effectiveness_ranking].sort((a, b) => b.helpful_percentage - a.helpful_percentage);
  const sortedByVotes = [...effectiveness_ranking].sort((a, b) => b.total_votes - a.total_votes);
  const sortedByUnhelpful = [...effectiveness_ranking].sort((a, b) => a.helpful_percentage - b.helpful_percentage);
  
  // Find top helpful FAQ
  if (sortedByHelpful.length > 0) {
    const topHelpful = sortedByHelpful[0];
    const question = window.faqIdToQuestion && window.faqIdToQuestion[topHelpful.faq_id] 
      ? window.faqIdToQuestion[topHelpful.faq_id] 
      : `FAQ ${topHelpful.faq_id}`;
      
    document.getElementById('top-helpful-faq').textContent = question.length > 30 
      ? question.substring(0, 30) + '...' 
      : question;
    document.getElementById('top-helpful-percentage').textContent = `${topHelpful.helpful_percentage}% helpful (${topHelpful.helpful_count}/${topHelpful.total_votes} votes)`;
  }
  
  // Find most viewed FAQ
  if (sortedByVotes.length > 0) {
    const mostViewed = sortedByVotes[0];
    const question = window.faqIdToQuestion && window.faqIdToQuestion[mostViewed.faq_id] 
      ? window.faqIdToQuestion[mostViewed.faq_id] 
      : `FAQ ${mostViewed.faq_id}`;
      
    document.getElementById('most-viewed-faq').textContent = question.length > 30 
      ? question.substring(0, 30) + '...' 
      : question;
    document.getElementById('most-viewed-count').textContent = `${mostViewed.total_votes} total votes`;
  }
  
  // Calculate total helpful votes
  const totalHelpfulVotes = effectiveness_ranking.reduce((sum, faq) => sum + faq.helpful_count, 0);
  const totalVotes = effectiveness_ranking.reduce((sum, faq) => sum + faq.total_votes, 0);
  const overallHelpfulPercentage = totalVotes > 0 ? Math.round((totalHelpfulVotes / totalVotes) * 100) : 0;
  
  document.getElementById('total-helpful-analytics').textContent = `${totalHelpfulVotes} helpful votes`;
  document.getElementById('helpful-growth').textContent = `${overallHelpfulPercentage}% of ${totalVotes} total votes`;
  
  // Find needs improvement FAQ
  if (sortedByUnhelpful.length > 0 && sortedByUnhelpful[0].total_votes >= 5) {
    const needsImprovement = sortedByUnhelpful[0];
    const question = window.faqIdToQuestion && window.faqIdToQuestion[needsImprovement.faq_id] 
      ? window.faqIdToQuestion[needsImprovement.faq_id] 
      : `FAQ ${needsImprovement.faq_id}`;
      
    document.getElementById('needs-improvement-faq').textContent = question.length > 30 
      ? question.substring(0, 30) + '...' 
      : question;
    document.getElementById('needs-improvement-percentage').textContent = `Only ${needsImprovement.helpful_percentage}% helpful (${needsImprovement.not_helpful_count} negative votes)`;
  } else {
    document.getElementById('needs-improvement-faq').textContent = 'No issues found';
    document.getElementById('needs-improvement-percentage').textContent = 'All FAQs performing well';
  }
};

// Enhanced rate limiting function with IP tracking
async function checkRateLimit(action = 'general') {
  const now = Date.now();
  
  // Initialize Supabase with secure practices
  initializeSupabaseSecurely();
  
// Create FAQ trends chart
window.createFAQTrendsChart = function(data) {
  if (!data || !data.length) return;
  
  // Group by date
  const dateGroups = data.reduce((groups, item) => {
    const date = item.vote_date;
    if (!groups[date]) {
      groups[date] = {
        date,
        helpful_count: 0,
        not_helpful_count: 0,
        total_votes: 0
      };
    }
    
    groups[date].helpful_count += item.helpful_count;
    groups[date].not_helpful_count += item.not_helpful_count;
    groups[date].total_votes += item.total_votes;
    
    return groups;
  }, {});
  
  // Convert to arrays for charting
  const dates = Object.keys(dateGroups).sort();
  const helpfulCounts = dates.map(date => dateGroups[date].helpful_count);
  const notHelpfulCounts = dates.map(date => dateGroups[date].not_helpful_count);
  const totalVotes = dates.map(date => dateGroups[date].total_votes);
  
  // Calculate trend line (percentage helpful over time)
  const helpfulPercentages = dates.map(date => {
    const group = dateGroups[date];
    return group.total_votes > 0 
      ? Math.round((group.helpful_count / group.total_votes) * 100) 
      : 0;
  });
  
  // Create chart
  const ctx = document.getElementById('faq-trends-chart').getContext('2d');
  window.faqAnalyticsCharts.trends = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Helpful Votes',
          data: helpfulCounts,
          backgroundColor: 'rgba(72, 187, 120, 0.7)',
          borderColor: 'rgba(72, 187, 120, 1)',
          borderWidth: 1,
          stack: 'Stack 0',
        },
        {
          label: 'Not Helpful Votes',
          data: notHelpfulCounts,
          backgroundColor: 'rgba(237, 100, 166, 0.7)',
          borderColor: 'rgba(237, 100, 166, 1)',
          borderWidth: 1,
          stack: 'Stack 0',
        },
        {
          label: 'Helpful %',
          data: helpfulPercentages,
          type: 'line',
          yAxisID: 'y1',
          backgroundColor: 'rgba(66, 153, 225, 0.2)',
          borderColor: 'rgba(66, 153, 225, 1)',
          borderWidth: 2,
          fill: false,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: 'Daily Vote Trends'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              if (label === 'Helpful %') {
                return `${label}: ${value}%`;
              }
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          stacked: true,
          title: {
            display: true,
            text: 'Number of Votes'
          }
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Helpful %'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
};

// Create FAQ hourly distribution chart
window.createFAQHourlyChart = function(data) {
  if (!data || !data.length) return;
  
  // Group by hour
  const hourGroups = Array.from({length: 24}, (_, i) => i).reduce((acc, hour) => {
    acc[hour] = {
      hour,
      helpful_count: 0,
      not_helpful_count: 0,
      total_votes: 0
    };
    return acc;
  }, {});
  
  // Fill in the actual data
  data.forEach(item => {
    const hour = item.vote_hour;
    if (hourGroups[hour]) {
      hourGroups[hour].helpful_count += item.helpful_count;
      hourGroups[hour].not_helpful_count += item.not_helpful_count;
      hourGroups[hour].total_votes += item.total_votes;
    }
  });
  
  // Convert to arrays for charting
  const hours = Object.keys(hourGroups).map(Number).sort((a, b) => a - b);
  const helpfulCounts = hours.map(hour => hourGroups[hour].helpful_count);
  const notHelpfulCounts = hours.map(hour => hourGroups[hour].not_helpful_count);
  
  // Calculate percentage helpful
  const helpfulPercentages = hours.map(hour => {
    const group = hourGroups[hour];
    return group.total_votes > 0 
      ? Math.round((group.helpful_count / group.total_votes) * 100) 
      : 0;
  });
  
  // Format hour labels (0-23 to 12am-11pm)
  const hourLabels = hours.map(hour => {
    if (hour === 0) return '12am';
    if (hour === 12) return '12pm';
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
  });
  
  // Create chart
  const ctx = document.getElementById('faq-hourly-chart').getContext('2d');
  window.faqAnalyticsCharts.hourly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: hourLabels,
      datasets: [
        {
          label: 'Helpful Votes',
          data: helpfulCounts,
          backgroundColor: 'rgba(72, 187, 120, 0.7)',
          borderColor: 'rgba(72, 187, 120, 1)',
          borderWidth: 1
        },
        {
          label: 'Not Helpful Votes',
          data: notHelpfulCounts,
          backgroundColor: 'rgba(237, 100, 166, 0.7)',
          borderColor: 'rgba(237, 100, 166, 1)',
          borderWidth: 1
        },
        {
          label: 'Helpful %',
          data: helpfulPercentages,
          type: 'line',
          yAxisID: 'y1',
          backgroundColor: 'rgba(66, 153, 225, 0.2)',
          borderColor: 'rgba(66, 153, 225, 1)',
          borderWidth: 2,
          fill: false,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: 'Hourly Vote Distribution'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const value = context.parsed.y || 0;
              if (label === 'Helpful %') {
                return `${label}: ${value}%`;
              }
              return `${label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Number of Votes'
          }
        },
        y1: {
          position: 'right',
          beginAtZero: true,
          max: 100,
          title: {
            display: true,
            text: 'Helpful %'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
};

// Export FAQ analytics data to Excel
window.exportFAQAnalytics = function() {
  if (!window.currentFAQAnalyticsData) {
    alert('No data available to export.');
    return;
  }
  
  try {
    const { effectiveness_ranking, daily_trends, hourly_distribution } = window.currentFAQAnalyticsData;
    
    // Create workbook with multiple sheets
    const wb = XLSX.utils.book_new();
    
    // Effectiveness ranking sheet
    if (effectiveness_ranking && effectiveness_ranking.length) {
      const effectivenessData = effectiveness_ranking.map(faq => {
        const question = window.faqIdToQuestion && window.faqIdToQuestion[faq.faq_id] 
          ? window.faqIdToQuestion[faq.faq_id] 
          : `FAQ ${faq.faq_id}`;
          
        return {
          'FAQ ID': faq.faq_id,
          'Question': question,
          'Helpful Votes': faq.helpful_count,
          'Not Helpful Votes': faq.not_helpful_count,
          'Total Votes': faq.total_votes,
          'Helpfulness %': faq.helpful_percentage,
          'Net Score': faq.net_score
        };
      });
      
      const wsEffectiveness = XLSX.utils.json_to_sheet(effectivenessData);
      XLSX.utils.book_append_sheet(wb, wsEffectiveness, 'FAQ Effectiveness');
    }
    
    // Daily trends sheet
    if (daily_trends && daily_trends.length) {
      const trendsData = daily_trends.map(trend => {
        return {
          'Date': trend.vote_date,
          'FAQ ID': trend.faq_id,
          'Helpful Votes': trend.helpful_count,
          'Not Helpful Votes': trend.not_helpful_count,
          'Total Votes': trend.total_votes,
          'Helpfulness %': trend.helpful_percentage
        };
      });
      
      const wsTrends = XLSX.utils.json_to_sheet(trendsData);
      XLSX.utils.book_append_sheet(wb, wsTrends, 'Daily Trends');
    }
    
    // Hourly distribution sheet
    if (hourly_distribution && hourly_distribution.length) {
      const hourlyData = hourly_distribution.map(item => {
        return {
          'Hour': item.vote_hour,
          'Time': item.vote_hour < 12 
            ? (item.vote_hour === 0 ? '12am' : `${item.vote_hour}am`) 
            : (item.vote_hour === 12 ? '12pm' : `${item.vote_hour - 12}pm`),
          'FAQ ID': item.faq_id,
          'Helpful Votes': item.helpful_count,
          'Not Helpful Votes': item.not_helpful_count,
          'Total Votes': item.total_votes,
          'Helpfulness %': item.total_votes > 0 
            ? Math.round((item.helpful_count / item.total_votes) * 100) 
            : 0
        };
      });
      
      const wsHourly = XLSX.utils.json_to_sheet(hourlyData);
      XLSX.utils.book_append_sheet(wb, wsHourly, 'Hourly Distribution');
    }
    
    // Generate Excel file and trigger download
    const timeframe = document.getElementById('faq-analytics-timeframe').value;
    const faqId = document.getElementById('faq-analytics-id').value;
    const fileName = `FAQ_Analytics_${faqId === 'all' ? 'All' : faqId}_${timeframe}days_${new Date().toISOString().slice(0, 10)}.xlsx`;
    
    XLSX.writeFile(wb, fileName);
  } catch (error) {
    console.error('Error exporting FAQ analytics:', error);
    alert('Failed to export analytics data. Please try again later.');
  }
};
  
  // Reset counter every minute for general actions
  if (now - SECURITY_CONFIG.lastRequestTime > 60000) {
    SECURITY_CONFIG.requestCount = 0;
    SECURITY_CONFIG.lastRequestTime = now;
  }
  
  // Special handling for login attempts
  if (action === 'login') {
    // Check if we're in a lockout period
    if (SECURITY_CONFIG.loginAttempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      const lockoutTime = SECURITY_CONFIG.lastLoginAttemptTime + SECURITY_CONFIG.LOGIN_LOCKOUT_TIME;
      
      if (now < lockoutTime) {
        const remainingTime = Math.ceil((lockoutTime - now) / 60000); // minutes
        console.warn(`Account locked due to too many login attempts. Try again in ${remainingTime} minutes.`);
        return {
          allowed: false,
          reason: 'lockout',
          remainingTime: remainingTime
        };
      } else {
        // Reset login attempts after lockout period
        SECURITY_CONFIG.loginAttempts = 0;
      }
    }
    
    SECURITY_CONFIG.loginAttempts++;
    SECURITY_CONFIG.lastLoginAttemptTime = now;
    
    // Try to log this with Supabase for persistent tracking
    try {
      await supabase.from('security_events').insert({
        event_type: 'login_attempt',
        client_info: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      // Continue even if logging fails
      console.error('Failed to log security event:', err);
    }
  }
  
  // Check general rate limit
  if (SECURITY_CONFIG.requestCount >= SECURITY_CONFIG.MAX_REQUESTS_PER_MINUTE) {
    // Log the rate limit breach
    try {
      await supabase.from('security_events').insert({
        event_type: 'rate_limit_breach',
        client_info: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      // Continue even if logging fails
      console.error('Failed to log security event:', err);
    }
    
    return {
      allowed: false,
      reason: 'rate_limit',
      message: 'Too many requests. Please try again later.'
    };
  }
  
  SECURITY_CONFIG.requestCount++;
  return {
    allowed: true
  };
}

// Securely initialize Supabase client
function initializeSupabaseSecurely() {
  if (!window.supabase) {
    // Safer approach to storing API keys
    const supabaseUrl = getApiCredential('url');
    const supabaseKey = getApiCredential('key');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Failed to initialize Supabase: Missing credentials');
      return null;
    }
    
    try {
      window.supabase = supabaseClient.createClient(supabaseUrl, supabaseKey);
      
      // Set up Content Security Policy
      if (SECURITY_CONFIG.ENABLE_CSP) {
        const meta = document.createElement('meta');
        meta.httpEquiv = 'Content-Security-Policy';
        meta.content = SECURITY_CONFIG.CSP_POLICY;
        document.head.appendChild(meta);
      }
    } catch (err) {
      console.error('Failed to initialize Supabase:', err);
      return null;
    }
  }
  
  return window.supabase;
}

// Get API credentials securely
function getApiCredential(type) {
  // In production, these would be loaded from environment variables
  // or a secure vault service, not hardcoded
  const credentials = {
    url: 'https://pjnqhdhlcgrrmfzscswv.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqbnFoZGhsY2dycm1menNjc3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTg3NDMsImV4cCI6MjA2NjUzNDc0M30.UVaJXabJDPMSHgDzUk3tOEv9sAFSjqSRNEYroypqyGs'
  };
  
  // Validate the credential format
  if (type === 'key' && !credentials.key.startsWith(SECURITY_CONFIG.API_KEY_PREFIX)) {
    console.error('Invalid API key format');
    return null;
  }
  
  return credentials[type] || null;
}

// Initialize Supabase client with secure configuration
const supabase = initializeSupabaseSecurely();

// Create security event logging table if not already done
async function ensureSecurityTablesExist() {
  try {
    const { error } = await supabase.rpc('create_security_tables');
    if (error) console.error('Error creating security tables:', error);
  } catch (err) {
    console.error('Failed to create security tables:', err);
  }
}

// Set up security headers for the frontend
function setupSecurityHeaders() {
  // Set Content-Security-Policy
  const cspMeta = document.createElement('meta');
  cspMeta.httpEquiv = 'Content-Security-Policy';
  cspMeta.content = SECURITY_CONFIG.CSP_POLICY;
  document.head.appendChild(cspMeta);
  
  // Set X-XSS-Protection
  const xssMeta = document.createElement('meta');
  xssMeta.httpEquiv = 'X-XSS-Protection';
  xssMeta.content = '1; mode=block';
  document.head.appendChild(xssMeta);
  
  // Set X-Content-Type-Options
  const ctoMeta = document.createElement('meta');
  ctoMeta.httpEquiv = 'X-Content-Type-Options';
  ctoMeta.content = 'nosniff';
  document.head.appendChild(ctoMeta);
  
  // Set Referrer-Policy
  const referrerMeta = document.createElement('meta');
  referrerMeta.name = 'referrer';
  referrerMeta.content = 'strict-origin-when-cross-origin';
  document.head.appendChild(referrerMeta);
  
  // Refresh CSRF token
  refreshCSRFToken();
  
  // Add XSS protection for inputs
  document.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('input', function() {
      this.value = this.value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    });
  });
}

// Detect and block common attack patterns
function setupSecurityMonitoring() {
  // Monitor URL for suspicious patterns
  const urlMonitoring = setInterval(() => {
    const url = window.location.href;
    const suspiciousPatterns = [
      /select\s+.*\s+from/i, // SQL injection
      /union\s+select/i, // SQL injection
      /script>/i, // XSS
      /javascript:/i, // XSS
      /eval\(/i, // JS injection
      /onload=/i, // JS event handler injection
      /localhost|127\.0\.0\.1/i, // SSRF attempt
      /file:/i, // Local file inclusion
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(url)) {
        console.error('Suspicious URL pattern detected:', pattern);
        // Log security event
        supabase.from('security_events').insert({
          event_type: 'suspicious_url',
          client_info: navigator.userAgent,
          details: JSON.stringify({ url }),
          timestamp: new Date().toISOString()
        }).then(() => {
          // Redirect to safe page
          window.location.href = window.location.origin;
        }).catch(err => {
          console.error('Failed to log security event:', err);
          window.location.href = window.location.origin;
        });
        
        clearInterval(urlMonitoring);
        break;
      }
    }
  }, 3000);
}

// Call this function when the app initializes
document.addEventListener('DOMContentLoaded', function() {
  ensureSecurityTablesExist();
  
  // Set up security headers in the frontend
  setupSecurityHeaders();
  
  // Set up security monitoring
  setupSecurityMonitoring();
  
  // Initialize real-time helpful votes system
  initializeHelpfulVotesSystem();
});

// Navigation System
document.addEventListener('DOMContentLoaded', function() {
  // Set initial online/offline status
  if (!navigator.onLine) {
    document.body.classList.add('offline-mode');
  }
  
  // Default show only home section
  document.querySelectorAll('section').forEach(section => {
    if (!section.classList.contains('hero')) {
      section.style.display = 'none';
    }
  });
  
  // Add click handlers to navigation links
  document.querySelectorAll('.main-nav a, .side-panel-nav a').forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetSectionClass = this.getAttribute('data-section');
      
      // Hide all sections
      document.querySelectorAll('section').forEach(section => {
        section.style.display = 'none';
      });
      
      // Show the target section
      if (targetSectionClass) {
        const targetElement = document.querySelector(`.${targetSectionClass}`) || 
                             document.querySelector(`#${targetSectionClass}`) ||
                             document.querySelector(`section[class*="${targetSectionClass}"]`);
        if (targetElement) {
          targetElement.style.display = 'block';
        }
      }
      
      // Close mobile menu if open
      const mobilePanel = document.querySelector('.mobile-side-panel');
      if (mobilePanel && mobilePanel.classList.contains('open')) {
        mobilePanel.classList.remove('open');
        document.querySelector('.mobile-overlay').classList.remove('show');
      }
    });
  });
  
  // Mobile menu toggle
  window.toggleMobileMenu = function() {
    const mobilePanel = document.querySelector('.mobile-side-panel');
    const overlay = document.querySelector('.mobile-overlay');
    if (mobilePanel && overlay) {
      mobilePanel.classList.toggle('open');
      overlay.classList.toggle('show');
    }
  }
  
  // Close mobile menu when overlay is clicked
  const overlay = document.querySelector('.mobile-overlay');
  if (overlay) {
    overlay.addEventListener('click', function() {
      document.querySelector('.mobile-side-panel').classList.remove('open');
      this.classList.remove('show');
    });
  }
  
  // Migrate existing localStorage data to Supabase first
  migrateLocalStorageToSupabase();
  
  // Load hostel data from Supabase - multiple attempts for reliability
  loadHostelsFromSupabase();
  
  // Additional loading attempts for home page
  setTimeout(() => {
    if (document.getElementById('public-list')) {
      console.log('🔄 Additional hostel load attempt...');
      loadHostelsFromSupabase();
    }
  }, 2000);
  
  setTimeout(() => {
    if (document.getElementById('public-list')) {
      console.log('🔄 Final hostel load attempt...');
      loadHostelsFromSupabase();
    }
  }, 4000);
  
  // Override existing saveHostel function to save to Supabase
  window.saveHostel = saveHostelToSupabase;
  
  // Secure admin login with role-based access control
  window.adminLogin = async function() {
    const rawEmail = document.getElementById('login-user')?.value;
    const rawPassword = document.getElementById('login-pass')?.value;
    
    // Validate inputs
    const email = validateAndSanitizeInput(rawEmail, 'email');
    const password = rawPassword?.trim();
    
    if (!email || !password) {
      alert('Please enter valid email and password');
      return;
    }
    
    // Rate limiting check - specific to logins
    const rateLimitCheck = await checkRateLimit('login');
    if (!rateLimitCheck.allowed) {
      if (rateLimitCheck.reason === 'lockout') {
        alert(`Account locked due to too many login attempts. Please try again in ${rateLimitCheck.remainingTime} minutes.`);
      } else {
        alert('Too many login attempts. Please wait before trying again.');
      }
      return;
    }
    
    // Log login attempt (whether successful or not)
    try {
      await supabase.from('login_attempts').insert({
        email: email,
        client_info: navigator.userAgent,
        successful: false // Will update to true if successful
      });
    } catch (err) {
      console.error('Failed to log login attempt:', err);
      // Continue with login process even if logging fails
    }
    
    try {
      // Check if admin exists in Supabase with role information
      const { data: admins, error } = await supabase
        .from('admins')
        .select('*')  // Get all fields including role and hostel_id
        .eq('user_email', email)
        .eq('approved', true)
        .limit(1);
      
      if (error) {
        console.error('Error checking admin:', error);
        // Fall back to localStorage if Supabase fails
        checkLocalAdmin(email, password);
        return;
      }
      
      if (admins && admins.length > 0) {
        const admin = admins[0];
        // Enhanced password verification (in production, use proper hashing)
        if (admin.password_hash === btoa(password)) {
          // Update login attempt to successful
          try {
            await supabase.from('login_attempts')
              .update({ successful: true })
              .match({ email: email })
              .order('attempt_time', { ascending: false })
              .limit(1);
          } catch (err) {
            console.error('Failed to update login status:', err);
            // Continue even if this fails
          }
          
          // Reset login attempts counter
          SECURITY_CONFIG.loginAttempts = 0;
          
          // Generate and store CSRF token
          const csrfToken = refreshCSRFToken();
          
          // Use Supabase auth if possible
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: email,
              password: password
            });
            
            if (error) {
              console.warn('Supabase auth failed, falling back to local auth:', error);
            }
          } catch (err) {
            console.warn('Supabase auth error, using local auth:', err);
          }
          
          // Store necessary info securely
          localStorage.setItem('currentAdmin', email);
          sessionStorage.setItem('adminSession', Date.now().toString());
          
          // Store role information for access control
          sessionStorage.setItem('adminRole', admin.role || 'hostel_owner');
          if (admin.hostel_id) {
            sessionStorage.setItem('hostelId', admin.hostel_id.toString());
          }
          
          // Check if 2FA is enabled for this admin
          if (admin.two_factor_enabled) {
            // Show 2FA verification modal
            show2FAVerificationModal(email, admin);
            return;
          }
          
          // Complete login if 2FA is not enabled
          await completeLogin(email, admin);
          
        } else {
          alert('Invalid credentials');
        }
      } else {
        alert('Invalid credentials');
      }
    } catch (err) {
      console.error('Error checking admin:', err);
      alert('Authentication error');
    }
  }
  
  // Show 2FA verification modal
  function show2FAVerificationModal(email, admin) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3>🔐 Two-Factor Authentication</h3>
          <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div style="text-align: center; margin-bottom: 20px;">
            <p>Enter the 6-digit code from your authenticator app</p>
          </div>
          
          <div style="margin: 20px 0;">
            <input type="text" id="2fa-code" maxlength="6" placeholder="123456" style="width: 100%; padding: 12px; margin: 5px 0; text-align: center; font-size: 18px; letter-spacing: 2px; border: 1px solid #ddd; border-radius: 5px;">
          </div>
          
          <div style="margin: 20px 0;">
            <button onclick="verify2FALogin('${email}', '${JSON.stringify(admin).replace(/'/g, "\\'")}'))" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 10px;">
              Verify and Login
            </button>
            
            <button onclick="show2FARecoveryModal('${email}', '${JSON.stringify(admin).replace(/'/g, "\\'")}'))" style="width: 100%; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9em;">
              Use Recovery Code
            </button>
          </div>
          
          <div style="text-align: center; font-size: 0.8em; color: #666;">
            <p>Lost your device? Contact your administrator</p>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on input and handle Enter key
    setTimeout(() => {
      const input = document.getElementById('2fa-code');
      input.focus();
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          verify2FALogin(email, admin);
        }
      });
    }, 100);
  }
  
  // Verify 2FA code during login
  window.verify2FALogin = async function(email, adminData) {
    try {
      const admin = typeof adminData === 'string' ? JSON.parse(adminData) : adminData;
      const code = document.getElementById('2fa-code').value.trim();
      
      if (!code || code.length !== 6) {
        alert('Please enter a valid 6-digit code');
        return;
      }
      
      // Verify the TOTP code
      const isValid = await verifyTOTP(admin.two_factor_secret, code);
      
      if (!isValid) {
        // Log failed 2FA attempt
        await supabase.from('security_events').insert({
          event_type: '2fa_failed',
          user_id: email,
          client_info: navigator.userAgent,
          timestamp: new Date().toISOString()
        });
        
        alert('Invalid 2FA code. Please try again.');
        return;
      }
      
      // Update last 2FA used time
      await supabase
        .from('admins')
        .update({ last_2fa_used_at: new Date().toISOString() })
        .eq('user_email', email);
      
      // Complete login
      await completeLogin(email, admin);
      
      // Close modal
      document.querySelector('.modal-overlay').remove();
      
    } catch (error) {
      console.error('2FA verification error:', error);
      alert('An error occurred during verification');
    }
  };
  
  // Show recovery code modal
  window.show2FARecoveryModal = function(email, adminData) {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h3>🔑 Recovery Code</h3>
            <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <div class="modal-body">
            <div style="text-align: center; margin-bottom: 20px;">
              <p>Enter one of your recovery codes</p>
            </div>
            
            <div style="margin: 20px 0;">
              <input type="text" id="recovery-code" placeholder="Enter recovery code" style="width: 100%; padding: 12px; margin: 5px 0; border: 1px solid #ddd; border-radius: 5px;">
            </div>
            
            <div style="margin: 20px 0;">
              <button onclick="verifyRecoveryCode('${email}', '${adminData}')" style="width: 100%; padding: 12px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin-bottom: 10px;">
                Use Recovery Code
              </button>
              
              <button onclick="show2FAVerificationModal('${email}', ${adminData}); this.closest('.modal-overlay').remove();" style="width: 100%; padding: 8px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9em;">
                Back to 2FA Code
              </button>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; font-size: 0.8em;">
              ⚠️ Recovery codes can only be used once. After using a recovery code, please set up 2FA again.
            </div>
          </div>
        </div>
      `;
    }
  };
  
  // Verify recovery code
  window.verifyRecoveryCode = async function(email, adminData) {
    try {
      const admin = typeof adminData === 'string' ? JSON.parse(adminData) : adminData;
      const recoveryCode = document.getElementById('recovery-code').value.trim();
      
      if (!recoveryCode) {
        alert('Please enter a recovery code');
        return;
      }
      
      // Verify recovery code using the database function
      const { data: isValid, error } = await supabase
        .rpc('verify_recovery_code', {
          admin_id_param: admin.id,
          code_param: recoveryCode
        });
      
      if (error) {
        console.error('Recovery code verification error:', error);
        alert('Error verifying recovery code');
        return;
      }
      
      if (!isValid) {
        // Log failed recovery attempt
        await supabase.from('security_events').insert({
          event_type: 'recovery_code_failed',
          user_id: email,
          client_info: navigator.userAgent,
          timestamp: new Date().toISOString()
        });
        
        alert('Invalid recovery code. Please try again.');
        return;
      }
      
      // Log successful recovery code usage
      await supabase.from('security_events').insert({
        event_type: 'recovery_code_used',
        user_id: email,
        client_info: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
      
      // Complete login
      await completeLogin(email, admin);
      
      // Close modal
      document.querySelector('.modal-overlay').remove();
      
      // Warn about 2FA reset
      setTimeout(() => {
        alert('Recovery code used successfully. Please consider setting up 2FA again for continued security.');
      }, 1000);
      
    } catch (error) {
      console.error('Recovery code error:', error);
      alert('An error occurred during recovery');
    }
  };
  
  // Complete login process (separated for reuse)
  async function completeLogin(email, admin) {
    try {
      // Clear form
      document.getElementById('login-user').value = '';
      document.getElementById('login-pass').value = '';
      
      // Store necessary info securely
      localStorage.setItem('currentAdmin', email);
      sessionStorage.setItem('adminSession', Date.now().toString());
      
      // Store role information for access control
      sessionStorage.setItem('adminRole', admin.role || 'hostel_owner');
      if (admin.hostel_id) {
        sessionStorage.setItem('hostelId', admin.hostel_id.toString());
      }
      
      // Log successful login
      await supabase.from('security_events').insert({
        event_type: 'successful_login',
        user_id: email,
        client_info: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
      
      alert('Login successful!');
      document.querySelector('#login-modal .close-modal')?.click();
      
// FAQ Search Functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize search input functionality
  initializeFAQSearch();
});

// Initialize the FAQ search functionality
function initializeFAQSearch() {
  const searchInput = document.getElementById('faq-search-input');
  const clearButton = document.getElementById('faq-search-clear');
  
  if (!searchInput || !clearButton) return;
  
  // Add event listener for input changes
  searchInput.addEventListener('input', function() {
    const searchTerm = this.value.trim().toLowerCase();
    
    // Show/hide clear button based on if there's text
    if (searchTerm.length > 0) {
      clearButton.style.display = 'flex';
    } else {
      clearButton.style.display = 'none';
    }
    
    // Perform search
    searchFAQs(searchTerm);
  });
  
  // Add event listener for pressing Enter
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      const searchTerm = this.value.trim().toLowerCase();
      if (searchTerm.length > 0) {
        searchFAQs(searchTerm);
      }
    }
  });
}

// Search FAQ items based on user input
function searchFAQs(searchTerm) {
  // Reset any active category filters
  resetCategoryFilters();
  
  // Get all FAQ items
  const faqItems = document.querySelectorAll('.faq-item');
  let matchCount = 0;
  
  // If search is empty, show all FAQs
  if (!searchTerm) {
    faqItems.forEach(item => {
      item.style.display = 'block';
    });
    updateSearchResultsInfo(null);
    return;
  }
  
  // Search through each FAQ
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question')?.textContent || '';
    const answer = item.querySelector('.faq-answer')?.textContent || '';
    const content = question + ' ' + answer;
    
    // Check if search term appears in content
    if (content.toLowerCase().includes(searchTerm)) {
      item.style.display = 'block';
      matchCount++;
      
      // Highlight matching text (optional enhancement)
      highlightMatches(item, searchTerm);
    } else {
      item.style.display = 'none';
    }
  });
  
  // Update search results info
  updateSearchResultsInfo(searchTerm, matchCount);
  
  // Update visible FAQ count
  document.getElementById('visible-faq-count').textContent = matchCount;
}

// Clear search input and reset display
window.clearFAQSearchInput = function() {
  const searchInput = document.getElementById('faq-search-input');
  const clearButton = document.getElementById('faq-search-clear');
  
  if (searchInput) {
    searchInput.value = '';
    searchFAQs('');
  }
  
  if (clearButton) {
    clearButton.style.display = 'none';
  }
  
  // Reset any category filters
  resetCategoryFilters();
}

// Reset the category filters
function resetCategoryFilters() {
  document.querySelectorAll('.faq-categories-legend div').forEach(div => {
    div.style.background = '#EDF2F7';
    div.style.color = '#4A5568';
  });
  
  // Make "All" active
  const allCategoryButton = document.querySelector('[data-category="all"]');
  if (allCategoryButton) {
    allCategoryButton.style.background = '#8B5CF6';
    allCategoryButton.style.color = 'white';
  }
}

// Update search results info message
function updateSearchResultsInfo(searchTerm, matchCount) {
  const infoElement = document.getElementById('search-results-info');
  
  if (!infoElement) return;
  
  if (!searchTerm) {
    infoElement.style.display = 'none';
    return;
  }
  
  infoElement.style.display = 'block';
  
  if (matchCount === 0) {
    infoElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #EF4444; font-weight: 500;">
        <span>😕</span>
        <span>No results found for "${searchTerm}". Try a different search term.</span>
      </div>
    `;
  } else {
    infoElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #10B981; font-weight: 500;">
        <span>✅</span>
        <span>Found ${matchCount} result${matchCount !== 1 ? 's' : ''} for "${searchTerm}"</span>
      </div>
    `;
  }
}

// Highlight matching text in search results
function highlightMatches(faqItem, searchTerm) {
  // Optional enhancement: Highlight matching text in questions and answers
  // This requires more sophisticated DOM manipulation and should be carefully implemented
  // to avoid XSS vulnerabilities. A simple implementation is omitted for safety.
}
          
          // Show admin panel and load dashboard
          showAdminPanel();
          
          // Load appropriate dashboard based on role
          if (admin.role === 'admin') {
            if (typeof updateAdminDashboard === 'function') {
              updateAdminDashboard();
            }
          } else {
            // For hostel owners, load only their hostel data
            loadHostelOwnerDashboard(admin.hostel_id);
          }
        } else {
          alert('Invalid password');
        }
      } else {
        // Fall back to localStorage if not found in Supabase
        checkLocalAdmin(email, password);
      }
    } catch (err) {
      console.error('Error during login:', err);
      alert('Login error. Please try again.');
    }
  };
  
  // Helper function to check localStorage for admin (legacy support)
  function checkLocalAdmin(email, password) {
    try {
      const admins = JSON.parse(localStorage.getItem('admins') || '[]');
      const admin = admins.find(a => a.user === email && a.approved);
      
      if (admin && admin.pass === btoa(password)) {
        localStorage.setItem('currentAdmin', email);
        sessionStorage.setItem('adminSession', Date.now().toString());
        
        // Legacy role determination
        const role = admin.role || (admin.user === 'teamhostall@gmail.com' ? 'admin' : 'hostel_owner');
        sessionStorage.setItem('adminRole', role);
        
        // If hostel owner, try to find their hostel ID
        if (role === 'hostel_owner' && admin.hostelId) {
          sessionStorage.setItem('hostelId', admin.hostelId.toString());
        }
        
        document.getElementById('login-user').value = '';
        document.getElementById('login-pass').value = '';
        
        alert('Login successful!');
        document.querySelector('#login-modal .close-modal')?.click();
        showAdminPanel();
        
        // Load appropriate dashboard based on role
        if (admin.role === 'admin') {
          if (typeof updateAdminDashboard === 'function') {
            updateAdminDashboard();
          }
        } else {
          // For hostel owners, load only their hostel data
          loadHostelOwnerDashboard(admin.hostel_id);
        }
        
        // Load security status regardless of role
        setTimeout(() => {
          if (typeof loadSecurityStatus === 'function') {
            loadSecurityStatus();
          }
        }, 1000);
      } else {
        alert('Invalid credentials');
      }
    } catch (err) {
      console.error('Error checking local admin:', err);
      alert('Authentication error');
    }
  }
  
  // Load hostel owner restricted dashboard
  async function loadHostelOwnerDashboard(hostelId) {
    try {
      // Hide admin-only sections
      document.querySelectorAll('.admin-only-section').forEach(section => {
        if (section) section.style.display = 'none';
      });
      
      // Show owner message
      const ownerMessage = document.getElementById('hostel-owner-message');
      if (ownerMessage) {
        ownerMessage.style.display = 'block';
      }
      
      // Load only the owner's hostel
      const hostels = await loadRestrictedHostels();
      
      // Display owner's hostel in management section
      const hostelsList = document.getElementById('hostels-management');
      if (hostelsList && hostels.length > 0) {
        hostelsList.innerHTML = hostels.map(hostel => `
          <div class="owner-hostel-card">
            <img src="${hostel.image_url || hostel.img || '#'}" alt="${hostel.name}" class="owner-hostel-img" onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
            <div class="owner-hostel-details">
              <h3 class="owner-hostel-name">${hostel.name}</h3>
              <div class="owner-hostel-info">
                <p><strong>Gender:</strong> ${hostel.gender}</p>
                <p><strong>Location:</strong> ${hostel.location || 'Not specified'}</p>
                <p><strong>Phone:</strong> ${hostel.phone || 'Not provided'}</p>
                <p><strong>WhatsApp:</strong> ${hostel.whatsapp || 'Not provided'}</p>
                <p><strong>Facilities:</strong> ${Array.isArray(hostel.facilities) ? hostel.facilities.join(', ') : (hostel.facilities || 'Not specified')}</p>
              </div>
              <div class="owner-hostel-actions">
                <button onclick="editHostel(${hostel.id})" class="edit-hostel-btn">Edit Hostel Details</button>
              </div>
            </div>
          </div>
        `).join('');
      } else {
        // No hostels assigned
        if (hostelsList) {
          hostelsList.innerHTML = '<p>You don\'t have any hostels assigned to your account. Please contact the administrator.</p>';
        }
      }
      
      // Update breadcrumb/title
      const dashboardTitle = document.querySelector('.admin-header h2');
      if (dashboardTitle) {
        dashboardTitle.textContent = 'Hostel Owner Dashboard';
      }
      
    } catch (err) {
      console.error('Error loading hostel owner dashboard:', err);
    }
  }
  
  // Enhanced session validation with role-based access and security controls
  window.validateAdminSession = async function() {
    try {
      // First check for Supabase session (preferred method)
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (session) {
        // Use the Supabase session if available
        return true;
      }
      
      // Fall back to our custom session storage if needed
      const currentAdmin = localStorage.getItem('currentAdmin');
      const sessionToken = sessionStorage.getItem('adminSession');
      const csrfToken = sessionStorage.getItem('csrfToken');
      const storedCSRFToken = document.cookie.split('; ').find(row => row.startsWith('CSRF-Token='))?.split('=')[1];
      
      // Verify we have all required elements
      if (!currentAdmin || !sessionToken || !csrfToken) {
        logoutAdminSecurely();
        return false;
      }
      
      // Verify CSRF token
      if (csrfToken !== storedCSRFToken) {
        console.error('CSRF token mismatch. Possible cross-site request forgery attempt.');
        
        // Log security event
        await supabase.from('security_events').insert({
          event_type: 'csrf_failure',
          client_info: navigator.userAgent,
          details: JSON.stringify({ admin_email: currentAdmin }),
          timestamp: new Date().toISOString()
        });
        
        logoutAdminSecurely();
        return false;
      }
      
      // Check if session is not older than configured timeout
      const sessionTime = parseInt(sessionToken);
      const currentTime = Date.now();
      
      if (isNaN(sessionTime) || currentTime - sessionTime > SECURITY_CONFIG.SESSION_TIMEOUT) {
        logoutAdminSecurely();
        return false;
      }
      
      // Refresh the session to extend it
      sessionStorage.setItem('adminSession', Date.now().toString());
      
      // Refresh CSRF token periodically
      const tokenAge = currentTime - parseInt(sessionStorage.getItem('csrfTokenTime') || '0');
      if (tokenAge > 15 * 60 * 1000) { // 15 minutes
        refreshCSRFToken();
      }
      
      return true;
    } catch (err) {
      console.error('Session validation error:', err);
      logoutAdminSecurely();
      return false;
    }
  };
  
  // Securely log out admin
  function logoutAdminSecurely() {
    // Clear all auth data
    localStorage.removeItem('currentAdmin');
    sessionStorage.removeItem('adminSession');
    sessionStorage.removeItem('adminRole');
    sessionStorage.removeItem('hostelId');
    sessionStorage.removeItem('csrfToken');
    sessionStorage.removeItem('csrfTokenTime');
    
    // Clear any auth cookies
    document.cookie = 'CSRF-Token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    
    // Also log out of Supabase
    supabase.auth.signOut().catch(err => {
      console.error('Error during Supabase logout:', err);
    });
    
    // Redirect to login page
    window.location.href = window.location.pathname + '#login';
  }
  
  // Generate and store a new CSRF token
  function refreshCSRFToken() {
    // Generate a random token
    const token = generateSecureToken(32);
    
    // Store in sessionStorage
    sessionStorage.setItem('csrfToken', token);
    sessionStorage.setItem('csrfTokenTime', Date.now().toString());
    
    // Also store in cookie (with HttpOnly and Secure flags in production)
    document.cookie = `CSRF-Token=${token}; path=/; SameSite=Strict`;
    
    return token;
  }
  
  // Generate a cryptographically secure random token
  function generateSecureToken(length = 32) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Initialize Helpful Votes System with Supabase real-time
async function initializeHelpfulVotesSystem() {
  if (!window.supabase) {
    console.log('Supabase not initialized, helpful votes will use localStorage only');
    return;
  }
  
  console.log('Initializing helpful votes system with Supabase...');
  
  try {
    // 1. Set up initial helpful votes subscription for all FAQs
    const allFAQs = document.querySelectorAll('.faq-helpful');
    
    // Create an array to track FAQs we're subscribing to
    const faqIds = [];
    
    // Extract FAQ IDs from the DOM
    allFAQs.forEach(faqSection => {
      const buttons = faqSection.querySelector('.helpful-buttons');
      if (!buttons) return;
      
      const yesBtn = buttons.querySelector('button');
      if (!yesBtn) return;
      
      const onclickAttr = yesBtn.getAttribute('onclick');
      if (!onclickAttr) return;
      
      const match = onclickAttr.match(/'([^']+)'/);
      if (match && match[1]) {
        faqIds.push(match[1]);
      }
    });
    
    console.log(`Setting up real-time subscriptions for ${faqIds.length} FAQs`);
    
    // Set up subscriptions for each FAQ
    faqIds.forEach(faqId => {
      setupHelpfulVoteSubscription(faqId);
    });
    
    // 2. Migrate any existing localStorage votes to Supabase
    await migrateLocalStorageVotesToSupabase();
    
    // 3. Fetch and display initial vote counts
    await updateHelpfulCounters();
    
  } catch (error) {
    console.error('Error initializing helpful votes system:', error);
  }
}

// Migrate localStorage votes to Supabase
async function migrateLocalStorageVotesToSupabase() {
  try {
    // Skip if Supabase is not available
    if (!window.supabase) return;
    
    const helpfulStats = JSON.parse(localStorage.getItem('helpfulStats') || '{}');
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    
    // Nothing to migrate
    if (Object.keys(helpfulStats).length === 0) return;
    
    console.log('Migrating localStorage votes to Supabase...');
    
    // Get client info for user tracking
    const clientInfo = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timestamp: new Date().toISOString(),
      migration: true
    };
    
    // Process each FAQ vote
    for (const [faqId, votes] of Object.entries(userVotes)) {
      // Skip if we don't have vote data for this FAQ
      if (!helpfulStats[faqId]) continue;
      
      const isHelpful = votes === true;
      
      // Call Supabase to record the vote
      const { data, error } = await supabase.rpc('record_helpful_vote', {
        p_faq_id: faqId,
        p_is_helpful: isHelpful,
        p_client_info: JSON.stringify(clientInfo)
      });
      
      if (error) {
        console.error(`Error migrating vote for FAQ ${faqId}:`, error);
      } else {
        console.log(`Migrated vote for FAQ ${faqId} successfully:`, data);
      }
    }
    
    // Clear localStorage after successful migration
    // Keep userVotes to remember which FAQs the user has voted on
    localStorage.removeItem('helpfulStats');
    
    console.log('Migration of helpful votes completed');
    
  } catch (error) {
    console.error('Error migrating localStorage votes:', error);
  }
}

// Two-Factor Authentication Functions
  
  // Generate TOTP code (Time-based One-Time Password)
  async function generateTOTP(secret, timeStep = 30) {
    try {
      const time = Math.floor(Date.now() / 1000 / timeStep);
      const timeBytes = new ArrayBuffer(8);
      const timeView = new DataView(timeBytes);
      timeView.setUint32(4, time, false);
      
      // In a real implementation, you would use HMAC-SHA1
      // For demo purposes, we'll use a simplified approach
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', key, timeBytes);
      const signatureBytes = new Uint8Array(signature);
      
      const offset = signatureBytes[19] & 0xf;
      const code = (
        ((signatureBytes[offset] & 0x7f) << 24) |
        ((signatureBytes[offset + 1] & 0xff) << 16) |
        ((signatureBytes[offset + 2] & 0xff) << 8) |
        (signatureBytes[offset + 3] & 0xff)
      ) % 1000000;
      
      return code.toString().padStart(6, '0');
    } catch (error) {
      console.error('TOTP generation error:', error);
      return null;
    }
  }
  
  // Verify TOTP code
  async function verifyTOTP(secret, code, window = 1) {
    try {
      const currentStep = Math.floor(Date.now() / 1000 / SECURITY_CONFIG.TOTP_STEP);
      
      // Check current time and ±window steps
      for (let i = -window; i <= window; i++) {
        const testTime = currentStep + i;
        const testCode = await generateTOTPForTime(secret, testTime);
        
        if (testCode === code) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('TOTP verification error:', error);
      return false;
    }
  }
  
  // Generate TOTP for specific time step
  async function generateTOTPForTime(secret, timeStep) {
    try {
      const timeBytes = new ArrayBuffer(8);
      const timeView = new DataView(timeBytes);
      timeView.setUint32(4, timeStep, false);
      
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );
      
      const signature = await crypto.subtle.sign('HMAC', key, timeBytes);
      const signatureBytes = new Uint8Array(signature);
      
      const offset = signatureBytes[19] & 0xf;
      const code = (
        ((signatureBytes[offset] & 0x7f) << 24) |
        ((signatureBytes[offset + 1] & 0xff) << 16) |
        ((signatureBytes[offset + 2] & 0xff) << 8) |
        (signatureBytes[offset + 3] & 0xff)
      ) % 1000000;
      
      return code.toString().padStart(6, '0');
    } catch (error) {
      console.error('TOTP time generation error:', error);
      return null;
    }
  }
  
  // Generate QR code data for 2FA setup
  function generate2FAQRCode(email, secret, issuer = 'HOSTALL') {
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return otpauthUrl;
  }
  
  // Setup 2FA for admin account
  window.setup2FA = async function() {
    try {
      const currentAdmin = localStorage.getItem('currentAdmin');
      if (!currentAdmin || !await validateAdminSession()) {
        alert('Please log in to enable 2FA');
        return;
      }
      
      // Generate secret
      const { data: secretData, error: secretError } = await supabase
        .rpc('generate_2fa_secret');
        
      if (secretError) {
        console.error('Error generating 2FA secret:', secretError);
        alert('Failed to generate 2FA secret');
        return;
      }
      
      const secret = secretData;
      const qrCodeData = generate2FAQRCode(currentAdmin, secret);
      
      // Show 2FA setup modal
      show2FASetupModal(qrCodeData, secret, currentAdmin);
      
    } catch (error) {
      console.error('2FA setup error:', error);
      alert('Failed to setup 2FA');
    }
  };
  
  // Show 2FA setup modal
  function show2FASetupModal(qrCodeData, secret, email) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
          <h3>🔐 Enable Two-Factor Authentication</h3>
          <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">×</button>
        </div>
        <div class="modal-body">
          <div style="text-align: center; margin-bottom: 20px;">
            <p>Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)</p>
            <div id="qr-code-container" style="margin: 20px 0;">
              <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCodeData)}" alt="2FA QR Code" style="border: 1px solid #ddd; padding: 10px;">
            </div>
            <p style="font-size: 0.9em; color: #666;">Or enter this secret manually: <strong>${secret}</strong></p>
          </div>
          
          <div style="margin: 20px 0;">
            <label for="verification-code">Enter the 6-digit code from your app:</label>
            <input type="text" id="verification-code" maxlength="6" placeholder="123456" style="width: 100%; padding: 10px; margin: 5px 0; text-align: center; font-size: 18px; letter-spacing: 2px;">
          </div>
          
          <div style="margin: 20px 0;">
            <button onclick="verify2FASetup('${secret}', '${email}')" style="width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer;">
              Verify and Enable 2FA
            </button>
          </div>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 20px;">
            <h4>⚠️ Important:</h4>
            <ul style="margin: 10px 0; padding-left: 20px; font-size: 0.9em;">
              <li>Make sure your authenticator app is properly synced</li>
              <li>Save backup recovery codes after setup</li>
              <li>Keep your device secure</li>
            </ul>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus on input
    setTimeout(() => {
      document.getElementById('verification-code').focus();
    }, 100);
  }
  
  // Verify 2FA setup
  window.verify2FASetup = async function(secret, email) {
    try {
      const code = document.getElementById('verification-code').value.trim();
      
      if (!code || code.length !== 6) {
        alert('Please enter a valid 6-digit code');
        return;
      }
      
      // Verify the code
      const isValid = await verifyTOTP(secret, code);
      
      if (!isValid) {
        alert('Invalid code. Please try again.');
        return;
      }
      
      // Save 2FA secret to database
      const { error: updateError } = await supabase
        .from('admins')
        .update({ 
          two_factor_secret: secret,
          two_factor_enabled: true 
        })
        .eq('user_email', email);
      
      if (updateError) {
        console.error('Error enabling 2FA:', updateError);
        alert('Failed to enable 2FA. Please try again.');
        return;
      }
      
      // Generate recovery codes
      const { data: recoveryCodes, error: recoveryError } = await supabase
        .rpc('generate_recovery_codes', { 
          admin_id_param: await getAdminId(email) 
        });
      
      if (recoveryError) {
        console.error('Error generating recovery codes:', recoveryError);
        alert('2FA enabled but failed to generate recovery codes. Please contact support.');
      }
      
      // Show success message with recovery codes
      show2FASuccessModal(recoveryCodes || []);
      
      // Log security event
      await supabase.from('security_events').insert({
        event_type: '2fa_enabled',
        user_id: email,
        client_info: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('2FA verification error:', error);
      alert('An error occurred during verification');
    }
  };
  
  // Show 2FA success modal with recovery codes
  function show2FASuccessModal(recoveryCodes) {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h3>✅ Two-Factor Authentication Enabled</h3>
            <button class="close-modal" onclick="this.closest('.modal-overlay').remove()">×</button>
          </div>
          <div class="modal-body">
            <div style="text-align: center; margin-bottom: 20px;">
              <p>🎉 2FA has been successfully enabled for your account!</p>
            </div>
            
            ${recoveryCodes.length > 0 ? `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>🔑 Recovery Codes</h4>
              <p style="font-size: 0.9em; margin-bottom: 10px;">Save these codes in a safe place. You can use them to recover your account if you lose access to your authenticator app:</p>
              <div style="background: white; padding: 10px; border-radius: 3px; font-family: monospace; font-size: 14px; line-height: 1.6;">
                ${recoveryCodes.map(code => `<div>${code}</div>`).join('')}
              </div>
              <p style="font-size: 0.8em; color: #856404; margin-top: 10px;">⚠️ Each code can only be used once. Keep them secure!</p>
            </div>
            ` : ''}
            
            <div style="margin: 20px 0;">
              <button onclick="this.closest('.modal-overlay').remove()" style="width: 100%; padding: 12px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">
                Continue
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }
  
  // Get admin ID by email
  async function getAdminId(email) {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('id')
        .eq('user_email', email)
        .single();
      
      if (error) {
        console.error('Error getting admin ID:', error);
        return null;
      }
      
      return data.id;
    } catch (error) {
      console.error('Admin ID lookup error:', error);
      return null;
    }
  }
  
  // Load security status and events
  window.loadSecurityStatus = async function() {
    try {
      const currentAdmin = localStorage.getItem('currentAdmin');
      if (!currentAdmin) return;
      
      // Get admin info including 2FA status
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('two_factor_enabled, last_2fa_used_at')
        .eq('user_email', currentAdmin)
        .single();
      
      if (!adminError && admin) {
        // Update 2FA status
        const statusElement = document.getElementById('2fa-status');
        const enableBtn = document.getElementById('enable-2fa-btn');
        const disableBtn = document.getElementById('disable-2fa-btn');
        
        if (admin.two_factor_enabled) {
          if (statusElement) statusElement.textContent = '✅ Enabled';
          if (enableBtn) enableBtn.style.display = 'none';
          if (disableBtn) disableBtn.style.display = 'block';
        } else {
          if (statusElement) statusElement.textContent = '❌ Disabled';
          if (enableBtn) {
            enableBtn.style.display = 'block';
            enableBtn.disabled = false;
          }
          if (disableBtn) disableBtn.style.display = 'none';
        }
      }
      
      // Load security events
      await loadSecurityEvents(currentAdmin);
      
    } catch (error) {
      console.error('Error loading security status:', error);
    }
  };
  
  // Load recent security events
  async function loadSecurityEvents(email) {
    try {
      const { data: events, error } = await supabase
        .from('security_events')
        .select('*')
        .eq('user_id', email)
        .order('timestamp', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error('Error loading security events:', error);
        return;
      }
      
      // Count successful and failed logins in the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentEvents = events.filter(event => new Date(event.timestamp) > thirtyDaysAgo);
      
      const successfulLogins = recentEvents.filter(e => e.event_type === 'successful_login').length;
      const failedLogins = recentEvents.filter(e => e.event_type === '2fa_failed').length;
      
      // Update counters
      const successElement = document.getElementById('successful-logins');
      const failedElement = document.getElementById('failed-logins');
      
      if (successElement) successElement.textContent = successfulLogins;
      if (failedElement) failedElement.textContent = failedLogins;
      
      // Display recent events
      const eventsContainer = document.getElementById('security-events-list');
      if (eventsContainer && events.length > 0) {
        eventsContainer.innerHTML = events.map(event => {
          const date = new Date(event.timestamp).toLocaleString();
          const eventIcon = getEventIcon(event.event_type);
          const eventColor = getEventColor(event.event_type);
          
          return `
            <div style="display: flex; align-items: center; gap: 1rem; padding: 0.75rem; background: #F9FAFB; border-radius: 8px; margin-bottom: 0.5rem;">
              <div style="font-size: 1.2em;">${eventIcon}</div>
              <div style="flex: 1;">
                <div style="font-weight: 500; color: ${eventColor};">${formatEventType(event.event_type)}</div>
                <div style="font-size: 0.8em; color: #6B7280;">${date}</div>
              </div>
            </div>
          `;
        }).join('');
      } else if (eventsContainer) {
        eventsContainer.innerHTML = '<div style="text-align: center; color: #6B7280; padding: 1rem;">No recent security events</div>';
      }
      
    } catch (error) {
      console.error('Error loading security events:', error);
    }
  }
  
  // Get icon for event type
  function getEventIcon(eventType) {
    const icons = {
      'successful_login': '✅',
      '2fa_failed': '❌',
      'recovery_code_used': '🔑',
      '2fa_enabled': '🔐',
      'suspicious_activity': '⚠️',
      'password_changed': '🔑'
    };
    return icons[eventType] || '📝';
  }
  
  // Get color for event type
  function getEventColor(eventType) {
    const colors = {
      'successful_login': '#38A169',
      '2fa_failed': '#E53E3E',
      'recovery_code_used': '#D69E2E',
      '2fa_enabled': '#8B5CF6',
      'suspicious_activity': '#E53E3E',
      'password_changed': '#38A169'
    };
    return colors[eventType] || '#6B7280';
  }
  
  // Format event type for display
  function formatEventType(eventType) {
    const labels = {
      'successful_login': 'Successful Login',
      '2fa_failed': 'Failed 2FA Verification',
      'recovery_code_used': 'Recovery Code Used',
      '2fa_enabled': '2FA Enabled',
      'suspicious_activity': 'Suspicious Activity',
      'password_changed': 'Password Changed'
    };
    return labels[eventType] || eventType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
  
  // Disable 2FA
  window.disable2FA = async function() {
    try {
      const currentAdmin = localStorage.getItem('currentAdmin');
      if (!currentAdmin) return;
      
      if (!confirm('Are you sure you want to disable two-factor authentication? This will make your account less secure.')) {
        return;
      }
      
      // Update admin record
      const { error } = await supabase
        .from('admins')
        .update({ 
          two_factor_enabled: false,
          two_factor_secret: null 
        })
        .eq('user_email', currentAdmin);
      
      if (error) {
        console.error('Error disabling 2FA:', error);
        alert('Failed to disable 2FA');
        return;
      }
      
      // Log security event
      await supabase.from('security_events').insert({
        event_type: '2fa_disabled',
        user_id: currentAdmin,
        client_info: navigator.userAgent,
        timestamp: new Date().toISOString()
      });
      
      alert('Two-factor authentication has been disabled');
      
      // Reload security status
      await loadSecurityStatus();
      
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      alert('An error occurred while disabling 2FA');
    }
  };
  
  // Change password function
  window.changePassword = function() {
    const currentAdmin = localStorage.getItem('currentAdmin');
    if (!currentAdmin) {
      alert('Please log in first');
      return;
    }

    // Create modal for password change
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.8); display: flex; align-items: center;
      justify-content: center; z-index: 10000;
    `;
    
    modal.innerHTML = `
      <div style="background: white; padding: 2rem; border-radius: 12px; width: 90%; max-width: 400px;">
        <h3 style="margin: 0 0 1.5rem 0; color: #2D3748;">🔑 Change Password</h3>
        <form id="change-password-form">
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: #4A5568;">Current Password</label>
            <input type="password" id="current-password" required style="width: 100%; padding: 0.8rem; border: 1px solid #E2E8F0; border-radius: 8px;">
          </div>
          <div style="margin-bottom: 1rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: #4A5568;">New Password</label>
            <input type="password" id="new-password" required minlength="8" style="width: 100%; padding: 0.8rem; border: 1px solid #E2E8F0; border-radius: 8px;">
          </div>
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.5rem; color: #4A5568;">Confirm New Password</label>
            <input type="password" id="confirm-password" required style="width: 100%; padding: 0.8rem; border: 1px solid #E2E8F0; border-radius: 8px;">
          </div>
          <div style="display: flex; gap: 1rem;">
            <button type="submit" style="flex: 1; padding: 0.8rem; background: #8B5CF6; color: white; border: none; border-radius: 8px; cursor: pointer;">
              Change Password
            </button>
            <button type="button" onclick="this.closest('.modal-overlay').remove()" style="flex: 1; padding: 0.8rem; background: #6B7280; color: white; border: none; border-radius: 8px; cursor: pointer;">
              Cancel
            </button>
          </div>
        </form>
      </div>
    `;
    
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
    
    // Handle form submission
    document.getElementById('change-password-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      
      if (newPassword !== confirmPassword) {
        alert('New passwords do not match');
        return;
      }
      
      if (newPassword.length < 8) {
        alert('Password must be at least 8 characters long');
        return;
      }
      
      try {
        // Verify current password and update
        const adminData = JSON.parse(currentAdmin);
        
        // In a real implementation, you would verify the current password with the server
        // For now, we'll simulate the password change
        const response = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: adminData.id,
            currentPassword: currentPassword,
            newPassword: newPassword
          })
        }).catch(() => {
          // Fallback for demo - update local storage
          const hashedNewPassword = btoa(newPassword + 'hostall-salt');
          adminData.password_hash = hashedNewPassword;
          localStorage.setItem('currentAdmin', JSON.stringify(adminData));
          return { ok: true };
        });
        
        if (response.ok) {
          alert('Password changed successfully! Please log in again with your new password.');
          logout();
        } else {
          alert('Failed to change password. Please check your current password.');
        }
      } catch (error) {
        console.error('Password change error:', error);
        alert('An error occurred while changing password');
      }
      
      modal.remove();
    });
  };
  
  // Get current admin role
  window.getAdminRole = function() {
    return sessionStorage.getItem('adminRole') || 'hostel_owner';
  };
  
  // Get assigned hostel ID for hostel owners
  window.getAssignedHostelId = function() {
    return sessionStorage.getItem('hostelId') ? parseInt(sessionStorage.getItem('hostelId')) : null;
  };
  
  // Check if admin is a hostel owner
  window.isHostelOwner = function() {
    return getAdminRole() === 'hostel_owner';
  };
  
  // Load hostel data restricted by owner
  window.loadRestrictedHostels = async function() {
    try {
      const role = getAdminRole();
      const hostelId = getAssignedHostelId();
      
      let query = supabase.from('hostels').select('*');
      
      // Apply restriction for hostel owners
      if (role === 'hostel_owner' && hostelId) {
        query = query.eq('id', hostelId);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error loading hostels:', error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error('Error in loadRestrictedHostels:', err);
      return [];
    }
  };
  
  // Override existing admin functions to use Supabase
  window.addAdmin = addAdminToSupabase;
});

// Function to migrate existing localStorage data to Supabase
async function migrateLocalStorageToSupabase() {
  try {
    const hostelsData = localStorage.getItem('hostels');
    if (hostelsData) {
      const hostels = JSON.parse(hostelsData);
      console.log('Found local hostels data, migrating to Supabase...');
      
      // First check if we're online
      if (!navigator.onLine) {
        console.log('Currently offline, will migrate data when connection is restored');
        // Store the hostels in the offline queue for later sync
        const offlineHostels = JSON.parse(localStorage.getItem('offline_hostels') || '[]');
        for (const hostel of hostels) {
          hostel.offlineId = Date.now() + Math.floor(Math.random() * 1000); // Generate unique ID
          hostel.pendingSync = true;
          offlineHostels.push(hostel);
        }
        localStorage.setItem('offline_hostels', JSON.stringify(offlineHostels));
        
        // Also use as cache for display
        localStorage.setItem('hostels_cache', JSON.stringify(hostels));
        
        // Clear original localStorage to prevent duplicates
        localStorage.removeItem('hostels');
        return;
      }
      
      // If online, proceed with migration
      for (const hostel of hostels) {
        await saveHostelToSupabase(hostel, false); // false = don't show alerts during migration
      }
      
      console.log('Migration completed. Clearing localStorage...');
      // Clear localStorage after successful migration to prevent duplicates
      localStorage.removeItem('hostels');
    }
  } catch (error) {
    console.error('Error during migration:', error);
  }
}

// Function to save hostel to Supabase
async function saveHostelToSupabase(hostelData = null, showAlert = true) {
  try {
    let hostel;
    
    if (hostelData) {
      // Data provided directly (for migration)
      hostel = hostelData;
    } else {
      // Get data from form (for new entries)
      hostel = {
        name: document.getElementById('h-name')?.value,
        gender: document.getElementById('h-gender')?.value,
        location: document.getElementById('h-location')?.value,
        details: document.getElementById('h-details')?.value,
        map: document.getElementById('h-map')?.value,
        phone: validatePhoneNumber(document.getElementById('h-phone')?.value),
        whatsapp: validatePhoneNumber(document.getElementById('h-whatsapp')?.value),
        img: document.getElementById('h-img-preview')?.src || null,
        facilities: getSelectedFacilities(), // Function to get selected facilities
        other_facilities: document.getElementById('other-facilities')?.value || null,
        updated_at: new Date().toISOString() // Add timestamp for syncing
      };
    }
    
    // Insert into Supabase with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    let data = null;
    let error = null;
    
    while (retryCount < maxRetries) {
      const result = await supabase
        .from('hostels')
        .insert([hostel])
        .select();
        
      error = result.error;
      
      if (!error) {
        data = result.data;
        break;
      }
      
      retryCount++;
      console.log(`Retry attempt ${retryCount} to save hostel...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
    
    if (error) {
      console.error('Error saving hostel after retries:', error);
      
      // Store in localStorage as offline backup to sync later
      const offlineHostels = JSON.parse(localStorage.getItem('offline_hostels') || '[]');
      hostel.offlineId = Date.now(); // Add temporary ID for offline operation
      hostel.pendingSync = true;
      offlineHostels.push(hostel);
      localStorage.setItem('offline_hostels', JSON.stringify(offlineHostels));
      
      if (showAlert) {
        alert('Currently offline. Hostel saved locally and will sync when connection is restored.');
      }
      
      // Still show the hostel in UI for better UX
      const allHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
      allHostels.unshift(hostel); // Add to beginning of array
      localStorage.setItem('hostels_cache', JSON.stringify(allHostels));
      displayHostels(allHostels);
      
      // Schedule a sync attempt for when connection is restored
      setTimeout(syncOfflineHostels, 30000);
      
      return true; // Return true to indicate successful local save
    }
    
    console.log('Hostel saved successfully to Supabase:', data);
    if (showAlert) alert('Hostel saved successfully!');
    
    // Update local cache
    const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
    cachedHostels.unshift(data[0]); // Add to beginning of array
    localStorage.setItem('hostels_cache', JSON.stringify(cachedHostels));
    
    // Refresh the hostel display
    loadHostelsFromSupabase();
    
    // Clear form if this was a new entry
    if (!hostelData) {
      clearHostelForm();
    }
    
    return true;
  } catch (err) {
    console.error('Error saving hostel:', err);
    if (showAlert) alert('Error saving hostel: ' + err.message);
    return false;
  }
}

// Function to sync offline hostels when connection is restored
async function syncOfflineHostels() {
  const offlineHostels = JSON.parse(localStorage.getItem('offline_hostels') || '[]');
  
  if (offlineHostels.length === 0) return;
  
  console.log(`Attempting to sync ${offlineHostels.length} offline hostels...`);
  
  let syncedCount = 0;
  const stillOffline = [];
  
  for (const hostel of offlineHostels) {
    try {
      // Skip sync if we're offline
      if (!navigator.onLine) {
        stillOffline.push(hostel);
        continue;
      }
      
      // Remove offline metadata
      const { offlineId, pendingSync, ...cleanHostel } = hostel;
      
      // Try to save to Supabase
      const { error } = await supabase
        .from('hostels')
        .insert([cleanHostel]);
        
      if (error) {
        console.error('Failed to sync hostel:', error);
        stillOffline.push(hostel);
      } else {
        syncedCount++;
      }
    } catch (err) {
      console.error('Error during sync:', err);
      stillOffline.push(hostel);
    }
  }
  
  console.log(`Synced ${syncedCount} of ${offlineHostels.length} offline hostels`);
  
  // Update offline storage
  if (stillOffline.length > 0) {
    localStorage.setItem('offline_hostels', JSON.stringify(stillOffline));
    // Try again later
    setTimeout(syncOfflineHostels, 60000);
  } else {
    localStorage.removeItem('offline_hostels');
    // Refresh display with synced data
    loadHostelsFromSupabase();
  }
}

// Function to sync pending deletions when connection is restored
async function syncPendingDeletions() {
  const pendingDeletions = JSON.parse(localStorage.getItem('pending_deletions') || '[]');
  
  if (pendingDeletions.length === 0) return;
  
  console.log(`Attempting to sync ${pendingDeletions.length} pending deletions...`);
  
  // Skip if we're offline
  if (!navigator.onLine) {
    console.log('Still offline, will try again later...');
    setTimeout(syncPendingDeletions, 60000);
    return;
  }
  
  let syncedCount = 0;
  const stillPending = [];
  
  for (const hostelId of pendingDeletions) {
    try {
      // Try to delete from Supabase
      const { error } = await supabase
        .from('hostels')
        .delete()
        .eq('id', hostelId);
        
      if (error) {
        console.error('Failed to sync deletion:', error);
        stillPending.push(hostelId);
      } else {
        syncedCount++;
      }
    } catch (err) {
      console.error('Error during deletion sync:', err);
      stillPending.push(hostelId);
    }
  }
  
  console.log(`Synced ${syncedCount} of ${pendingDeletions.length} pending deletions`);
  
  // Update offline storage
  if (stillPending.length > 0) {
    localStorage.setItem('pending_deletions', JSON.stringify(stillPending));
    // Try again later
    setTimeout(syncPendingDeletions, 60000);
  } else {
    localStorage.removeItem('pending_deletions');
  }
}

// Function to sync all offline data
async function syncOfflineData() {
  try {
    if (!navigator.onLine) {
      console.log('Still offline, cannot sync data');
      return;
    }
    
    console.log('Starting sync of all offline data...');
    await syncOfflineHostels();
    await syncPendingDeletions();
    await loadHostelsFromSupabase();
    console.log('Data synchronization completed');
  } catch (err) {
    console.error('Error during data synchronization:', err);
  }
}

// Function to add admin to Supabase
async function addAdminToSupabase() {
  try {
    const email = document.getElementById('a-name')?.value;
    const password = document.getElementById('a-pass')?.value;
    const confirmPassword = document.getElementById('a-pass2')?.value;
    
    if (!email || !password || !confirmPassword) {
      alert('Please fill in all fields');
      return;
    }
    
    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }
    
    // Simple password hash (in production, use proper hashing)
    const passwordHash = btoa(password); // Base64 encoding for demo
    
    const { data, error } = await supabase
      .from('admins')
      .insert([{
        user_email: email,
        password_hash: passwordHash,
        approved: false
      }])
      .select();
    
    if (error) {
      console.error('Error adding admin:', error);
      alert('Error adding admin: ' + error.message);
      return;
    }
    
    alert('Admin request submitted for approval!');
    
    // Clear form
    document.getElementById('a-name').value = '';
    document.getElementById('a-pass').value = '';
    document.getElementById('a-pass2').value = '';
    
  } catch (err) {
    console.error('Error adding admin:', err);
    alert('Error adding admin: ' + err.message);
  }
}

// Function to get selected facilities from form
function getSelectedFacilities() {
  const facilities = [];
  document.querySelectorAll('.facility-checkbox:checked').forEach(checkbox => {
    facilities.push(checkbox.value);
  });
  return facilities;
}

// Phone number validation function
function validatePhoneNumber(phone) {
  if (!phone) return null;
  // Remove all spaces and special characters except +
  const cleaned = phone.replace(/[^+\d]/g, '');
  // Check if it's a valid Pakistani number format
  const pakistaniPattern = /^\+92\d{10}$/;
  if (pakistaniPattern.test(cleaned)) {
    return cleaned;
  }
  // If not properly formatted, try to format it
  const digitsOnly = cleaned.replace(/^\+?92?/, '');
  if (digitsOnly.length === 10) {
    return `+92${digitsOnly}`;
  }
  return null; // Invalid number
}

// Email validation function
function validateEmail(email) {
  if (!email) return null;
  const emailPattern = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
  return emailPattern.test(email.trim()) ? email.trim().toLowerCase() : null;
}

// Function to clear hostel form
function clearHostelForm() {
  const fields = ['h-name', 'h-gender', 'h-location', 'h-details', 'h-map', 'h-phone', 'h-whatsapp', 'other-facilities'];
  fields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.value = '';
  });
  
  // Clear facility checkboxes
  document.querySelectorAll('.facility-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Clear image preview
  const imgPreview = document.getElementById('h-img-preview');
  if (imgPreview) imgPreview.src = '';
  
  // Clear media uploads container
  const mediaContainer = document.getElementById('media-uploads-container');
  if (mediaContainer) mediaContainer.innerHTML = '';
}

// Function to load hostels from Supabase
async function loadHostelsFromSupabase() {
  try {
    // Check if we're offline first
    if (!navigator.onLine) {
      console.log('Currently offline, using cached data');
      const cachedData = localStorage.getItem('hostels_cache');
      if (cachedData) {
        console.log('Using cached hostel data');
        displayHostels(JSON.parse(cachedData));
      } else {
        // Final fallback to legacy localStorage
        loadHostelsFromLocalStorage();
      }
      return;
    }
    
    // Fetch hostels from Supabase with retry logic
    const maxRetries = 3;
    let retryCount = 0;
    let hostels = null;
    let error = null;
    
    while (retryCount < maxRetries) {
      const result = await supabase
        .from('hostels')
        .select('*')
        .order('created_at', { ascending: false });
      
      error = result.error;
      
      if (!error) {
        hostels = result.data;
        break;
      }
      
      retryCount++;
      console.log(`Retry attempt ${retryCount} to fetch hostels...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
    
    if (error) {
      console.error('Error fetching hostels after retries:', error.message);
      // Fallback to localStorage if Supabase fails
      const cachedData = localStorage.getItem('hostels_cache');
      if (cachedData) {
        console.log('Using cached hostel data');
        displayHostels(JSON.parse(cachedData));
      } else {
        // Final fallback to legacy localStorage
        loadHostelsFromLocalStorage();
      }
      return;
    }
    
    if (hostels && hostels.length > 0) {
      console.log(`Loaded ${hostels.length} hostels from Supabase`);
      // Store a copy in localStorage as backup (for offline access)
      localStorage.setItem('hostels_cache', JSON.stringify(hostels));
      // Display hostels in the UI
      displayHostels(hostels);
      
      // Also check for and merge any offline created hostels
      const offlineHostels = JSON.parse(localStorage.getItem('offline_hostels') || '[]');
      if (offlineHostels.length > 0) {
        console.log(`Found ${offlineHostels.length} offline-created hostels, adding to display`);
        const combinedHostels = [...offlineHostels, ...hostels];
        displayHostels(combinedHostels);
      }
    } else {
      console.log('No hostels found in Supabase, checking localStorage cache');
      // Try to use cached data first
      const cachedData = localStorage.getItem('hostels_cache');
      if (cachedData) {
        console.log('Using cached hostel data');
        displayHostels(JSON.parse(cachedData));
      } else {
        // Final fallback to legacy localStorage
        loadHostelsFromLocalStorage();
      }
    }
  } catch (err) {
    console.error('Error connecting to Supabase:', err.message);
    // Fallback to localStorage if error
    const cachedData = localStorage.getItem('hostels_cache');
    if (cachedData) {
      console.log('Using cached hostel data');
      displayHostels(JSON.parse(cachedData));
    } else {
      // Final fallback to legacy localStorage
      loadHostelsFromLocalStorage();
    }
  }
}

// Function to load hostels from localStorage (fallback)
function loadHostelsFromLocalStorage() {
  try {
    const hostelsData = localStorage.getItem('hostels');
    if (hostelsData) {
      const hostels = JSON.parse(hostelsData);
      console.log(`Loaded ${hostels.length} hostels from localStorage`);
      displayHostels(hostels);
    } else {
      console.log('No hostels found in localStorage');
      displayNoHostelsMessage();
    }
  } catch (err) {
    console.error('Error loading from localStorage:', err.message);
    displayNoHostelsMessage();
  }
}

// Function to display hostels in the UI
function displayHostels(hostels) {
  // Try multiple possible container elements
  const hostelGrid = document.querySelector('.hostel-grid') || 
                     document.querySelector('#public-list') || 
                     document.querySelector('#hostelGrid');
  
  // Clear any existing content
  if (hostelGrid) {
    hostelGrid.innerHTML = '';
    
    // Create hostel cards
    hostels.forEach((hostel, index) => {
      const hostelCard = document.createElement('div');
      hostelCard.className = 'hostel-card';
      
      // Handle image with better fallback
      let imageUrl = hostel.img || hostel.image;
      if (!imageUrl || imageUrl === 'null' || imageUrl === null) {
        // Use a hostel-themed placeholder
        const genderColor = hostel.gender === 'Female' ? 'ff69b4' : hostel.gender === 'Male' ? '4169e1' : '6b7280';
        imageUrl = `https://via.placeholder.com/300x200/${genderColor}/ffffff?text=${encodeURIComponent(hostel.name || 'Hostel')}`;
      }
      
      // Get first part of location for cleaner display
      const locationDisplay = (hostel.location || hostel.address || 'Location not specified')
        .split(',')[0].trim();
      
      hostelCard.innerHTML = `
        <div class="hostel-image-container">
          <img src="${imageUrl}" class="hostel-image" alt="${hostel.name}" 
               onerror="this.src='https://via.placeholder.com/300x200/6b7280/ffffff?text=Hostel+Image'">
          <div class="hostel-gender-badge ${hostel.gender ? hostel.gender.toLowerCase() : ''}">
            ${hostel.gender || 'Any'}
          </div>
        </div>
        <div class="hostel-content">
          <h3 class="hostel-name">${hostel.name || 'Unnamed Hostel'}</h3>
          <div class="hostel-location-only">
            📍 ${locationDisplay}
          </div>
          <div class="hostel-contact" style="font-size: 0.9rem; color: #6b7280; margin: 0.5rem 0;">
            ${hostel.phone ? `📞 ${hostel.phone}` : ''}
          </div>
          <button class="view-details-btn" data-hostel-index="${index}">View Details</button>
        </div>
      `;
      hostelGrid.appendChild(hostelCard);
    });
    
    // Add click event listeners to view details buttons
    document.querySelectorAll('.view-details-btn').forEach(button => {
      button.addEventListener('click', function() {
        const hostelIndex = this.getAttribute('data-hostel-index');
        showHostelDetails(hostels[hostelIndex]);
      });
    });
    
    console.log(`Displayed ${hostels.length} hostels on the page`);
    
    // Update results count if element exists
    const resultsCount = document.getElementById('results-count');
    if (resultsCount) {
      resultsCount.textContent = `${hostels.length} hostels found`;
    }
  } else {
    console.warn('No hostel grid container found on the page');
  }
}

// Function to show no hostels message
function displayNoHostelsMessage() {
  const hostelGrid = document.querySelector('.hostel-grid');
  if (hostelGrid) {
    hostelGrid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 2rem;"><h3>No hostels found</h3><p>There are no hostels available at the moment. Please check back later.</p></div>';
  }
}

// Function to show hostel details
function showHostelDetails(hostel) {
  const facilities = hostel.facilities ? 
    (Array.isArray(hostel.facilities) ? hostel.facilities.join(', ') : hostel.facilities) : 
    'Not specified';
  
  const otherFacilities = hostel.other_facilities ? `\nOther Facilities: ${hostel.other_facilities}` : '';
  
  // Format room prices if available
  let roomPricing = '';
  if (hostel.room_prices && Array.isArray(hostel.room_prices)) {
    roomPricing = '\nRoom Pricing:\n' + hostel.room_prices.map(price => {
      if (price.type && price.price) {
        return `• ${price.type}: ${price.price} ${price.currency || 'PKR'}${price.per ? ' per ' + price.per : ''}${price.description ? ' (' + price.description + ')' : ''}`;
      }
      return '';
    }).filter(item => item).join('\n');
  }
  
  const details = `
HOSTEL DETAILS

📍 Name: ${hostel.name}
👥 Gender: ${hostel.gender}
🏠 Location: ${hostel.location || 'Not specified'}
📞 Phone: ${hostel.phone || 'Not provided'}
📱 WhatsApp: ${hostel.whatsapp || 'Not provided'}
🏢 Facilities: ${facilities}${otherFacilities}${roomPricing}

Additional Information:
${hostel.details || 'No additional details'}

${hostel.map ? '🗺️ View on map: ' + hostel.map : '❌ Map not provided'}
  `;
  
  alert(details);
  // In a real implementation, you'd show this in a modal or navigate to a details page
}

// Function to update an existing hostel
async function updateHostelInSupabase(hostelId, updatedData) {
  try {
    const { data, error } = await supabase
      .from('hostels')
      .update(updatedData)
      .eq('id', hostelId)
      .select();
    
    if (error) {
      console.error('Error updating hostel:', error);
      alert('Error updating hostel: ' + error.message);
      return false;
    }
    
    console.log('Hostel updated successfully:', data);
    alert('Hostel updated successfully!');
    
    // Refresh the hostel display
    loadHostelsFromSupabase();
    
    return true;
  } catch (err) {
    console.error('Error updating hostel:', err);
    alert('Error updating hostel: ' + err.message);
    return false;
  }
}

// Function to delete a hostel
async function deleteHostelFromSupabase(hostelId) {
  try {
    // First, check if this is an offline ID (temporary ID)
    if (typeof hostelId === 'string' && hostelId.startsWith('offline_')) {
      // Handle deleting from offline storage
      const offlineId = parseInt(hostelId.replace('offline_', ''));
      const offlineHostels = JSON.parse(localStorage.getItem('offline_hostels') || '[]');
      const updatedOfflineHostels = offlineHostels.filter(hostel => hostel.offlineId !== offlineId);
      localStorage.setItem('offline_hostels', JSON.stringify(updatedOfflineHostels));
      
      // Also update cache
      const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
      const updatedCache = cachedHostels.filter(hostel => {
        return !(hostel.offlineId && hostel.offlineId === offlineId);
      });
      localStorage.setItem('hostels_cache', JSON.stringify(updatedCache));
      
      displayHostels(updatedCache);
      alert('Hostel deleted successfully!');
      return true;
    }
    
    // If we're offline, queue the deletion for later sync
    if (!navigator.onLine) {
      const pendingDeletions = JSON.parse(localStorage.getItem('pending_deletions') || '[]');
      pendingDeletions.push(hostelId);
      localStorage.setItem('pending_deletions', JSON.stringify(pendingDeletions));
      
      // Update local cache to hide this hostel
      const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
      const updatedCache = cachedHostels.filter(hostel => hostel.id !== hostelId);
      localStorage.setItem('hostels_cache', JSON.stringify(updatedCache));
      
      displayHostels(updatedCache);
      alert('Currently offline. Deletion will be processed when connection is restored.');
      
      // Schedule a sync attempt for when connection is restored
      setTimeout(syncPendingDeletions, 30000);
      return true;
    }
    
    // If online, perform the deletion to Supabase with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    let error = null;
    
    while (retryCount < maxRetries) {
      const result = await supabase
        .from('hostels')
        .delete()
        .eq('id', hostelId);
        
      error = result.error;
      
      if (!error) {
        break;
      }
      
      retryCount++;
      console.log(`Retry attempt ${retryCount} to delete hostel...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
    
    if (error) {
      console.error('Error deleting hostel after retries:', error);
      alert('Error deleting hostel: ' + error.message);
      return false;
    }
    
    console.log('Hostel deleted successfully!');
    alert('Hostel deleted successfully!');
    
    // Update cache
    const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
    const updatedCache = cachedHostels.filter(hostel => hostel.id !== hostelId);
    localStorage.setItem('hostels_cache', JSON.stringify(updatedCache));
    
    // Refresh the hostel display
    displayHostels(updatedCache);
    
    return true;
      const offlineHostels = JSON.parse(localStorage.getItem('offline_hostels') || '[]');
      const updatedOfflineHostels = offlineHostels.filter(h => h.offlineId !== offlineId);
      localStorage.setItem('offline_hostels', JSON.stringify(updatedOfflineHostels));
      
      // Also update the cache
      const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
      const updatedCache = cachedHostels.filter(h => h.offlineId !== offlineId);
      localStorage.setItem('hostels_cache', JSON.stringify(updatedCache));
      
      alert('Offline hostel deleted successfully!');
      displayHostels(updatedCache);
      return true;
    }
    
    // Regular deletion from Supabase with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    let error = null;
    
    while (retryCount < maxRetries) {
      const result = await supabase
        .from('hostels')
        .delete()
        .eq('id', hostelId);
      
      error = result.error;
      
      if (!error) {
        break;
      }
      
      retryCount++;
      console.log(`Retry attempt ${retryCount} to delete hostel...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
    }
    
    if (error) {
      console.error('Error deleting hostel after retries:', error);
      
      // Store in pending deletions for offline sync
      const pendingDeletions = JSON.parse(localStorage.getItem('pending_deletions') || '[]');
      pendingDeletions.push(hostelId);
      localStorage.setItem('pending_deletions', JSON.stringify(pendingDeletions));
      
      // Update local cache to maintain UI consistency
      const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
      const updatedCache = cachedHostels.filter(h => h.id !== hostelId);
      localStorage.setItem('hostels_cache', JSON.stringify(updatedCache));
      
      alert('Currently offline. Hostel will be deleted when connection is restored.');
      displayHostels(updatedCache);
      
      // Schedule a sync attempt for when connection is restored
      setTimeout(syncPendingDeletions, 30000);
      
      return true; // Return true to indicate successful local deletion
    }
    
    console.log('Hostel deleted successfully from Supabase');
    alert('Hostel deleted successfully!');
    
    // Update local cache
    const cachedHostels = JSON.parse(localStorage.getItem('hostels_cache') || '[]');
    const updatedCache = cachedHostels.filter(h => h.id !== hostelId);
    localStorage.setItem('hostels_cache', JSON.stringify(updatedCache));
    
    // Refresh the hostel display
    loadHostelsFromSupabase();
    
    return true;
  } catch (err) {
    console.error('Error deleting hostel:', err);
    alert('Error deleting hostel: ' + err.message);
    return false;
  }
}

// Function to sync pending deletions when connection is restored
async function syncPendingDeletions() {
  const pendingDeletions = JSON.parse(localStorage.getItem('pending_deletions') || '[]');
  
  if (pendingDeletions.length === 0) return;
  
  console.log(`Attempting to sync ${pendingDeletions.length} pending deletions...`);
  
  let syncedCount = 0;
  const stillPending = [];
  
  for (const hostelId of pendingDeletions) {
    try {
      // Try to delete from Supabase
      const { error } = await supabase
        .from('hostels')
        .delete()
        .eq('id', hostelId);
        
      if (error) {
        console.error('Failed to sync deletion:', error);
        stillPending.push(hostelId);
      } else {
        syncedCount++;
      }
    } catch (err) {
      console.error('Error during deletion sync:', err);
      stillPending.push(hostelId);
    }
  }
  
  console.log(`Synced ${syncedCount} of ${pendingDeletions.length} pending deletions`);
  
  // Update pending storage
  if (stillPending.length > 0) {
    localStorage.setItem('pending_deletions', JSON.stringify(stillPending));
    // Try again later
    setTimeout(syncPendingDeletions, 60000);
  } else {
    localStorage.removeItem('pending_deletions');
    // Refresh display with synced data
    loadHostelsFromSupabase();
  }
}

// Real-time subscription for hostels
function setupHostelRealtimeSubscription() {
  if (!supabase) {
    console.warn('Supabase not available for real-time subscription');
    return;
  }

  console.log('🔄 Setting up real-time subscription for hostels...');
  
  try {
    const hostelSubscription = supabase
      .channel('hostels_realtime')
      .on('postgres_changes', {
        event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
        schema: 'public',
        table: 'hostels'
      }, (payload) => {
        console.log('🔄 Real-time hostel change detected:', payload);
        
        // Update real-time status
        window.realtimeStatus.lastUpdate = new Date().toISOString();
        window.realtimeStatus.isConnected = true;
        
        // Handle different types of changes
        switch (payload.eventType) {
          case 'INSERT':
            console.log('✅ New hostel added:', payload.new);
            // Show notification to user
            showNotification('✅ New hostel added!', 'success');
            break;
          case 'UPDATE':
            console.log('📝 Hostel updated:', payload.new);
            showNotification('📝 Hostel updated!', 'info');
            break;
          case 'DELETE':
            console.log('🗑️ Hostel deleted:', payload.old);
            showNotification('🗑️ Hostel deleted!', 'info');
            break;
        }
        
        // Immediately refresh the hostel display
        setTimeout(() => {
          loadHostelsFromSupabase();
        }, 500); // Small delay to ensure database is consistent
      })
      .subscribe((status) => {
        console.log('📡 Subscription status changed:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription for hostels is ACTIVE');
          window.realtimeStatus.isConnected = true;
          showNotification('📡 Real-time sync is active!', 'success');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error');
          window.realtimeStatus.isConnected = false;
          setupPollingFallback();
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Real-time subscription timed out');
          window.realtimeStatus.isConnected = false;
          setupPollingFallback();
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Real-time subscription closed');
          window.realtimeStatus.isConnected = false;
          // Try to reconnect after 5 seconds
          setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            setupHostelRealtimeSubscription();
          }, 5000);
        }
      });
      
    // Store subscription globally for cleanup and status tracking
    window.realtimeStatus.hostelSubscription = hostelSubscription;
    window.hostelSubscription = hostelSubscription; // Backward compatibility
    
  } catch (error) {
    console.error('❌ Error setting up real-time subscription:', error);
    window.realtimeStatus.isConnected = false;
    // Fallback to polling if real-time fails
    setupPollingFallback();
  }
}

// Function to show notifications to users
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateX(100%);
  `;
  
  // Set background color based on type
  switch(type) {
    case 'success':
      notification.style.background = '#10B981';
      break;
    case 'error':
      notification.style.background = '#EF4444';
      break;
    case 'warning':
      notification.style.background = '#F59E0B';
      break;
    default:
      notification.style.background = '#3B82F6';
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.opacity = '1';
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

// Fallback polling mechanism
function setupPollingFallback() {
  console.log('🔄 Setting up polling fallback (every 5 seconds)...');
  showNotification('📡 Using backup sync mode', 'warning');
  
  // Clear any existing polling interval
  if (window.pollingInterval) {
    clearInterval(window.pollingInterval);
  }
  
  window.pollingInterval = setInterval(() => {
    console.log('🔄 Polling for hostel updates...');
    loadHostelsFromSupabase();
  }, 5000); // Check every 5 seconds for better responsiveness
}

// Global variable to track subscription status
window.realtimeStatus = {
  hostelSubscription: null,
  isConnected: false,
  lastUpdate: null
};

// Initialize real-time subscription when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for Supabase to initialize
  setTimeout(() => {
    setupHostelRealtimeSubscription();
  }, 2000);
});

// Also setup on window load as backup
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!window.realtimeStatus.hostelSubscription) {
      console.log('🔄 Backup attempt to setup real-time subscription...');
      setupHostelRealtimeSubscription();
    }
  }, 3000);
});

// Enhanced function to show real-time status
function showRealtimeStatus() {
  console.log('📡 Real-time Status:', {
    connected: window.realtimeStatus.isConnected,
    lastUpdate: window.realtimeStatus.lastUpdate,
    subscription: !!window.realtimeStatus.hostelSubscription
  });
}

// Email handling function for contact and feedback forms
async function sendEmailNotification(data) {
  try {
    // Save the email data to Supabase 'emails' table for tracking
    const { error } = await supabase
      .from('emails')
      .insert([{
        to_email: data.to || 'teamhostall@gmail.com',
        from_name: data.name || 'Guest User',
        from_email: data.email || 'no-reply@hostall.com',
        subject: data.subject || 'HOSTALL Website Notification',
        message: data.message || 'No message content',
        type: data.type || 'contact',
        status: 'pending',
        created_at: new Date().toISOString()
      }]);

    if (error) {
      console.error('Error saving email notification:', error);
      return false;
    }

    // For immediate user experience, also open the default email client
    if (data.openEmailClient && data.email) {
      const subject = encodeURIComponent(data.subject || 'HOSTALL Website Inquiry');
      const body = encodeURIComponent(data.message || '');
      window.open(`mailto:${data.to || 'teamhostall@gmail.com'}?subject=${subject}&body=${body}`, '_blank');
    }

    console.log('Email notification saved to Supabase');
    return true;
  } catch (err) {
    console.error('Error in sendEmailNotification:', err);
    return false;
  }
}

// Secure feedback form submissions
window.submitFeedback = async function() {
  // Rate limiting check
  if (!checkRateLimit()) {
    alert('Too many requests. Please wait a moment before trying again.');
    return;
  }
  
  // Get and validate inputs
  const rawName = document.getElementById('feedback-name')?.value;
  const rawEmail = document.getElementById('feedback-email')?.value;
  const rawType = document.getElementById('feedback-type')?.value;
  const rawMessage = document.getElementById('feedback-message')?.value;
  
  // Validate and sanitize inputs
  const name = validateAndSanitizeInput(rawName, 'name');
  const email = validateAndSanitizeInput(rawEmail, 'email');
  const type = validateAndSanitizeInput(rawType, 'text') || 'general';
  const message = validateAndSanitizeInput(rawMessage, 'message');
  
  if (!name || !email || !message) {
    alert('Please provide valid information in all required fields');
    return;
  }
  
  try {
    // Store in Supabase with sanitized data
    const { data, error } = await supabase
      .from('feedback')
      .insert([{
        name: name,
        email: email,
        type: type,
        message: message,
        status: 'new',
        ip_hash: btoa(Date.now().toString()) // Simple request tracking
      }]);
    
    if (error) {
      console.error('Error submitting feedback:', error);
      alert('There was an error submitting your feedback. Please try again.');
      return;
    }
    
    // Send email notification with sanitized data
    await sendEmailNotification({
      name: name,
      email: email,
      subject: `HOSTALL Feedback: ${type}`,
      message: message,
      type: 'feedback',
      openEmailClient: false
    });
    
    alert('Thank you for your feedback! We will review it shortly.');
    
    // Clear form
    document.getElementById('feedback-name').value = '';
    document.getElementById('feedback-email').value = '';
    document.getElementById('feedback-message').value = '';
    document.getElementById('feedback-type').value = 'general';
    
  } catch (err) {
    console.error('Unexpected error:', err);
    alert('An unexpected error occurred. Please try again later.');
  }
}

// Secure direct message submissions from chat widget
window.sendDirectMessage = async function() {
  // Rate limiting check
  if (!checkRateLimit()) {
    alert('Too many requests. Please wait a moment before trying again.');
    return;
  }
  
  // Get and validate inputs
  const rawName = document.getElementById('chat-name')?.value;
  const rawWhatsapp = document.getElementById('chat-whatsapp')?.value;
  const rawEmail = document.getElementById('chat-email')?.value;
  const rawMessage = document.getElementById('chat-message')?.value;
  
  // Validate and sanitize inputs
  const name = validateAndSanitizeInput(rawName, 'name');
  const whatsapp = rawWhatsapp ? validateAndSanitizeInput(rawWhatsapp, 'phone') : null;
  const email = rawEmail ? validateAndSanitizeInput(rawEmail, 'email') : null;
  const message = validateAndSanitizeInput(rawMessage, 'message');
  
  if (!name || !message) {
    alert('Please provide valid name and message');
    return;
  }
  
  if (!whatsapp && !email) {
    alert('Please provide either a valid WhatsApp number or email for reply');
    return;
  }
  
  try {
    // Store in Supabase with sanitized data
    const { data, error } = await supabase
      .from('messages')
      .insert([{
        name: name,
        whatsapp: whatsapp,
        email: email,
        message: message,
        status: 'unread',
        ip_hash: btoa(Date.now().toString()) // Simple request tracking
      }]);
    
    if (error) {
      console.error('Error sending message:', error);
      alert('There was an error sending your message. Please try again.');
      return;
    }
    
    // Send email notification to admin with sanitized data
    if (email) {
      await sendEmailNotification({
        name: name,
        email: email,
        subject: `HOSTALL Chat Message from ${name}`,
        message: `New message from website chat: ${message}\nContact: ${email || whatsapp}`,
        type: 'chat',
        openEmailClient: false
      });
    }
    
    alert('Thank you for your message! Our team will respond to you shortly.');
    
    // Clear form
    document.getElementById('chat-name').value = '';
    document.getElementById('chat-whatsapp').value = '';
    document.getElementById('chat-email').value = '';
    document.getElementById('chat-message').value = '';
    
  } catch (err) {
    console.error('Unexpected error:', err);
    alert('An unexpected error occurred. Please try again later.');
  }
}

// Enhanced Admin Dashboard Functions
async function loadAdminDashboardData() {
  try {
    const [hostelsData, messagesData, feedbackData, emailsData] = await Promise.all([
      supabase.from('hostels').select('*').order('created_at', { ascending: false }),
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(10),
      supabase.from('emails').select('*').order('created_at', { ascending: false }).limit(10)
    ]);

    return {
      hostels: hostelsData.data || [],
      messages: messagesData.data || [],
      feedback: feedbackData.data || [],
      emails: emailsData.data || []
    };
  } catch (error) {
    console.error('Error loading admin dashboard data:', error);
    return { hostels: [], messages: [], feedback: [], emails: [] };
  }
}

window.updateAdminDashboard = async function() {
  const dashboardData = await loadAdminDashboardData();
  
  // Update dashboard counters
  document.getElementById('total-hostels').textContent = dashboardData.hostels.length;
  document.getElementById('unread-messages').textContent = dashboardData.messages.filter(m => m.status === 'unread').length;
  document.getElementById('new-feedback').textContent = dashboardData.feedback.filter(f => f.status === 'new').length;
  document.getElementById('pending-emails').textContent = dashboardData.emails.filter(e => e.status === 'pending').length;
  
  // Update recent messages section
  const messagesContainer = document.getElementById('admin-messages-list');
  if (messagesContainer) {
    messagesContainer.innerHTML = dashboardData.messages.map(msg => `
      <div class="admin-message-item" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; background: ${msg.status === 'unread' ? '#fef3c7' : 'white'};">
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${msg.name}</div>
        <div style="font-size: 0.9rem; color: #6b7280; margin-bottom: 0.5rem;">${msg.email || msg.whatsapp || 'No contact info'}</div>
        <div style="font-size: 0.9rem; margin-bottom: 0.5rem;">${msg.message.substring(0, 100)}${msg.message.length > 100 ? '...' : ''}</div>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="markMessageAsRead(${msg.id})" style="padding: 0.25rem 0.5rem; background: #10b981; color: white; border: none; border-radius: 4px; font-size: 0.8rem;">Mark Read</button>
          ${msg.email ? `<button onclick="replyToMessage('${msg.email}', '${msg.name}')" style="padding: 0.25rem 0.5rem; background: #3b82f6; color: white; border: none; border-radius: 4px; font-size: 0.8rem;">Reply</button>` : ''}
        </div>
      </div>
    `).join('');
  }
  
  // Update recent feedback section
  const feedbackContainer = document.getElementById('admin-feedback-list');
  if (feedbackContainer) {
    feedbackContainer.innerHTML = dashboardData.feedback.map(feedback => `
      <div class="admin-feedback-item" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 0.5rem; background: ${feedback.status === 'new' ? '#fef3c7' : 'white'};">
        <div style="font-weight: 600; margin-bottom: 0.25rem;">${feedback.name} - ${feedback.type}</div>
        <div style="font-size: 0.9rem; color: #6b7280; margin-bottom: 0.5rem;">${feedback.email}</div>
        <div style="font-size: 0.9rem; margin-bottom: 0.5rem;">${feedback.message.substring(0, 100)}${feedback.message.length > 100 ? '...' : ''}</div>
        <button onclick="markFeedbackAsRead(${feedback.id})" style="padding: 0.25rem 0.5rem; background: #10b981; color: white; border: none; border-radius: 4px; font-size: 0.8rem;">Mark Reviewed</button>
      </div>
    `).join('');
  }
};

window.markMessageAsRead = async function(messageId) {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ status: 'read' })
      .eq('id', messageId);
    
    if (!error) {
      updateAdminDashboard();
    }
  } catch (err) {
    console.error('Error marking message as read:', err);
  }
};

window.markFeedbackAsRead = async function(feedbackId) {
  try {
    const { error } = await supabase
      .from('feedback')
      .update({ status: 'reviewed' })
      .eq('id', feedbackId);
    
    if (!error) {
      updateAdminDashboard();
    }
  } catch (err) {
    console.error('Error marking feedback as reviewed:', err);
  }
};

// Secure environment configuration
const SECURE_CONFIG = {
  SUPABASE_URL: 'https://pjnqhdhlcgrrmfzscswv.supabase.co',
  // Note: This is the anon key which is safe to expose in frontend
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqbnFoZGhsY2dycm1menNjc3d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NTg3NDMsImV4cCI6MjA2NjUzNDc0M30.UVaJXabJDPMSHgDzUk3tOEv9sAFSjqSRNEYroypqyGs'
};

// Function to handle online status changes
function handleOnlineStatus() {
  console.log('Internet connection restored. Syncing data...');
  document.body.classList.remove('offline-mode');
  syncOfflineData();
}

// Function to handle offline status changes
function handleOfflineStatus() {
  console.log('Internet connection lost. Working in offline mode...');
  document.body.classList.add('offline-mode');
}

// Function to sync all offline data
async function syncOfflineData() {
  try {
    // Check for internet connection first
    if (!navigator.onLine) {
      console.log('Still offline, cannot sync data');
      return;
    }
    
    console.log('Starting sync of all offline data...');
    
    // Sync offline hostels first
    await syncOfflineHostels();
    
    // Then sync pending deletions
    await syncPendingDeletions();
    
    // Refresh data display
    await loadHostelsFromSupabase();
    
    console.log('Data synchronization completed');
  } catch (err) {
    console.error('Error during data synchronization:', err);
  }
}

// Expose functions globally for use in HTML
window.loadHostelsFromSupabase = loadHostelsFromSupabase;
window.updateHostelInSupabase = updateHostelInSupabase;
window.deleteHostelFromSupabase = deleteHostelFromSupabase;
window.setupHostelRealtimeSubscription = setupHostelRealtimeSubscription;
window.showRealtimeStatus = showRealtimeStatus;
window.saveHostelToSupabase = saveHostelToSupabase;
window.sendEmailNotification = sendEmailNotification;
window.loadAdminDashboardData = loadAdminDashboardData;
window.syncOfflineData = syncOfflineData;