/**
 * SMF Call Agent - Main Application Controller
 * Manages the overall application state and coordinates between components
 */

class CallAgentApp {
    constructor() {
        this.serverUrl = 'http://localhost:8080';
        this.isServerConnected = false;
        this.currentContact = null;
        this.settings = this.loadSettings();
        
        // Component managers
        this.contactsManager = null;
        this.callManager = null;
        
        // UI elements
        this.elements = {};
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        
        try {
            // Initialize UI elements
            this.initializeElements();
            
            // Initialize component managers
            this.contactsManager = new ContactsManager(this);
            this.callManager = new CallManager(this);
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Check server connection and wait for result
            await this.checkServerConnection();
            
            // Apply saved settings
            this.applySettings();
            
            // Request notification permissions
            this.requestNotificationPermissions();
            
        } catch (error) {
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    }

    /**
     * Initialize DOM element references
     */
    initializeElements() {
        // Header elements
        this.elements.currentContact = document.getElementById('current-contact');
        this.elements.contactsIcon = document.querySelector('.contacts-icon');
        this.elements.settingsIcon = document.querySelector('.settings-icon');
        
        // Status indicators
        this.elements.serverStatus = document.getElementById('server-status');
        this.elements.callStatus = document.getElementById('call-status');
        
        // Control buttons
        this.elements.callBtn = document.getElementById('call-btn');
        this.elements.hangupBtn = document.getElementById('hangup-btn');
        
        // Input elements
        this.elements.firstMessage = document.getElementById('first-message');
        this.elements.systemPrompt = document.getElementById('system-prompt');
        this.elements.twilioNumberSelect = document.getElementById('twilio-number-select');
        
        // Transcript
        this.elements.transcriptContainer = document.getElementById('transcript-container');
        
        // Modals
        this.elements.settingsModal = document.getElementById('settings-modal');
        this.elements.contactsModal = document.getElementById('contacts-modal');
        
        // Validate critical elements
        const criticalElements = [
            'currentContact', 'callBtn', 'hangupBtn', 'transcriptContainer'
        ];
        
        for (const elementKey of criticalElements) {
            if (!this.elements[elementKey]) {
                throw new Error(`Critical element not found: ${elementKey}`);
            }
        }
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Settings modal
        this.elements.settingsIcon?.addEventListener('click', () => this.openSettingsModal());
        document.getElementById('close-settings')?.addEventListener('click', () => this.closeSettingsModal());
        document.getElementById('save-settings')?.addEventListener('click', () => this.saveSettings());
        
        // Call controls
        this.elements.callBtn.addEventListener('click', () => this.handleCallButtonClick());
        this.elements.hangupBtn.addEventListener('click', () => this.handleHangupButtonClick());
        
        // First message input
        this.elements.firstMessage?.addEventListener('input', () => this.validateCallButton());
        
        // Close modals when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal')) {
                this.closeAllModals();
            }
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                this.closeAllModals();
            }
        });
        
        // Periodic server status check
        setInterval(() => this.checkServerConnection(), 30000); // Every 30 seconds
        
        // Also check when the page becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.checkServerConnection();
            }
        });
    }

    /**
     * Check server connection status
     */
    async checkServerConnection() {
        try {
            // Create a timeout controller for the fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
            }, 10000); // Increased timeout to 10 seconds
            const response = await fetch(`${this.serverUrl}/health`, {
                method: 'GET',
                signal: controller.signal,
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            
            clearTimeout(timeoutId);
            const isConnected = response.ok;
            this.updateServerStatus(isConnected);
            
        } catch (error) {
            this.updateServerStatus(false);
        }
    }

    /**
     * Update server connection status
     */
    updateServerStatus(isConnected) {
        this.isServerConnected = isConnected;
        
        const statusElement = this.elements.serverStatus;
        const statusSpan = statusElement.querySelector('span');
        
        if (isConnected) {
            statusElement.classList.add('status-active');
            statusSpan.textContent = 'Server: Connected';
        } else {
            statusElement.classList.remove('status-active');
            statusSpan.textContent = 'Server: Disconnected';
        }
        
        // Update call button state
        this.validateCallButton();
    }

    /**
     * Set the current contact
     */
    setCurrentContact(contact) {
        this.currentContact = contact;
        
        if (contact) {
            this.elements.currentContact.textContent = `${contact.name} (${contact.phone})`;
        } else {
            this.elements.currentContact.textContent = 'No contact selected';
        }
        
        this.validateCallButton();
    }

    /**
     * Validate and update call button state
     */
    validateCallButton() {
        const serverConnected = this.isServerConnected;
        const contactSelected = !!this.currentContact;
        const messageExists = !!(this.elements.firstMessage?.value.trim());
        const callNotActive = !(this.callManager && typeof this.callManager.isCallActive === 'function' && this.callManager.isCallActive());
        
        const canCall = serverConnected && contactSelected && messageExists && callNotActive;
        
        
        this.elements.callBtn.disabled = !canCall;
        
        if (canCall) {
            this.elements.callBtn.classList.remove('loading');
        }
    }

    /**
     * Handle call button click
     */
    async handleCallButtonClick() {
        if (!this.currentContact) {
            this.showError('Please select a contact to call');
            return;
        }
        
        const firstMessage = this.elements.firstMessage?.value.trim();
        if (!firstMessage) {
            this.showError('Please enter a first message');
            return;
        }
        
        const systemPrompt = this.elements.systemPrompt?.value.trim();
        if (!systemPrompt) {
            this.showError('Please configure a system prompt in settings');
            return;
        }
        
        
        try {
            this.elements.callBtn.classList.add('loading');
            this.elements.callBtn.disabled = true;
            
            await this.callManager.makeCall(this.currentContact, systemPrompt, firstMessage);
            
        } catch (error) {
            this.showError(`Failed to make call: ${error.message}`);
            
            this.elements.callBtn.classList.remove('loading');
            this.validateCallButton();
        }
    }

    /**
     * Handle hangup button click
     */
    async handleHangupButtonClick() {
        try {
            await this.callManager.hangUpCall();
        } catch (error) {
            this.showError(`Failed to hang up: ${error.message}`);
        }
    }


    /**
     * Open settings modal
     */
    async openSettingsModal() {
        if (this.elements.settingsModal) {
            this.elements.settingsModal.classList.add('show');
            this.elements.settingsModal.style.display = 'flex';
            
            // Load current settings
            if (this.elements.systemPrompt) {
                this.elements.systemPrompt.value = this.settings.systemPrompt;
            }
            
            // Load Twilio numbers
            await this.loadTwilioNumbers();
        }
    }

    /**
     * Close settings modal
     */
    closeSettingsModal() {
        if (this.elements.settingsModal) {
            this.elements.settingsModal.classList.remove('show');
            this.elements.settingsModal.style.display = 'none';
        }
    }

    /**
     * Close all modals
     */
    closeAllModals() {
        this.closeSettingsModal();
        if (this.contactsManager) {
            this.contactsManager.closeModal();
        }
    }

    /**
     * Load available Twilio numbers
     */
    async loadTwilioNumbers() {
        if (!this.elements.twilioNumberSelect) return;
        
        try {
            const response = await fetch(`${this.serverUrl}/twilio-numbers`);
            const data = await response.json();
            
            if (data.success) {
                this.elements.twilioNumberSelect.innerHTML = '';
                data.numbers.forEach(number => {
                    const option = document.createElement('option');
                    option.value = number;
                    option.textContent = number;
                    if (number === data.selected) {
                        option.selected = true;
                    }
                    this.elements.twilioNumberSelect.appendChild(option);
                });
                
                // Add event listener for number selection changes
                this.elements.twilioNumberSelect.addEventListener('change', () => {
                    this.handleTwilioNumberChange();
                });
                
                // Set initial message based on selected number
                this.handleTwilioNumberChange();
            } else {
                this.elements.twilioNumberSelect.innerHTML = '<option value="">No numbers available</option>';
            }
        } catch (error) {
            this.elements.twilioNumberSelect.innerHTML = '<option value="">Error loading numbers</option>';
        }
    }

    /**
     * Handle Twilio number selection changes
     */
    handleTwilioNumberChange() {
        const selectedNumber = this.elements.twilioNumberSelect?.value;
        if (!selectedNumber) return;
        
        // Check if it's a Dutch number (+31)
        if (selectedNumber.startsWith('+31')) {
            // Set Dutch messages
            if (this.elements.firstMessage) {
                this.elements.firstMessage.value = 'Hallo, hier is een AI-assistent die belt. Hoe gaat het met je vandaag?';
            }
            
            // Set Dutch system prompt if in settings modal
            if (this.elements.systemPrompt && this.elements.settingsModal?.style.display === 'flex') {
                this.elements.systemPrompt.value = 'Je bent een vriendelijke AI-assistent die belt. Je doel is om een natuurlijk gesprek te voeren met de persoon die opneemt. Wees beleefd, duidelijk en respectvol. Spreek Nederlands.';
            }
        } else {
            // Set English messages (default)
            if (this.elements.firstMessage) {
                this.elements.firstMessage.value = 'Hi, this is an AI assistant calling. How are you today?';
            }
            
            // Set English system prompt if in settings modal
            if (this.elements.systemPrompt && this.elements.settingsModal?.style.display === 'flex') {
                this.elements.systemPrompt.value = 'You are a friendly AI assistant making a phone call. Your goal is to have a natural conversation with the person who answers. Be polite, clear, and respectful.';
            }
        }
    }

    /**
     * Save settings
     */
    async saveSettings() {
        const systemPrompt = this.elements.systemPrompt?.value.trim();
        const selectedNumber = this.elements.twilioNumberSelect?.value;
        
        if (!systemPrompt) {
            this.showError('System prompt cannot be empty');
            return;
        }
        
        if (!selectedNumber) {
            this.showError('Please select a Twilio phone number');
            return;
        }
        
        try {
            // Save Twilio number to server
            const numberResponse = await fetch(`${this.serverUrl}/set-twilio-number`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ phoneNumber: selectedNumber })
            });
            
            const numberResult = await numberResponse.json();
            if (!numberResult.success) {
                throw new Error(numberResult.error || 'Failed to update Twilio number');
            }
            
            // Save system prompt locally
            this.settings.systemPrompt = systemPrompt;
            this.settings.selectedTwilioNumber = selectedNumber;
            this.saveSettingsToStorage();
            
            this.closeSettingsModal();
            this.showSuccess('Settings saved successfully');
            
        } catch (error) {
            this.showError(`Failed to save settings: ${error.message}`);
        }
    }

    /**
     * Apply saved settings to the UI
     */
    applySettings() {
        if (this.elements.systemPrompt && this.settings.systemPrompt) {
            this.elements.systemPrompt.value = this.settings.systemPrompt;
        }
        
        if (this.elements.firstMessage && this.settings.defaultFirstMessage) {
            this.elements.firstMessage.value = this.settings.defaultFirstMessage;
        }
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        const defaultSettings = {
            systemPrompt: 'You are a friendly AI assistant making a phone call. Your goal is to have a natural conversation with the person who answers. Be polite, clear, and respectful.',
            defaultFirstMessage: 'Hi, this is an AI assistant calling. How are you today?'
        };
        
        try {
            const saved = localStorage.getItem('callAgentSettings');
            return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
        } catch (error) {
            return defaultSettings;
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettingsToStorage() {
        try {
            localStorage.setItem('callAgentSettings', JSON.stringify(this.settings));
        } catch (error) {
        }
    }

    /**
     * Add message to transcript
     */
    addMessageToTranscript(sender, message, type = 'text') {
        const transcriptContainer = this.elements.transcriptContainer;
        
        if (!transcriptContainer) {
            return;
        }
        
        // Remove welcome message if present
        const welcomeMessage = transcriptContainer.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        
        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `message ${sender.toLowerCase()}`;
        messageElement.setAttribute('data-sender', sender);
        
        if (type === 'system') {
            messageElement.className = 'message system';
            messageElement.style.fontStyle = 'italic';
        }
        
        messageElement.textContent = message;
        
        // Add timestamp
        const timestamp = new Date().toLocaleTimeString();
        messageElement.title = timestamp;
        
        transcriptContainer.appendChild(messageElement);
        
        // Scroll to bottom
        transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    }

    /**
     * Clear transcript
     */
    clearTranscript() {
        const transcriptContainer = this.elements.transcriptContainer;
        transcriptContainer.innerHTML = `
            <div class="welcome-message">
                <h2>Welcome to SMF Call Agent!</h2>
                <p>Select a contact and configure your call settings to start a conversation.</p>
            </div>
        `;
    }

    // ============================================================================
    // INBOUND CALL NOTIFICATION SYSTEM
    // ============================================================================

    /**
     * Show inbound call notification
     */
    showInboundCallNotification(callData) {
        const { conversationId, phoneNumber, message, timestamp } = callData;
        
        // Create notification banner if it doesn't exist
        let notificationBanner = document.getElementById('inbound-call-banner');
        if (!notificationBanner) {
            notificationBanner = this.createInboundCallBanner();
        }
        
        // Add this call to the banner
        this.addCallToNotificationBanner(notificationBanner, callData);
        
        // Show the banner
        notificationBanner.style.display = 'block';
        notificationBanner.classList.add('show');
        
        // Sound is played server-side, no client-side sound needed
        
        // Show browser notification if permitted
        this.showBrowserNotification(phoneNumber, message);
        
        // Auto-hide after 10 seconds unless user interacts
        setTimeout(() => {
            if (notificationBanner.classList.contains('auto-hide')) {
                this.hideInboundCallNotification(conversationId);
            }
        }, 10000);
        
        // Mark as auto-hide unless user hovers
        notificationBanner.classList.add('auto-hide');
        notificationBanner.addEventListener('mouseenter', () => {
            notificationBanner.classList.remove('auto-hide');
        });
    }

    /**
     * Hide inbound call notification
     */
    hideInboundCallNotification(conversationId) {
        const notificationBanner = document.getElementById('inbound-call-banner');
        if (!notificationBanner) return;
        
        // Remove specific call from banner
        const callElement = notificationBanner.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (callElement) {
            callElement.remove();
        }
        
        // Hide banner if no more active calls
        const remainingCalls = notificationBanner.querySelectorAll('.inbound-call-item');
        if (remainingCalls.length === 0) {
            notificationBanner.style.display = 'none';
            notificationBanner.classList.remove('show');
        }
    }

    /**
     * Create inbound call notification banner
     */
    createInboundCallBanner() {
        const banner = document.createElement('div');
        banner.id = 'inbound-call-banner';
        banner.className = 'inbound-call-banner';
        banner.innerHTML = `
            <div class="banner-header">
                <div class="banner-title">
                    <span class="phone-icon">📞</span>
                    <span>Incoming Call</span>
                </div>
                <button class="banner-close" onclick="this.parentElement.parentElement.style.display='none'">&times;</button>
            </div>
            <div class="banner-content"></div>
        `;
        
        // Insert at the top of the main content
        const mainContent = document.querySelector('.main-content');
        mainContent.insertBefore(banner, mainContent.firstChild);
        
        return banner;
    }

    /**
     * Add call to notification banner
     */
    addCallToNotificationBanner(banner, callData) {
        const { conversationId, phoneNumber, message, timestamp } = callData;
        const bannerContent = banner.querySelector('.banner-content');
        
        const callElement = document.createElement('div');
        callElement.className = 'inbound-call-item';
        callElement.setAttribute('data-conversation-id', conversationId);
        callElement.innerHTML = `
            <div class="call-info">
                <div class="caller-number">${phoneNumber}</div>
                <div class="call-time">${new Date(timestamp).toLocaleTimeString()}</div>
            </div>
            <div class="call-actions">
                <button class="btn-primary view-call-btn" onclick="window.callAgentApp.viewInboundCall('${conversationId}')">
                    View Call
                </button>
                <button class="btn-secondary dismiss-btn" onclick="window.callAgentApp.hideInboundCallNotification('${conversationId}')">
                    Dismiss
                </button>
            </div>
        `;
        
        bannerContent.appendChild(callElement);
    }

    /**
     * View inbound call - switch to inbound call view
     */
    viewInboundCall(conversationId) {
        // Switch to inbound call mode
        this.switchToInboundCallMode(conversationId);
        
        // Hide notification banner
        this.hideInboundCallNotification(conversationId);
    }

    /**
     * Switch to inbound call viewing mode
     */
    switchToInboundCallMode(conversationId) {
        // Update UI to show we're viewing an inbound call
        const currentContactElement = this.elements.currentContact;
        if (currentContactElement) {
            currentContactElement.textContent = `Viewing Inbound Call: ${conversationId.slice(-8)}`;
        }
        
        // Clear transcript and show loading message
        this.clearTranscript();
        this.addMessageToTranscript('System', 'Loading inbound call transcript...', 'system');
        
        // Fetch conversation details from server
        this.loadInboundConversationTranscript(conversationId);
    }

    /**
     * Load inbound conversation transcript
     */
    async loadInboundConversationTranscript(conversationId) {
        try {
            const response = await fetch(`${this.serverUrl}/api/conversation/${conversationId}`);
            const data = await response.json();
            
            if (data.success && data.conversation) {
                const conversation = data.conversation;
                
                // Clear loading message
                this.clearTranscript();
                
                // Show conversation info (ElevenLabs format)
                const phoneNumber = conversation.caller_number || conversation.phone_number || 'Unknown';
                const startTime = conversation.start_time || conversation.created_at;

                this.addMessageToTranscript('System', `Inbound call from ${phoneNumber}`, 'system');
                if (startTime) {
                    this.addMessageToTranscript('System', `Started: ${new Date(startTime).toLocaleString()}`, 'system');
                }
                if (conversation.duration_formatted) {
                    this.addMessageToTranscript('System', `Duration: ${conversation.duration_formatted}`, 'system');
                }

                // Show existing transcript (ElevenLabs format)
                if (conversation.transcript && conversation.transcript.length > 0) {
                    conversation.transcript.forEach(msg => {
                        const speaker = msg.speaker === 'agent' ? 'Agent' : 'User';
                        const message = msg.message || msg.text || '';
                        this.addMessageToTranscript(speaker, message, 'conversation');
                    });
                } else {
                    this.addMessageToTranscript('System', 'No transcript available', 'system');
                }
                
            } else {
                this.addMessageToTranscript('System', 'Unable to load conversation details', 'system');
            }
        } catch (error) {
            this.addMessageToTranscript('System', 'Error loading conversation', 'system');
        }
    }

    /**
     * Update conversation status
     */
    updateConversationStatus(conversationId, statusMessage) {
        // Add status update to transcript if we're viewing this conversation
        const currentContact = this.elements.currentContact?.textContent;
        if (currentContact && currentContact.includes(conversationId.slice(-8))) {
            this.addMessageToTranscript('System', statusMessage, 'system');
        }
    }

    /**
     * Update conversation count in header
     */
    updateConversationCount(countMessage) {
        let countElement = document.querySelector('.conversation-count');
        if (!countElement) {
            countElement = document.createElement('div');
            countElement.className = 'conversation-count';
            
            const headerCenter = document.querySelector('.header-center');
            if (headerCenter) {
                headerCenter.appendChild(countElement);
            }
        }
        
        countElement.textContent = countMessage;
    }

    /**
     * Update service status
     */
    updateServiceStatus(statusMessage) {
        // Could show service status in a small indicator
        const serverStatus = this.elements.serverStatus;
        if (serverStatus) {
            const statusSpan = serverStatus.querySelector('span');
            if (statusSpan && statusMessage.includes('started')) {
                statusSpan.textContent = 'Server: Connected (MCP Active)';
                serverStatus.classList.add('status-active');
            }
        }
    }

    /**
     * Play notification sound
     */
    playNotificationSound() {
        // Create audio element for notification sound
        try {
            // Using a simple beep sound - could be replaced with actual audio file
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.5);
        } catch (error) {
            // Fallback: try to play a system beep
        }
    }

    /**
     * Show browser notification
     */
    showBrowserNotification(phoneNumber, message) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Incoming Call', {
                body: `Call from ${phoneNumber}`,
                icon: 'assets/favicon.ico',
                badge: 'assets/favicon.ico',
                tag: 'inbound-call'
            });
        }
    }

    /**
     * Request notification permissions
     */
    async requestNotificationPermissions() {
        if ('Notification' in window && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        }
        return Notification.permission === 'granted';
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '1rem 1.5rem',
            borderRadius: '0.5rem',
            color: 'white',
            fontWeight: '500',
            zIndex: '9999',
            maxWidth: '400px',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            transform: 'translateX(100%)',
            transition: 'transform 0.3s ease'
        });
        
        // Set background color based on type
        switch (type) {
            case 'error':
                notification.style.backgroundColor = '#ef4444';
                break;
            case 'success':
                notification.style.backgroundColor = '#10b981';
                break;
            default:
                notification.style.backgroundColor = '#3b82f6';
        }
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 5000);
        
    }

    /**
     * Get server URL
     */
    getServerUrl() {
        return this.serverUrl;
    }

    /**
     * Get current settings
     */
    getSettings() {
        return { ...this.settings };
    }
}

// Initialize the application when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.callAgentApp = new CallAgentApp();
});

// Global functions for modal interactions (called from HTML onclick handlers)
function openContactsModal() {
    if (window.callAgentApp?.contactsManager) {
        window.callAgentApp.contactsManager.openModal();
    }
}

function closeContactsModal() {
    if (window.callAgentApp?.contactsManager) {
        window.callAgentApp.contactsManager.closeModal();
    }
}

function saveOrUpdateContact() {
    if (window.callAgentApp?.contactsManager) {
        window.callAgentApp.contactsManager.saveOrUpdateContact();
    }
}

function deleteContact() {
    if (window.callAgentApp?.contactsManager) {
        window.callAgentApp.contactsManager.deleteContact();
    }
}

function useContact() {
    if (window.callAgentApp?.contactsManager) {
        window.callAgentApp.contactsManager.useContact();
    }
}

// Global functions for call history modal
async function openHistoryModal() {
    const modal = document.getElementById('history-modal');
    
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('show');
        
        // Set up filter buttons
        setupHistoryFilters();
        
        // Load call history
        await loadCallHistoryModal();
    }
}

// Load and display call history data (both inbound and outbound)
window.loadCallHistoryModal = async function() {
    const historyList = document.getElementById('history-list');
    
    try {
        historyList.innerHTML = '<p class="loading-message">Loading call history...</p>';
        
        // Fetch conversations from ElevenLabs
        const conversationsResponse = await fetch(`${window.callAgentApp.getServerUrl()}/api/elevenlabs-conversations`);
        const conversationsData = await conversationsResponse.json();

        // Convert ElevenLabs conversations to our format
        let allHistories = [];

        if (conversationsData.success && conversationsData.conversations) {
            allHistories = conversationsData.conversations.map(conv => ({
                conversationId: conv.conversationId, // Use camelCase to match button
                callSid: conv.callSid, // Keep callSid for compatibility
                contactName: conv.contactName || 'Unknown',
                contactPhone: conv.contactPhone || 'Unknown',
                callerPhone: conv.callerPhone || 'Unknown',
                direction: conv.direction || 'unknown',
                source: 'elevenlabs',
                startTime: conv.startTime,
                date: conv.startTime ? new Date(conv.startTime).toISOString().split('T')[0] : '',
                time: conv.startTime ? new Date(conv.startTime).toLocaleTimeString() : '',
                status: conv.status,
                duration: conv.duration,
                durationSecs: conv.durationSecs,
                messageCount: conv.messageCount,
                hasTranscript: conv.hasTranscript,
                summary: conv.summary
            }));
        }

        // Sort by startTime (newest first)
        allHistories.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        
        if (allHistories.length > 0) {
            historyList.innerHTML = allHistories.map(history => {
                const date = new Date(history.startTime).toLocaleDateString();
                const time = new Date(history.startTime).toLocaleTimeString();
                const duration = history.duration || 'N/A';
                
                // Direction and source indicators
                const direction = history.direction || 'outbound';
                const source = history.source || 'twilio';
                const directionIcon = direction === 'inbound' ? '📞' : '📱';
                const directionText = direction === 'inbound' ? 'Inbound' : 'Outbound';
                const directionClass = direction === 'inbound' ? 'history-inbound' : 'history-outbound';
                const sourceClass = source === 'elevenlabs' ? 'source-elevenlabs' : 'source-twilio';
                
                // For inbound calls, use caller phone as contact name if no contact name
                const contactName = history.contactName || history.callerPhone || 'Unknown';
                const contactPhone = history.contactPhone || history.callerPhone || 'Unknown';
                
                // For inbound calls, show different message count (they might not have conversation array yet)
                const messageCount = history.conversation ? history.conversation.length : (history.hasTranscript ? 'Available' : 'N/A');
                
                return `
                    <div class="history-item ${directionClass} ${sourceClass}">
                        <div class="history-header">
                            <div class="history-title-row">
                                <span class="direction-indicator">
                                    <span class="direction-icon">${directionIcon}</span>
                                    <span class="direction-text">${directionText}</span>
                                    <span class="source-badge">${source}</span>
                                </span>
                                <h3>${contactName}</h3>
                            </div>
                            <span class="history-status status-${history.status}">${history.status}</span>
                        </div>
                        <div class="history-details">
                            <p><strong>Phone:</strong> ${contactPhone}</p>
                            <p><strong>Date:</strong> ${date} at ${time}</p>
                            <p><strong>Duration:</strong> ${duration}</p>
                            <p><strong>Messages:</strong> ${messageCount}</p>
                            ${history.conversationId ? `<p><strong>Conversation ID:</strong> ${history.conversationId.slice(-8)}</p>` : ''}
                            ${history.callSid && history.direction === 'inbound' ? `<p><strong>Call SID:</strong> ${history.callSid.slice(-8)}</p>` : ''}
                        </div>
                        <button class="view-conversation-btn" onclick="viewConversation('${history.conversationId}')">
                            View Conversation
                        </button>
                    </div>
                `;
            }).join('');
        } else {
            historyList.innerHTML = '<p class="no-history-message">No call history available</p>';
        }
    } catch (error) {
        console.error('Failed to load call history:', error);
        historyList.innerHTML = '<p class="error-message">Failed to load call history</p>';
    }
}

function closeHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

/**
 * Set up call history filter functionality
 */
function setupHistoryFilters() {
    const filterButtons = document.querySelectorAll('.history-filters .filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            
            // Apply filter
            const filterType = e.target.getAttribute('data-filter');
            filterCallHistory(filterType);
        });
    });
}

/**
 * Filter call history items
 */
function filterCallHistory(filterType) {
    const historyItems = document.querySelectorAll('.history-item');
    
    historyItems.forEach(item => {
        let shouldShow = true;
        
        switch (filterType) {
            case 'all':
                shouldShow = true;
                break;
            case 'inbound':
                shouldShow = item.classList.contains('history-inbound');
                break;
            case 'outbound':
                shouldShow = item.classList.contains('history-outbound');
                break;
            default:
                shouldShow = true;
        }
        
        if (shouldShow) {
            item.style.display = 'block';
            item.style.animation = 'fadeIn 0.3s ease-in';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Show message if no items match filter
    const visibleItems = Array.from(historyItems).filter(item => item.style.display !== 'none');
    const historyList = document.getElementById('history-list');
    
    let noResultsMessage = historyList.querySelector('.no-results-message');
    if (visibleItems.length === 0 && historyItems.length > 0) {
        if (!noResultsMessage) {
            noResultsMessage = document.createElement('p');
            noResultsMessage.className = 'no-results-message';
            noResultsMessage.textContent = `No ${filterType === 'all' ? '' : filterType + ' '}calls found`;
            historyList.appendChild(noResultsMessage);
        }
        noResultsMessage.style.display = 'block';
    } else if (noResultsMessage) {
        noResultsMessage.style.display = 'none';
    }
}

async function viewConversation(conversationId) {
    try {
        console.log(`Viewing conversation: ${conversationId}`);

        // First, get the conversations list to find the matching conversation for display info
        const conversationsResponse = await fetch(`${window.callAgentApp.getServerUrl()}/api/elevenlabs-conversations`);
        const conversationsData = await conversationsResponse.json();

        if (!conversationsData.success || !conversationsData.conversations) {
            alert('Failed to load conversations');
            return;
        }

        // Find the conversation by conversationId
        const conversation = conversationsData.conversations.find(conv => conv.conversationId === conversationId);

        if (!conversation) {
            alert('Conversation not found');
            return;
        }

        // Create modal with loading message
        let conversationHtml = '<p class="loading-message">Loading conversation details...</p>';
        const conversationModal = createConversationModal(conversation, conversationHtml);
        document.body.appendChild(conversationModal);

        // Fetch detailed conversation data using the conversationId
        try {
            const conversationResponse = await fetch(`${window.callAgentApp.getServerUrl()}/api/conversation/${conversationId}`);
            const conversationData = await conversationResponse.json();

            if (conversationData.success && conversationData.conversation) {
                // Format the ElevenLabs conversation data
                conversationHtml = formatElevenLabsConversation(conversationData.conversation);

                // Update duration with real data from ElevenLabs
                const durationDisplay = conversationModal.querySelector('.duration-display');
                if (durationDisplay && conversationData.conversation.duration_formatted) {
                    durationDisplay.textContent = conversationData.conversation.duration_formatted;
                } else if (durationDisplay && conversationData.conversation.metadata?.call_duration_secs) {
                    const durationSecs = conversationData.conversation.metadata.call_duration_secs;
                    const minutes = Math.floor(durationSecs / 60);
                    const seconds = durationSecs % 60;
                    const formatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                    durationDisplay.textContent = formatted;
                }
            } else {
                conversationHtml = '<p class="error-message">No conversation transcript available for this call</p>';
            }

            // Update the modal content
            const transcriptDiv = conversationModal.querySelector('.conversation-transcript');
            if (transcriptDiv) {
                transcriptDiv.innerHTML = conversationHtml;
            }
        } catch (error) {
            console.error('Failed to fetch conversation details:', error);
            const transcriptDiv = conversationModal.querySelector('.conversation-transcript');
            if (transcriptDiv) {
                transcriptDiv.innerHTML = '<p class="error-message">Failed to load conversation details</p>';
            }
        }
    } catch (error) {
        console.error('Error loading conversation:', error);
        alert('Failed to load conversation details');
    }
}

// Helper function to create conversation modal
function createConversationModal(history, conversationHtml, conversationData = null) {
    const contactName = history.contactName || history.callerPhone || 'Unknown';
    
    // Use duration from conversation data if available, otherwise fall back to history
    let duration = history.duration || 'N/A';
    if (conversationData && conversationData.duration_formatted) {
        duration = conversationData.duration_formatted;
    } else if (conversationData && conversationData.metadata?.call_duration_secs) {
        const durationSecs = conversationData.metadata.call_duration_secs;
        const minutes = Math.floor(durationSecs / 60);
        const seconds = durationSecs % 60;
        duration = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    }
    
    const conversationModal = document.createElement('div');
    conversationModal.className = 'modal conversation-modal';
    conversationModal.style.display = 'flex';
    conversationModal.innerHTML = `
        <div class="modal-content conversation-modal-content">
            <div class="modal-header">
                <h2>Conversation with ${contactName}</h2>
                <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="conversation-details compact">
                    <div class="details-line">
                        <span><strong>Date:</strong> ${new Date(history.startTime).toLocaleString()}</span>
                        <span><strong>Duration:</strong> <span class="duration-display">${duration}</span></span>
                        <span><strong>Status:</strong> ${history.status}</span>
                    </div>
                    <div class="details-line">
                        <span><strong>Direction:</strong> ${history.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>
                        <span><strong>Source:</strong> ${history.source || 'twilio'}</span>
                    </div>
                </div>
                <div class="conversation-transcript">
                    ${conversationHtml}
                </div>
            </div>
        </div>
    `;
    return conversationModal;
}

// Helper function to format ElevenLabs conversation data
function formatElevenLabsConversation(conversationData) {
    // ElevenLabs API returns transcript array with role/message format
    if (!conversationData.transcript || !Array.isArray(conversationData.transcript)) {
        return '<p class="no-history-message">No transcript available for this conversation</p>';
    }
    
    const transcript = conversationData.transcript;
    
    if (transcript.length === 0) {
        return '<p class="no-history-message">No messages found in transcript</p>';
    }
    
    return transcript.map(msg => {
        // ElevenLabs format: { role: "user" | "agent", message: "...", time_in_call_secs: ... }
        const speakerClass = msg.role === 'user' ? 'user' : 'agent';
        const speakerName = msg.role === 'user' ? 'User' : 'Agent';
        const timeInCall = msg.time_in_call_secs ? `${Math.floor(msg.time_in_call_secs)}s` : 'N/A';
        
        return `
            <div class="conversation-message ${speakerClass}">
                <div class="message-header">
                    <strong>${speakerName}</strong>
                    <span class="message-time">${timeInCall}</span>
                </div>
                <div class="message-content">${msg.message || 'No message content'}</div>
            </div>
        `;
    }).join('');
}