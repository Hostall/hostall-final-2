/**
 * NotificationManager - Comprehensive Email/SMS Notification System
 * Handles security event notifications, user alerts, and admin communications
 */
class NotificationManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.initialized = false;
    this.templates = {};
    this.init();
  }

  async init() {
    try {
      await this.loadNotificationTemplates();
      await this.setupNotificationPreferences();
      this.initialized = true;
      console.log('NotificationManager initialized successfully');
    } catch (error) {
      console.error('NotificationManager initialization failed:', error);
    }
  }

  async loadNotificationTemplates() {
    this.templates = {
      security_event: {
        email: {
          subject: 'HOSTALL Security Alert: {event_type}',
          body: `
            <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">🛡️ HOSTALL Security Alert</h1>
              </div>
              <div style="padding: 30px; background: #f8f9fa;">
                <h2 style="color: #333;">Security Event Detected</h2>
                <p><strong>Event Type:</strong> {event_type}</p>
                <p><strong>Time:</strong> {timestamp}</p>
                <p><strong>Details:</strong> {details}</p>
                <p><strong>Location:</strong> {location}</p>
                <p><strong>User:</strong> {user_email}</p>
                
                <div style="background: #e9ecef; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3>🔍 What happened?</h3>
                  <p>{description}</p>
                </div>
                
                <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3>✅ Recommended Actions</h3>
                  <ul>
                    <li>Review your account activity</li>
                    <li>Change your password if suspicious</li>
                    <li>Enable 2FA if not already active</li>
                    <li>Contact support if unauthorized</li>
                  </ul>
                </div>
                
                <p style="text-align: center; margin-top: 30px;">
                  <a href="https://hostall.com" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">View Dashboard</a>
                </p>
              </div>
            </div>
          `
        },
        sms: 'HOSTALL Security Alert: {event_type} detected at {timestamp}. Check your email for details. If unauthorized, contact support immediately.'
      },
      
      login_alert: {
        email: {
          subject: 'HOSTALL Login Alert - New Device Access',
          body: `
            <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #28a745; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">🔐 HOSTALL Login Alert</h1>
              </div>
              <div style="padding: 30px; background: #f8f9fa;">
                <h2>New Login Detected</h2>
                <p>We detected a new login to your HOSTALL account:</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745;">
                  <p><strong>📱 Device:</strong> {device}</p>
                  <p><strong>🌍 Location:</strong> {location}</p>
                  <p><strong>⏰ Time:</strong> {timestamp}</p>
                  <p><strong>🌐 IP Address:</strong> {ip_address}</p>
                </div>
                
                <p style="margin-top: 20px;">If this was you, no action is needed. If you don't recognize this activity, please secure your account immediately.</p>
                
                <p style="text-align: center; margin-top: 30px;">
                  <a href="https://hostall.com" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Secure Account</a>
                </p>
              </div>
            </div>
          `
        },
        sms: 'HOSTALL: New login from {device} at {timestamp}. If not you, secure your account at hostall.com immediately.'
      },

      password_reset: {
        email: {
          subject: 'HOSTALL Password Reset Request',
          body: `
            <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #ff6b6b; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">🔑 Password Reset Request</h1>
              </div>
              <div style="padding: 30px; background: #f8f9fa;">
                <h2>Reset Your Password</h2>
                <p>We received a request to reset your HOSTALL account password.</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                  <p><strong>Reset Code:</strong></p>
                  <div style="font-size: 24px; font-weight: bold; color: #ff6b6b; letter-spacing: 3px; padding: 10px; background: #f8f9fa; border-radius: 6px; display: inline-block;">
                    {reset_code}
                  </div>
                  <p style="color: #666; font-size: 14px; margin-top: 10px;">This code expires in 15 minutes</p>
                </div>
                
                <p>If you didn't request this reset, please ignore this email and contact support if you're concerned about account security.</p>
                
                <p style="text-align: center; margin-top: 30px;">
                  <a href="https://hostall.com" style="background: #ff6b6b; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Reset Password</a>
                </p>
              </div>
            </div>
          `
        },
        sms: 'HOSTALL Password Reset Code: {reset_code}. Valid for 15 minutes. If you didn\'t request this, ignore this message.'
      },

      account_locked: {
        email: {
          subject: 'HOSTALL Account Security - Account Temporarily Locked',
          body: `
            <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #dc3545; padding: 20px; text-align: center;">
                <h1 style="color: white; margin: 0;">🔒 Account Security Alert</h1>
              </div>
              <div style="padding: 30px; background: #f8f9fa;">
                <h2>Account Temporarily Locked</h2>
                <p>Your HOSTALL account has been temporarily locked due to multiple failed login attempts.</p>
                
                <div style="background: #f8d7da; padding: 15px; border-radius: 8px; border-left: 4px solid #dc3545;">
                  <p><strong>Reason:</strong> {reason}</p>
                  <p><strong>Lock Duration:</strong> {duration}</p>
                  <p><strong>Unlock Time:</strong> {unlock_time}</p>
                </div>
                
                <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3>🛡️ Security Measures</h3>
                  <p>This is an automatic security measure to protect your account from unauthorized access attempts.</p>
                </div>
                
                <p style="text-align: center; margin-top: 30px;">
                  <a href="https://hostall.com" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Contact Support</a>
                </p>
              </div>
            </div>
          `
        },
        sms: 'HOSTALL: Account locked due to {reason}. Unlock time: {unlock_time}. Contact support if unauthorized attempts.'
      }
    };
  }

  async setupNotificationPreferences() {
    // Create notification preferences table if it doesn't exist
    try {
      await this.supabase.rpc('create_notification_preferences_table');
    } catch (error) {
      // Table might already exist, that's OK
      console.log('Notification preferences table setup:', error.message);
    }
  }

  async sendSecurityNotification(eventType, userEmail, eventData) {
    try {
      console.log(`Sending security notification: ${eventType} to ${userEmail}`);
      
      // Get user notification preferences
      const preferences = await this.getUserNotificationPreferences(userEmail);
      
      // Prepare notification data
      const notificationData = this.prepareNotificationData(eventType, eventData);
      
      // Send email notification if enabled
      if (preferences.email_enabled) {
        await this.sendEmailNotification(userEmail, eventType, notificationData);
      }
      
      // Send SMS notification if enabled and phone number available
      if (preferences.sms_enabled && preferences.phone_number) {
        await this.sendSMSNotification(preferences.phone_number, eventType, notificationData);
      }
      
      // Log notification in database
      await this.logNotification(userEmail, eventType, notificationData);
      
      return { success: true, message: 'Notification sent successfully' };
    } catch (error) {
      console.error('Failed to send security notification:', error);
      return { success: false, error: error.message };
    }
  }

  async getUserNotificationPreferences(userEmail) {
    try {
      const { data, error } = await this.supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_email', userEmail)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      // Return default preferences if none found
      return data || {
        user_email: userEmail,
        email_enabled: true,
        sms_enabled: false,
        phone_number: null,
        security_alerts: true,
        login_alerts: true,
        password_reset_alerts: true
      };
    } catch (error) {
      console.error('Error getting notification preferences:', error);
      return {
        email_enabled: true,
        sms_enabled: false,
        security_alerts: true,
        login_alerts: true,
        password_reset_alerts: true
      };
    }
  }

  prepareNotificationData(eventType, eventData) {
    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Karachi',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    return {
      event_type: eventType.replace(/_/g, ' ').toUpperCase(),
      timestamp: timestamp,
      details: eventData.details || 'Security event detected',
      location: eventData.location || 'Unknown location',
      user_email: eventData.user_email || 'Unknown user',
      description: this.getEventDescription(eventType),
      device: eventData.device || 'Unknown device',
      ip_address: eventData.ip_address || 'Unknown IP',
      reset_code: eventData.reset_code || '',
      reason: eventData.reason || 'Multiple failed attempts',
      duration: eventData.duration || '30 minutes',
      unlock_time: eventData.unlock_time || 'Unknown',
      ...eventData
    };
  }

  getEventDescription(eventType) {
    const descriptions = {
      failed_login: 'Multiple failed login attempts were detected on your account. This could indicate someone is trying to guess your password.',
      suspicious_login: 'A login from an unusual location or device was detected. Please verify this was authorized.',
      password_change: 'Your account password was successfully changed. If you didn\'t make this change, contact support immediately.',
      account_locked: 'Your account has been temporarily locked as a security precaution due to suspicious activity.',
      two_factor_disabled: 'Two-factor authentication was disabled on your account. This reduces your account security.',
      data_export: 'Someone requested to export your account data. If this wasn\'t you, secure your account immediately.',
      admin_access: 'Administrative access was granted to your account. This provides elevated privileges.'
    };
    
    return descriptions[eventType] || 'A security-related event occurred on your account that requires your attention.';
  }

  async sendEmailNotification(userEmail, eventType, notificationData) {
    try {
      // Simulate email sending - In production, integrate with email service like SendGrid, Mailgun, etc.
      const template = this.templates[eventType]?.email || this.templates.security_event.email;
      const subject = this.replaceTemplateVariables(template.subject, notificationData);
      const body = this.replaceTemplateVariables(template.body, notificationData);
      
      console.log(`📧 EMAIL NOTIFICATION [${eventType}]`);
      console.log(`To: ${userEmail}`);
      console.log(`Subject: ${subject}`);
      console.log('Body:', body.substring(0, 200) + '...');
      
      // In production, replace this with actual email service
      // Examples: SendGrid, Mailgun, AWS SES, Resend, etc.
      /*
      const emailResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: userEmail }],
            subject: subject
          }],
          from: { email: 'security@hostall.com', name: 'HOSTALL Security' },
          content: [{
            type: 'text/html',
            value: body
          }]
        })
      });
      */
      
      return { success: true, method: 'email' };
    } catch (error) {
      console.error('Email notification failed:', error);
      throw error;
    }
  }

  async sendSMSNotification(phoneNumber, eventType, notificationData) {
    try {
      // Simulate SMS sending - In production, integrate with SMS service like Twilio, etc.
      const template = this.templates[eventType]?.sms || this.templates.security_event.sms;
      const message = this.replaceTemplateVariables(template, notificationData);
      
      console.log(`📱 SMS NOTIFICATION [${eventType}]`);
      console.log(`To: ${phoneNumber}`);
      console.log(`Message: ${message}`);
      
      // In production, replace this with actual SMS service
      /*
      const smsResponse = await fetch('https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(TWILIO_ACCOUNT_SID + ':' + TWILIO_AUTH_TOKEN)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          From: '+1234567890', // Your Twilio phone number
          To: phoneNumber,
          Body: message
        })
      });
      */
      
      return { success: true, method: 'sms' };
    } catch (error) {
      console.error('SMS notification failed:', error);
      throw error;
    }
  }

  replaceTemplateVariables(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{${key}}`, 'g');
      result = result.replace(regex, value || '');
    }
    return result;
  }

  async logNotification(userEmail, eventType, notificationData) {
    try {
      await this.supabase
        .from('notification_logs')
        .insert({
          user_email: userEmail,
          notification_type: eventType,
          notification_data: notificationData,
          sent_at: new Date().toISOString(),
          status: 'sent'
        });
    } catch (error) {
      console.error('Failed to log notification:', error);
    }
  }

  async updateNotificationPreferences(userEmail, preferences) {
    try {
      const { data, error } = await this.supabase
        .from('notification_preferences')
        .upsert({
          user_email: userEmail,
          ...preferences,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Failed to update notification preferences:', error);
      return { success: false, error: error.message };
    }
  }

  async getNotificationHistory(userEmail, limit = 50) {
    try {
      const { data, error } = await this.supabase
        .from('notification_logs')
        .select('*')
        .eq('user_email', userEmail)
        .order('sent_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to get notification history:', error);
      return [];
    }
  }

  // Security event helpers
  async notifyFailedLogin(userEmail, attemptData) {
    return await this.sendSecurityNotification('failed_login', userEmail, {
      ...attemptData,
      user_email: userEmail
    });
  }

  async notifyPasswordReset(userEmail, resetCode) {
    return await this.sendSecurityNotification('password_reset', userEmail, {
      user_email: userEmail,
      reset_code: resetCode
    });
  }

  async notifyAccountLocked(userEmail, lockData) {
    return await this.sendSecurityNotification('account_locked', userEmail, {
      ...lockData,
      user_email: userEmail
    });
  }

  async notifyLoginSuccess(userEmail, loginData) {
    return await this.sendSecurityNotification('login_alert', userEmail, {
      ...loginData,
      user_email: userEmail
    });
  }

  // Test notification system
  async testNotifications(userEmail) {
    console.log('🧪 Testing notification system...');
    
    const testResults = [];
    
    try {
      // Test security event notification
      const securityTest = await this.sendSecurityNotification('failed_login', userEmail, {
        user_email: userEmail,
        details: 'Test security notification',
        location: 'Test Location',
        device: 'Test Device',
        ip_address: '192.168.1.1'
      });
      testResults.push({ type: 'Security Event', result: securityTest });
      
      // Test login alert
      const loginTest = await this.notifyLoginSuccess(userEmail, {
        device: 'Chrome on Windows',
        location: 'Lahore, Pakistan',
        ip_address: '192.168.1.1'
      });
      testResults.push({ type: 'Login Alert', result: loginTest });
      
      // Test password reset
      const resetTest = await this.notifyPasswordReset(userEmail, '123456');
      testResults.push({ type: 'Password Reset', result: resetTest });
      
      console.log('✅ Notification system test completed');
      return testResults;
    } catch (error) {
      console.error('❌ Notification system test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NotificationManager;
} else if (typeof window !== 'undefined') {
  window.NotificationManager = NotificationManager;
}