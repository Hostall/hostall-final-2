// HOSTALL Hostel Management Functions
// This file contains all hostel-related functionality

class HostelManager {
  constructor() {
    this.hostels = [];
    this.filters = {
      gender: 'all',
      location: 'all',
      facilities: []
    };
  }

  // Initialize the hostel manager
  async init() {
    await this.loadHostels();
    this.setupEventListeners();
    this.renderHostelCards();
  }

  // Load hostels from Supabase
  async loadHostels() {
    try {
      const client = window.getSupabaseClient();
      if (!client) {
        console.error('❌ Supabase client not available');
        return;
      }

      const { data: hostels, error } = await client
        .from('hostels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading hostels:', error);
        return;
      }

      this.hostels = hostels || [];
      console.log(`✅ Loaded ${this.hostels.length} hostels from database`);
    } catch (error) {
      console.error('❌ Exception loading hostels:', error);
    }
  }

  // Render hostel cards
  renderHostelCards() {
    const hostelGrid = document.getElementById('public-list');
    if (!hostelGrid) return;

    const filteredHostels = this.getFilteredHostels();

    if (filteredHostels.length === 0) {
      hostelGrid.innerHTML = this.getNoHostelsMessage();
      return;
    }

    hostelGrid.innerHTML = '';
    console.log('🏗️ Rendering hostel cards for:', filteredHostels.map(h => h.name));

    filteredHostels.forEach(hostel => {
      const card = this.createHostelCard(hostel);
      hostelGrid.appendChild(card);
    });

    console.log('✅ Rendered', filteredHostels.length, 'hostel cards');
  }

  // Create individual hostel card
  createHostelCard(hostel) {
    const card = document.createElement('div');
    card.className = 'hostel-card';

    const genderClass = hostel.gender?.toLowerCase() || 'any';
    const imageUrl = hostel.img || this.getPlaceholderImage(hostel);

    card.innerHTML = `
      <div class="hostel-image-container">
        <img src="${imageUrl}" 
             class="hostel-image" 
             alt="${hostel.name}"
             onerror="this.src='https://via.placeholder.com/300x200/6b7280/ffffff?text=Hostel+Image'">
        <div class="hostel-gender-badge ${genderClass}">${hostel.gender || 'Any'}</div>
      </div>
      <div class="hostel-content">
        <h3 class="hostel-name">${hostel.name || 'Unnamed Hostel'}</h3>
        <div class="hostel-location-only">
          📍 ${this.getShortLocation(hostel.location)}
        </div>
        <div class="hostel-contact" style="font-size: 0.9rem; color: #6b7280; margin: 0.5rem 0;">
          ${hostel.phone ? `📞 ${hostel.phone}` : ''}
        </div>
        <button class="view-details-btn" onclick="hostelManager.showHostelDetails(${JSON.stringify(hostel).replace(/"/g, '&quot;')})">
          View Details
        </button>
      </div>
    `;

    return card;
  }

  // Show hostel details popup
  showHostelDetails(hostel) {
    const facilities = hostel.facilities ? 
      (Array.isArray(hostel.facilities) ? hostel.facilities.join(', ') : hostel.facilities) : 
      'Not specified';

    // Check if hostel has enhanced data
    const hasEnhancedData = hostel.rent || hostel.monthly_rent || hostel.security_deposit || 
                           hostel.contact_person || hostel.office_hours || hostel.checkin_time ||
                           hostel.other_facilities || hostel.email || hostel.website;

    let details;
    
    if (hasEnhancedData) {
      details = this.getEnhancedDetails(hostel, facilities);
    } else {
      details = this.getSimpleDetails(hostel, facilities);
    }

    alert(details);
  }

  // Get enhanced details format
  getEnhancedDetails(hostel, facilities) {
    let roomPricing = '';
    if (hostel.room_prices && Array.isArray(hostel.room_prices)) {
      roomPricing = '\n\n💰 Room Pricing:\n' + hostel.room_prices.map(price => {
        if (price.type && price.price) {
          return `• ${price.type}: ${price.price} ${price.currency || 'PKR'}${price.per ? ' per ' + price.per : ''}`;
        }
        return '';
      }).filter(item => item).join('\n');
    }

    return `
🏠 HOSTEL DETAILS (Enhanced Information Available)

📍 Name: ${hostel.name || 'Not specified'}
👥 Gender: ${hostel.gender || 'Any'}
🏠 Location: ${hostel.location || 'Not specified'}
📞 Phone: ${hostel.phone || 'Not provided'}
📱 WhatsApp: ${hostel.whatsapp || hostel.phone || 'Not provided'}
📧 Email: ${hostel.email || 'Not provided'}
🌐 Website: ${hostel.website || 'Not provided'}

💵 PRICING & FEES:
• Monthly Rent: ${hostel.rent || hostel.monthly_rent || 'Contact for pricing'}
• Security Deposit: ${hostel.security_deposit || 'Contact for details'}
• Admission Fee: ${hostel.admission_fee || 'Contact for details'}
• Utilities: ${hostel.utilities_included ? 'Included' : (hostel.utilities_cost || 'Ask hostel')}${roomPricing}

🏢 FACILITIES & AMENITIES:
• Basic Facilities: ${facilities}
• Additional Facilities: ${hostel.other_facilities || 'None mentioned'}
• Room Type: ${hostel.room_type || 'Standard rooms'}
• Meals: ${hostel.meals_included ? 'Included' : (hostel.meal_plan || 'Not included')}

👤 CONTACT PERSON:
• Contact Person: ${hostel.contact_person || 'Hostel Manager'}
• Office Hours: ${hostel.office_hours || '9 AM - 6 PM'}
• Emergency Contact: ${hostel.emergency_contact || hostel.phone || 'Same as main number'}

📋 RULES & POLICIES:
• Check-in Time: ${hostel.checkin_time || '12:00 PM onwards'}
• Check-out Time: ${hostel.checkout_time || '11:00 AM'}
• Visitor Policy: ${hostel.visitor_policy || 'Check with management'}
• Curfew: ${hostel.curfew || 'Ask hostel for details'}
• Age Limit: ${hostel.age_limit || '18-30 years'}

🚗 TRANSPORTATION:
• Nearby Universities: ${hostel.nearby_universities || 'Contact for details'}
• Public Transport: ${hostel.transport_access || 'Available'}
• Parking: ${hostel.parking || 'Check availability'}

ℹ️ ADDITIONAL INFORMATION:
${hostel.details || 'No additional details provided'}

📍 LOCATION & MAP:
${hostel.map ? '🗺️ View on Google Maps: ' + hostel.map : '❌ Map not provided - Ask for address details'}

---
📝 Note: Please contact the hostel directly to confirm all details, pricing, and availability before making any decisions.
    `;
  }

  // Get simple details format
  getSimpleDetails(hostel, facilities) {
    return `HOSTEL DETAILS

📍 Name: ${hostel.name || 'Not specified'}
👥 Gender: ${hostel.gender || 'Any'}
🏠 Location: ${hostel.location || 'Not specified'}
📞 Phone: ${hostel.phone || 'Not provided'}
📱 WhatsApp: ${hostel.whatsapp || hostel.phone || 'Not provided'}
🏢 Facilities: ${facilities}

Additional Information:
${hostel.details || 'No additional details'}

${hostel.map ? '🗺️ View on map: ' + hostel.map : '❌ Map not provided'}`;
  }

  // Helper functions
  getPlaceholderImage(hostel) {
    const genderColor = hostel.gender === 'Female' ? 'ff69b4' : 
                       hostel.gender === 'Male' ? '4169e1' : '6b7280';
    return `https://via.placeholder.com/300x200/${genderColor}/ffffff?text=${encodeURIComponent(hostel.name || 'Hostel')}`;
  }

  getShortLocation(location) {
    if (!location) return 'Location not specified';
    return location.split(',')[0] || location;
  }

  getFilteredHostels() {
    return this.hostels.filter(hostel => {
      // Gender filter
      if (this.filters.gender !== 'all' && hostel.gender !== this.filters.gender) {
        return false;
      }
      
      // Location filter (implement as needed)
      if (this.filters.location !== 'all' && !hostel.location?.toLowerCase().includes(this.filters.location.toLowerCase())) {
        return false;
      }
      
      // Facilities filter (implement as needed)
      if (this.filters.facilities.length > 0) {
        const hostelFacilities = Array.isArray(hostel.facilities) ? hostel.facilities : [];
        const hasRequiredFacilities = this.filters.facilities.every(facility => 
          hostelFacilities.includes(facility)
        );
        if (!hasRequiredFacilities) return false;
      }
      
      return true;
    });
  }

  getNoHostelsMessage() {
    return `
      <div style="grid-column: 1/-1; text-align: center; padding: 2rem; background: #f9fafb; border-radius: 10px; margin: 1rem;">
        <h3 style="color: #dc2626; margin-bottom: 1rem;">⚠️ No Hostels Found</h3>
        <p style="color: #6b7280; margin-bottom: 1rem;">We're having trouble loading hostel data right now.</p>
        <button onclick="location.reload()" style="background: #8B5CF6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 5px; cursor: pointer;">
          🔄 Refresh Page
        </button>
        <p style="font-size: 0.8rem; color: #9ca3af; margin-top: 1rem;">
          If this problem persists, please contact support.
        </p>
      </div>
    `;
  }

  setupEventListeners() {
    // Add event listeners for filters, search, etc.
    // Implementation can be added as needed
  }
}

// Global hostel manager instance
window.hostelManager = new HostelManager();

// Global functions for backward compatibility
window.showHostelDetails = (hostel) => window.hostelManager.showHostelDetails(hostel);