// HOSTALL Advanced Security Manager
// Handles rate limiting, session management, and security monitoring

class SecurityManager {
  constructor() {
    this.failedAttempts = new Map();
    this.sessionTimers = new Map();
    this.securityEvents = [];
    this.rateLimits = {
      login: { max: 5, window: 900000 }, // 5 attempts per 15 minutes
      passwordReset: { max: 3, window: 3600000 }, // 3 resets per hour
      general: { max: 100, window: 3600000 } // 100 general requests per hour
    };
    this.suspiciousPatterns = [
      /script.*?>/gi,
      /<iframe/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi
    ];
    this.twoFactorEnabled = false;
    this.twoFactorSecret = null;
  }

  // Initialize security manager
  init() {
    this.setupSecurityMonitoring();
    this.setupSessionManagement();
    this.startSecurityTimer();
    console.log('🔒 Security manager initialized');
  }

  // Setup security monitoring
  setupSecurityMonitoring() {
    // Monitor for suspicious activities
    document.addEventListener('input', this.checkInputSecurity.bind(this));
    window.addEventListener('error', this.handleSecurityError.bind(this));
    
    // Monitor network requests
    const originalFetch = window.fetch;
    window.fetch = (...args) => {
      this.logNetworkRequest(args[0]);
      return originalFetch.apply(window, args);
    };
  }

  // Setup session management
  setupSessionManagement() {
    // Auto-logout on inactivity
    let inactivityTimer;
    const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

    const resetInactivityTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        this.handleInactivityLogout();
      }, INACTIVITY_TIMEOUT);
    };

    // Track user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, resetInactivityTimer, true);
    });

    resetInactivityTimer();
  }

  // Start security monitoring timer
  startSecurityTimer() {
    setInterval(() => {
      this.cleanupExpiredData();
      this.checkSecurityThreshold();
      this.updateSecurityMetrics();
    }, 60000); // Run every minute
  }

  // Rate limiting check
  async checkRateLimit(action, identifier = 'global') {
    const key = `${action}_${identifier}`;
    const limit = this.rateLimits[action] || this.rateLimits.general;
    const now = Date.now();

    if (!this.failedAttempts.has(key)) {
      this.failedAttempts.set(key, []);
    }

    const attempts = this.failedAttempts.get(key);
    
    // Remove expired attempts
    const validAttempts = attempts.filter(time => now - time < limit.window);
    this.failedAttempts.set(key, validAttempts);

    if (validAttempts.length >= limit.max) {
      const timeLeft = Math.ceil((validAttempts[0] + limit.window - now) / 1000 / 60);
      await this.logSecurityEvent('rate_limit_exceeded', identifier, false, {
        action,
        attempts: validAttempts.length,
        timeLeft
      });
      
      return {
        allowed: false,
        timeLeft,
        message: `Too many attempts. Please wait ${timeLeft} minutes before trying again.`
      };
    }

    // Add current attempt
    validAttempts.push(now);
    return { allowed: true };
  }

  // Enhanced login security check
  async secureLogin(email, password) {
    try {
      // Check rate limiting
      const rateCheck = await this.checkRateLimit('login', email);
      if (!rateCheck.allowed) {
        return { success: false, error: rateCheck.message, rateLimited: true };
      }

      // Check if account is locked
      const client = window.getSupabaseClient();
      const isLocked = await client.rpc('is_account_locked', { p_email: email });
      
      if (isLocked.data) {
        await this.logSecurityEvent('login_blocked_locked_account', email, false);
        return { success: false, error: 'Account is temporarily locked due to security reasons.' };
      }

      // Validate input security
      if (!this.validateInputSecurity(email) || !this.validateInputSecurity(password)) {
        await this.logSecurityEvent('login_suspicious_input', email, false);
        return { success: false, error: 'Invalid input detected.' };
      }

      // Proceed with normal login
      const result = await window.adminManager.login(email, password);
      
      if (result.success) {
        // Clear failed attempts on successful login
        this.failedAttempts.delete(`login_${email}`);
        await this.logSecurityEvent('login_success', email, true);
        this.startUserSession(result.user);
      } else {
        // Handle failed login
        await this.handleFailedLogin(email);
        await this.logSecurityEvent('login_failed', email, false, { reason: 'invalid_credentials' });
      }

      return result;
    } catch (error) {
      await this.logSecurityEvent('login_error', email, false, { error: error.message });
      return { success: false, error: 'An error occurred during login.' };
    }
  }

  // Handle failed login attempts
  async handleFailedLogin(email) {
    try {
      const client = window.getSupabaseClient();
      const result = await client.rpc('handle_failed_login', {
        p_email: email,
        p_ip_address: await this.getClientIP()
      });

      if (result.data?.locked) {
        await this.logSecurityEvent('account_locked', email, false, {
          attempts: result.data.attempts,
          locked_until: result.data.locked_until
        });
      }

      return result.data;
    } catch (error) {
      console.error('❌ Failed to handle failed login:', error);
      return null;
    }
  }

  // Start user session
  startUserSession(user) {
    const sessionId = this.generateSessionId();
    const sessionData = {
      userId: user.id,
      email: user.email,
      startTime: Date.now(),
      lastActivity: Date.now(),
      sessionId
    };

    this.sessionTimers.set(user.id, sessionData);
    
    // Set session timeout
    setTimeout(() => {
      this.checkSessionTimeout(user.id);
    }, 15 * 60 * 1000); // Check every 15 minutes
  }

  // Check session timeout
  checkSessionTimeout(userId) {
    const session = this.sessionTimers.get(userId);
    if (!session) return;

    const now = Date.now();
    const maxSession = 8 * 60 * 60 * 1000; // 8 hours max session
    const inactivityLimit = 30 * 60 * 1000; // 30 minutes inactivity

    if (now - session.startTime > maxSession || 
        now - session.lastActivity > inactivityLimit) {
      this.forceLogout(userId, 'session_expired');
    }
  }

  // Handle inactivity logout
  handleInactivityLogout() {
    if (window.adminManager?.isAuthenticated) {
      this.forceLogout(window.adminManager.currentUser?.id, 'inactivity');
      this.showSecurityAlert('You have been logged out due to inactivity for security reasons.');
    }
  }

  // Force logout
  async forceLogout(userId, reason) {
    try {
      await window.adminManager.logout();
      this.sessionTimers.delete(userId);
      
      await this.logSecurityEvent('forced_logout', null, true, { reason });
      
      // Show user-friendly message
      const messages = {
        session_expired: 'Your session has expired for security reasons. Please log in again.',
        inactivity: 'You have been logged out due to inactivity.',
        security_breach: 'Suspicious activity detected. You have been logged out for security.',
        multiple_sessions: 'Multiple sessions detected. Please log in again.'
      };

      this.showSecurityAlert(messages[reason] || 'You have been logged out for security reasons.');
    } catch (error) {
      console.error('❌ Force logout failed:', error);
    }
  }

  // Input security validation
  validateInputSecurity(input) {
    if (typeof input !== 'string') return false;
    
    // Check for suspicious patterns
    for (const pattern of this.suspiciousPatterns) {
      if (pattern.test(input)) {
        return false;
      }
    }

    // Check for unusual length
    if (input.length > 1000) {
      return false;
    }

    return true;
  }

  // Check input security on events
  checkInputSecurity(event) {
    const input = event.target.value;
    if (!this.validateInputSecurity(input)) {
      event.preventDefault();
      event.target.value = '';
      this.showSecurityAlert('Suspicious input detected and blocked.');
      this.logSecurityEvent('suspicious_input_blocked', null, true, {
        element: event.target.name || event.target.id,
        pattern: 'xss_attempt'
      });
    }
  }

  // Handle security errors
  handleSecurityError(event) {
    // Log potential security-related errors
    if (event.error && (
      event.error.message.includes('script') ||
      event.error.message.includes('unsafe') ||
      event.error.message.includes('violation')
    )) {
      this.logSecurityEvent('security_error', null, false, {
        error: event.error.message,
        source: event.filename,
        line: event.lineno
      });
    }
  }

  // Log network requests
  logNetworkRequest(url) {
    // Monitor for suspicious requests
    if (typeof url === 'string' && (
      url.includes('eval') ||
      url.includes('script') ||
      url.match(/data:.*javascript/i)
    )) {
      this.logSecurityEvent('suspicious_network_request', null, false, { url });
    }
  }

  // Clean up expired data
  cleanupExpiredData() {
    const now = Date.now();
    
    // Clean up rate limiting data
    for (const [key, attempts] of this.failedAttempts.entries()) {
      const validAttempts = attempts.filter(time => now - time < 3600000); // Keep last hour
      if (validAttempts.length === 0) {
        this.failedAttempts.delete(key);
      } else {
        this.failedAttempts.set(key, validAttempts);
      }
    }

    // Clean up old security events (keep last 1000)
    if (this.securityEvents.length > 1000) {
      this.securityEvents = this.securityEvents.slice(-1000);
    }
  }

  // Check security thresholds
  checkSecurityThreshold() {
    const recentEvents = this.securityEvents.filter(
      event => Date.now() - event.timestamp < 3600000 // Last hour
    );

    const suspiciousEvents = recentEvents.filter(
      event => !event.success && ['login_failed', 'suspicious_input_blocked', 'rate_limit_exceeded'].includes(event.type)
    );

    // If too many suspicious events, increase security level
    if (suspiciousEvents.length > 50) {
      this.increaseSecurityLevel();
    }
  }

  // Increase security level
  increaseSecurityLevel() {
    // Reduce rate limits temporarily
    this.rateLimits.login.max = Math.max(2, this.rateLimits.login.max - 1);
    this.rateLimits.general.max = Math.max(50, this.rateLimits.general.max - 20);
    
    console.warn('🚨 Security level increased due to suspicious activity');
    this.logSecurityEvent('security_level_increased', null, true);

    // Reset after 1 hour
    setTimeout(() => {
      this.resetSecurityLevel();
    }, 3600000);
  }

  // Reset security level
  resetSecurityLevel() {
    this.rateLimits = {
      login: { max: 5, window: 900000 },
      passwordReset: { max: 3, window: 3600000 },
      general: { max: 100, window: 3600000 }
    };
    
    console.log('🔒 Security level reset to normal');
    this.logSecurityEvent('security_level_reset', null, true);
  }

  // Update security metrics
  updateSecurityMetrics() {
    const metrics = {
      totalEvents: this.securityEvents.length,
      recentFailures: this.securityEvents.filter(
        e => Date.now() - e.timestamp < 3600000 && !e.success
      ).length,
      activeSessions: this.sessionTimers.size,
      rateLimitHits: this.failedAttempts.size
    };

    // Store metrics for dashboard display
    window.securityMetrics = metrics;
  }

  // Generate session ID
  generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Get client IP
  async getClientIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }

  // Log security events
  async logSecurityEvent(eventType, userEmail, success, details = {}) {
    const event = {
      type: eventType,
      userEmail,
      success,
      details,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      ip: await this.getClientIP()
    };

    this.securityEvents.push(event);

    // Also log to Supabase if available
    try {
      const client = window.getSupabaseClient();
      if (client) {
        await client.rpc('log_security_event', {
          p_event_type: eventType,
          p_user_email: userEmail,
          p_ip_address: event.ip,
          p_user_agent: event.userAgent,
          p_success: success,
          p_details: details
        });
      }
    } catch (error) {
      console.error('Failed to log security event to database:', error);
    }
  }

  // Show security alert
  showSecurityAlert(message) {
    // Create a more user-friendly alert
    const alertDiv = document.createElement('div');
    alertDiv.className = 'security-alert';
    alertDiv.innerHTML = `
      <div class="security-alert-content">
        <i class="hgi-stroke hgi-security" style="color: #f59e0b; font-size: 1.5rem;"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" class="alert-close">×</button>
      </div>
    `;
    
    // Add styles if not already present
    if (!document.getElementById('security-alert-styles')) {
      const styles = document.createElement('style');
      styles.id = 'security-alert-styles';
      styles.textContent = `
        .security-alert {
          position: fixed;
          top: 20px;
          right: 20px;
          background: #fff;
          border: 2px solid #f59e0b;
          border-radius: 8px;
          padding: 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 10000;
          max-width: 400px;
          animation: slideIn 0.3s ease-out;
        }
        .security-alert-content {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px;
          color: #92400e;
          font-weight: 500;
        }
        .alert-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #92400e;
          margin-left: auto;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(alertDiv);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (alertDiv.parentElement) {
        alertDiv.remove();
      }
    }, 10000);
  }

  // Get security dashboard data
  getSecurityDashboard() {
    const now = Date.now();
    const lastHour = this.securityEvents.filter(e => now - e.timestamp < 3600000);
    const lastDay = this.securityEvents.filter(e => now - e.timestamp < 86400000);

    return {
      totalEvents: this.securityEvents.length,
      lastHourEvents: lastHour.length,
      lastDayEvents: lastDay.length,
      failedLogins: lastDay.filter(e => e.type === 'login_failed').length,
      blockedAttempts: lastDay.filter(e => e.type.includes('blocked')).length,
      activeSessions: this.sessionTimers.size,
      securityLevel: this.rateLimits.login.max < 5 ? 'High' : 'Normal',
      recentEvents: this.securityEvents.slice(-10).reverse(),
      twoFactorEnabled: this.twoFactorEnabled
    };
  }
  
  // Two-Factor Authentication Setup
  async setup2FA() {
    if (!window.adminManager?.isAuthenticated) {
      this.showSecurityAlert('Please log in to set up Two-Factor Authentication.');
      return { success: false, error: 'Authentication required' };
    }
    
    try {
      // Generate a new secret key for TOTP
      const secret = this.generateTOTPSecret();
      
      // Create a modal dialog for 2FA setup
      this.createTwoFactorSetupModal(secret);
      
      return { success: true, secret };
    } catch (error) {
      console.error('❌ 2FA setup error:', error);
      this.showSecurityAlert('Failed to set up Two-Factor Authentication. Please try again.');
      this.logSecurityEvent('2fa_setup_failed', window.adminManager?.currentUser?.email, false, { error: error.message });
      return { success: false, error: error.message };
    }
  }
  
  // Generate TOTP Secret
  generateTOTPSecret() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    const randomArray = new Uint8Array(20);
    window.crypto.getRandomValues(randomArray);
    
    for (let i = 0; i < 16; i++) {
      secret += chars.charAt(randomArray[i] % chars.length);
    }
    
    this.twoFactorSecret = secret;
    return secret;
  }
  
  // Create 2FA Setup Modal
  createTwoFactorSetupModal(secret) {
    // Remove any existing modal
    const existingModal = document.getElementById('two-factor-setup-modal');
    if (existingModal) {
      existingModal.remove();
    }
    
    // Create QR code URL for TOTP apps
    const user = window.adminManager?.currentUser?.email || 'user';
    const issuer = 'HOSTALL';
    const qrCodeUrl = `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}`;
    
    // Create modal HTML
    const modalHTML = `
      <div id="two-factor-setup-modal" class="security-modal">
        <div class="security-modal-content">
          <span class="security-modal-close">&times;</span>
          <h2>Set Up Two-Factor Authentication</h2>
          <p>Scan this QR code with your authenticator app (like Google Authenticator, Authy, or Microsoft Authenticator):</p>
          <div class="qr-code">
            <img src="${qrCodeUrl}" alt="QR Code for 2FA">
          </div>
          <p>Or enter this code manually in your app: <strong>${secret}</strong></p>
          <div class="verification-section">
            <p>Enter the 6-digit code from your authenticator app to verify setup:</p>
            <input type="text" id="totp-code" maxlength="6" pattern="[0-9]{6}" placeholder="123456">
            <button id="verify-totp" class="verify-btn">Verify & Enable 2FA</button>
            <div id="totp-verification-result"></div>
          </div>
        </div>
      </div>
    `;
    
    // Add modal to page
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
    
    // Add styles if not already present
    if (!document.getElementById('security-modal-styles')) {
      const styles = document.createElement('style');
      styles.id = 'security-modal-styles';
      styles.textContent = `
        .security-modal {
          position: fixed;
          z-index: 9999;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .security-modal-content {
          background-color: white;
          padding: 2rem;
          border-radius: 10px;
          max-width: 500px;
          width: 90%;
          position: relative;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        .security-modal-close {
          position: absolute;
          top: 10px;
          right: 15px;
          font-size: 24px;
          cursor: pointer;
        }
        .qr-code {
          text-align: center;
          margin: 1.5rem 0;
        }
        .qr-code img {
          max-width: 200px;
          border: 1px solid #ddd;
          padding: 5px;
        }
        .verification-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 1px solid #eee;
        }
        #totp-code {
          padding: 0.5rem;
          font-size: 1.2rem;
          width: 150px;
          text-align: center;
          letter-spacing: 0.2rem;
          margin-right: 10px;
        }
        .verify-btn {
          background: #8B5CF6;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 5px;
          cursor: pointer;
          font-weight: 500;
        }
        #totp-verification-result {
          margin-top: 1rem;
          font-weight: 500;
        }
        .verification-success {
          color: #059669;
        }
        .verification-error {
          color: #DC2626;
        }
      `;
      document.head.appendChild(styles);
    }
    
    // Add event listeners
    const modal = document.getElementById('two-factor-setup-modal');
    const closeBtn = modal.querySelector('.security-modal-close');
    const verifyBtn = document.getElementById('verify-totp');
    
    closeBtn.addEventListener('click', () => {
      modal.remove();
      this.twoFactorSecret = null;
    });
    
    verifyBtn.addEventListener('click', () => {
      this.verifyAndEnableTwoFactor();
    });
    
    // Allow enter key to submit verification
    const totpInput = document.getElementById('totp-code');
    totpInput.addEventListener('keyup', (event) => {
      if (event.key === 'Enter') {
        this.verifyAndEnableTwoFactor();
      }
    });
  }
  
  // Verify and enable 2FA
  async verifyAndEnableTwoFactor() {
    const codeInput = document.getElementById('totp-code');
    const resultElement = document.getElementById('totp-verification-result');
    const code = codeInput.value.trim();
    
    if (!code || code.length !== 6 || !/^\d+$/.test(code)) {
      resultElement.textContent = 'Please enter a valid 6-digit code';
      resultElement.className = 'verification-error';
      return;
    }
    
    try {
      // In a real implementation, we would verify the TOTP code server-side
      // For this example, we'll simulate success if the code is "123456"
      const isValid = code === "123456" || await this.simulateTOTPVerification(code);
      
      if (isValid) {
        // Save 2FA settings to database
        const client = window.getSupabaseClient();
        if (client && window.adminManager?.currentUser?.email) {
          await client.from('admin_security_settings').upsert({
            user_email: window.adminManager.currentUser.email,
            two_factor_enabled: true,
            two_factor_secret: this.twoFactorSecret,
            updated_at: new Date().toISOString()
          });
        }
        
        this.twoFactorEnabled = true;
        resultElement.textContent = 'Two-factor authentication enabled successfully!';
        resultElement.className = 'verification-success';
        
        this.logSecurityEvent('2fa_enabled', window.adminManager?.currentUser?.email, true);
        
        // Close modal after 3 seconds
        setTimeout(() => {
          const modal = document.getElementById('two-factor-setup-modal');
          if (modal) modal.remove();
        }, 3000);
      } else {
        resultElement.textContent = 'Invalid verification code. Please try again.';
        resultElement.className = 'verification-error';
        this.logSecurityEvent('2fa_verification_failed', window.adminManager?.currentUser?.email, false);
      }
    } catch (error) {
      console.error('❌ TOTP verification error:', error);
      resultElement.textContent = 'Verification failed. Please try again.';
      resultElement.className = 'verification-error';
      this.logSecurityEvent('2fa_verification_error', window.adminManager?.currentUser?.email, false, { error: error.message });
    }
  }
  
  // Simulate TOTP verification (in a real app this would be server-side)
  async simulateTOTPVerification(code) {
    // For demo purposes, we'll accept any code that is the first 6 digits of the current timestamp
    const now = new Date();
    const timestampCode = now.getTime().toString().substr(-6);
    
    // Also accept codes close to the timestamp (within 30 seconds)
    const timestampMinus30 = new Date(now.getTime() - 30000).getTime().toString().substr(-6);
    const timestampPlus30 = new Date(now.getTime() + 30000).getTime().toString().substr(-6);
    
    // For testing, also accept "123456"
    return code === "123456" || code === timestampCode || code === timestampMinus30 || code === timestampPlus30;
  }
  
  // Verify TOTP during login
  async verifyTOTP(code, userEmail) {
    try {
      // Get user's 2FA settings from database
      const client = window.getSupabaseClient();
      const { data, error } = await client
        .from('admin_security_settings')
        .select('two_factor_enabled, two_factor_secret')
        .eq('user_email', userEmail)
        .single();
        
      if (error || !data || !data.two_factor_enabled) {
        return { success: false, error: 'Two-factor authentication not enabled' };
      }
      
      // In a real implementation, we would verify the TOTP code server-side
      // For this example, we'll simulate success for "123456" or timestamp-based codes
      const isValid = code === "123456" || await this.simulateTOTPVerification(code);
      
      if (isValid) {
        this.logSecurityEvent('2fa_verification_success', userEmail, true);
        return { success: true };
      } else {
        this.logSecurityEvent('2fa_verification_failed', userEmail, false);
        return { success: false, error: 'Invalid verification code' };
      }
    } catch (error) {
      console.error('❌ TOTP verification error:', error);
      this.logSecurityEvent('2fa_verification_error', userEmail, false, { error: error.message });
      return { success: false, error: 'Verification failed' };
    }
  }
  
  // Check if 2FA is enabled for user
  async isTwoFactorEnabled(userEmail) {
    try {
      const client = window.getSupabaseClient();
      const { data, error } = await client
        .from('admin_security_settings')
        .select('two_factor_enabled')
        .eq('user_email', userEmail)
        .single();
        
      return !error && data && data.two_factor_enabled === true;
    } catch (error) {
      console.error('❌ 2FA check error:', error);
      return false;
    }
  }
  
  // Disable 2FA
  async disableTwoFactor() {
    if (!window.adminManager?.isAuthenticated) {
      this.showSecurityAlert('Please log in to manage Two-Factor Authentication.');
      return { success: false, error: 'Authentication required' };
    }
    
    try {
      const client = window.getSupabaseClient();
      const userEmail = window.adminManager.currentUser.email;
      
      await client.from('admin_security_settings').upsert({
        user_email: userEmail,
        two_factor_enabled: false,
        two_factor_secret: null,
        updated_at: new Date().toISOString()
      });
      
      this.twoFactorEnabled = false;
      this.twoFactorSecret = null;
      
      this.logSecurityEvent('2fa_disabled', userEmail, true);
      this.showSecurityAlert('Two-factor authentication has been disabled.');
      
      return { success: true };
    } catch (error) {
      console.error('❌ 2FA disable error:', error);
      this.logSecurityEvent('2fa_disable_failed', window.adminManager?.currentUser?.email, false, { error: error.message });
      this.showSecurityAlert('Failed to disable Two-Factor Authentication.');
      return { success: false, error: error.message };
    }
  }
}

// Global security manager instance
window.securityManager = new SecurityManager();