// HOSTALL Password Management System
// Handles password reset, change, and security features

class PasswordManager {
  constructor() {
    this.resetTokens = new Map();
    this.emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    this.passwordStrengthRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  }

  // Initialize password manager
  init() {
    this.setupEventListeners();
    this.setupPasswordValidation();
    console.log('✅ Password manager initialized');
  }

  // Setup event listeners for password forms
  setupEventListeners() {
    // Forgot password form
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (forgotPasswordForm) {
      forgotPasswordForm.addEventListener('submit', this.handleForgotPassword.bind(this));
    }

    // Reset password form
    const resetPasswordForm = document.getElementById('reset-password-form');
    if (resetPasswordForm) {
      resetPasswordForm.addEventListener('submit', this.handleResetPassword.bind(this));
    }

    // Change password form
    const changePasswordForm = document.getElementById('change-password-form');
    if (changePasswordForm) {
      changePasswordForm.addEventListener('submit', this.handleChangePassword.bind(this));
    }

    // Show forgot password link
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
      forgotPasswordLink.addEventListener('click', this.showForgotPasswordForm.bind(this));
    }

    // Back to login links
    document.querySelectorAll('.back-to-login').forEach(link => {
      link.addEventListener('click', this.showLoginForm.bind(this));
    });
  }

  // Setup real-time password validation
  setupPasswordValidation() {
    const passwordInputs = document.querySelectorAll('input[type="password"][data-validate]');
    passwordInputs.forEach(input => {
      input.addEventListener('input', this.validatePasswordStrength.bind(this));
    });

    const confirmPasswordInputs = document.querySelectorAll('input[name="confirm-password"]');
    confirmPasswordInputs.forEach(input => {
      input.addEventListener('input', this.validatePasswordMatch.bind(this));
    });
  }

  // Handle forgot password request
  async handleForgotPassword(event) {
    event.preventDefault();
    
    const emailInput = document.getElementById('forgot-email');
    const email = emailInput.value.trim();

    if (!this.validateEmail(email)) {
      this.showError('forgot-password-error', 'Please enter a valid email address');
      return;
    }

    try {
      this.showLoading('forgot-password-submit', true);
      
      // Check if user exists
      const client = window.getSupabaseClient();
      const { data: admin, error } = await client
        .from('admins')
        .select('user_email, role')
        .eq('user_email', email)
        .single();

      if (error || !admin) {
        // Don't reveal if email exists or not for security
        this.showSuccess('forgot-password-success', 'If an account exists with this email, a password reset link has been sent.');
        this.logSecurityEvent('password_reset_requested', email, false, { reason: 'user_not_found' });
        return;
      }

      // Generate reset token
      const resetToken = this.generateSecureToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token in database
      const { error: tokenError } = await client
        .from('password_reset_tokens')
        .insert({
          user_email: email,
          token: resetToken,
          expires_at: expiresAt.toISOString()
        });

      if (tokenError) {
        throw new Error('Failed to generate reset token');
      }

      // Send reset email (simulated - in real app, use email service)
      await this.sendPasswordResetEmail(email, resetToken);
      
      this.showSuccess('forgot-password-success', 'A password reset link has been sent to your email address.');
      this.logSecurityEvent('password_reset_requested', email, true);
      
      // Clear form
      emailInput.value = '';

    } catch (error) {
      console.error('Forgot password error:', error);
      this.showError('forgot-password-error', 'An error occurred. Please try again later.');
      this.logSecurityEvent('password_reset_requested', email, false, { error: error.message });
    } finally {
      this.showLoading('forgot-password-submit', false);
    }
  }

  // Handle password reset
  async handleResetPassword(event) {
    event.preventDefault();
    
    const tokenInput = document.getElementById('reset-token');
    const passwordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-new-password');
    
    const token = tokenInput.value.trim();
    const newPassword = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validate inputs
    if (!token) {
      this.showError('reset-password-error', 'Reset token is required');
      return;
    }

    if (!this.isPasswordStrong(newPassword)) {
      this.showError('reset-password-error', 'Password must be at least 8 characters with uppercase, lowercase, number and special character');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showError('reset-password-error', 'Passwords do not match');
      return;
    }

    try {
      this.showLoading('reset-password-submit', true);
      
      const client = window.getSupabaseClient();
      
      // Verify reset token
      const { data: resetData, error: tokenError } = await client
        .from('password_reset_tokens')
        .select('user_email, expires_at, used')
        .eq('token', token)
        .single();

      if (tokenError || !resetData) {
        this.showError('reset-password-error', 'Invalid or expired reset token');
        this.logSecurityEvent('password_reset_failed', null, false, { reason: 'invalid_token' });
        return;
      }

      if (resetData.used) {
        this.showError('reset-password-error', 'This reset token has already been used');
        this.logSecurityEvent('password_reset_failed', resetData.user_email, false, { reason: 'token_already_used' });
        return;
      }

      if (new Date(resetData.expires_at) < new Date()) {
        this.showError('reset-password-error', 'Reset token has expired');
        this.logSecurityEvent('password_reset_failed', resetData.user_email, false, { reason: 'token_expired' });
        return;
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password and mark token as used
      const { error: updateError } = await client
        .from('admins')
        .update({
          password_hash: hashedPassword,
          last_password_change: new Date().toISOString(),
          failed_login_count: 0,
          locked_until: null
        })
        .eq('user_email', resetData.user_email);

      if (updateError) {
        throw new Error('Failed to update password');
      }

      // Mark token as used
      await client
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('token', token);

      // Clear failed login attempts
      await client
        .from('failed_login_attempts')
        .delete()
        .eq('user_email', resetData.user_email);

      this.showSuccess('reset-password-success', 'Password has been reset successfully. You can now log in with your new password.');
      this.logSecurityEvent('password_reset_completed', resetData.user_email, true);

      // Clear form and redirect to login after delay
      setTimeout(() => {
        this.showLoginForm();
      }, 3000);

    } catch (error) {
      console.error('Reset password error:', error);
      this.showError('reset-password-error', 'An error occurred. Please try again.');
      this.logSecurityEvent('password_reset_failed', null, false, { error: error.message });
    } finally {
      this.showLoading('reset-password-submit', false);
    }
  }

  // Handle password change for logged-in users
  async handleChangePassword(event) {
    event.preventDefault();
    
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('change-new-password');
    const confirmPasswordInput = document.getElementById('change-confirm-password');
    
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validate inputs
    if (!currentPassword) {
      this.showError('change-password-error', 'Current password is required');
      return;
    }

    if (!this.isPasswordStrong(newPassword)) {
      this.showError('change-password-error', 'New password must be at least 8 characters with uppercase, lowercase, number and special character');
      return;
    }

    if (newPassword !== confirmPassword) {
      this.showError('change-password-error', 'New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      this.showError('change-password-error', 'New password must be different from current password');
      return;
    }

    try {
      this.showLoading('change-password-submit', true);
      
      const client = window.getSupabaseClient();
      const currentUser = window.adminManager.currentUser;
      
      if (!currentUser) {
        this.showError('change-password-error', 'Please log in first');
        return;
      }

      // Verify current password
      const { data: admin, error } = await client
        .from('admins')
        .select('password_hash')
        .eq('user_email', currentUser.email)
        .single();

      if (error || !admin) {
        this.showError('change-password-error', 'Unable to verify current password');
        return;
      }

      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, admin.password_hash);
      if (!isCurrentPasswordValid) {
        this.showError('change-password-error', 'Current password is incorrect');
        this.logSecurityEvent('password_change_failed', currentUser.email, false, { reason: 'wrong_current_password' });
        return;
      }

      // Hash new password
      const hashedPassword = await this.hashPassword(newPassword);

      // Update password
      const { error: updateError } = await client
        .from('admins')
        .update({
          password_hash: hashedPassword,
          last_password_change: new Date().toISOString()
        })
        .eq('user_email', currentUser.email);

      if (updateError) {
        throw new Error('Failed to update password');
      }

      this.showSuccess('change-password-success', 'Password changed successfully!');
      this.logSecurityEvent('password_changed', currentUser.email, true);

      // Clear form
      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      confirmPasswordInput.value = '';

    } catch (error) {
      console.error('Change password error:', error);
      this.showError('change-password-error', 'An error occurred. Please try again.');
      this.logSecurityEvent('password_change_failed', currentUser?.email, false, { error: error.message });
    } finally {
      this.showLoading('change-password-submit', false);
    }
  }

  // Show forgot password form
  showForgotPasswordForm() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('forgot-password-form-container').classList.remove('hidden');
    document.getElementById('reset-password-form-container').classList.add('hidden');
  }

  // Show reset password form
  showResetPasswordForm() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('forgot-password-form-container').classList.add('hidden');
    document.getElementById('reset-password-form-container').classList.remove('hidden');
  }

  // Show login form
  showLoginForm() {
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('forgot-password-form-container').classList.add('hidden');
    document.getElementById('reset-password-form-container').classList.add('hidden');
    this.clearAllMessages();
  }

  // Password strength validation
  validatePasswordStrength(event) {
    const password = event.target.value;
    const strengthIndicator = document.getElementById('password-strength');
    
    if (!strengthIndicator) return;

    const strength = this.calculatePasswordStrength(password);
    strengthIndicator.className = `password-strength ${strength.class}`;
    strengthIndicator.textContent = strength.text;
  }

  // Password match validation
  validatePasswordMatch(event) {
    const confirmPassword = event.target.value;
    const passwordInput = event.target.form.querySelector('input[type="password"]:not([name="confirm-password"])');
    const matchIndicator = document.getElementById('password-match');
    
    if (!passwordInput || !matchIndicator) return;

    const password = passwordInput.value;
    
    if (confirmPassword === '') {
      matchIndicator.textContent = '';
      return;
    }

    if (password === confirmPassword) {
      matchIndicator.className = 'password-match match';
      matchIndicator.textContent = '✓ Passwords match';
    } else {
      matchIndicator.className = 'password-match no-match';
      matchIndicator.textContent = '✗ Passwords do not match';
    }
  }

  // Calculate password strength
  calculatePasswordStrength(password) {
    if (password.length < 6) {
      return { class: 'weak', text: 'Weak - Too short' };
    }
    
    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[@$!%*?&]/.test(password)) score++;
    
    if (score < 3) {
      return { class: 'weak', text: 'Weak - Add more variety' };
    } else if (score < 5) {
      return { class: 'medium', text: 'Medium - Almost there' };
    } else {
      return { class: 'strong', text: 'Strong - Excellent!' };
    }
  }

  // Check if password meets strength requirements
  isPasswordStrong(password) {
    return this.passwordStrengthRegex.test(password);
  }

  // Validate email format
  validateEmail(email) {
    return this.emailRegex.test(email);
  }

  // Generate secure token
  generateSecureToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Hash password (in real app, this should be done server-side)
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'hostall_salt_2024');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  // Verify password against hash
  async verifyPassword(password, hash) {
    const hashedInput = await this.hashPassword(password);
    return hashedInput === hash;
  }

  // Send password reset email (simulated)
  async sendPasswordResetEmail(email, token) {
    // In a real application, this would send an actual email
    // For demo purposes, we'll store the reset link in console
    const resetLink = `${window.location.origin}${window.location.pathname}?reset_token=${token}`;
    console.log(`Password reset email sent to ${email}`);
    console.log(`Reset link: ${resetLink}`);
    
    // Check for reset token in URL on page load
    this.checkForResetToken();
  }

  // Check for reset token in URL
  checkForResetToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset_token');
    
    if (resetToken) {
      this.showResetPasswordForm();
      document.getElementById('reset-token').value = resetToken;
      // Clear the URL parameter
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // Log security events
  async logSecurityEvent(eventType, userEmail, success, details = {}) {
    try {
      const client = window.getSupabaseClient();
      await client.rpc('log_security_event', {
        p_event_type: eventType,
        p_user_email: userEmail,
        p_ip_address: await this.getClientIP(),
        p_user_agent: navigator.userAgent,
        p_success: success,
        p_details: details
      });
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  // Get client IP (simplified)
  async getClientIP() {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return 'unknown';
    }
  }

  // Utility functions for UI feedback
  showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = 'error-message';
      element.style.display = 'block';
    }
  }

  showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = 'success-message';
      element.style.display = 'block';
    }
  }

  showLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (button) {
      if (isLoading) {
        button.disabled = true;
        button.textContent = 'Processing...';
      } else {
        button.disabled = false;
        button.textContent = button.dataset.originalText || 'Submit';
      }
    }
  }

  clearAllMessages() {
    document.querySelectorAll('.error-message, .success-message').forEach(el => {
      el.style.display = 'none';
    });
  }
}

// Global password manager instance
window.passwordManager = new PasswordManager();