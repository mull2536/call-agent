/**
 * Call Manager - Handles call functionality and WebSocket integration
 * Integrates with existing Twilio endpoints and WebSocket streams
 */

class CallManager {
    constructor(app) {
        this.app = app;
        this.isCallActive = false;
        this.callSid = null;
        this.callStartTime = null;
        this.callDurationInterval = null;
        
        // WebSocket connections
        this.transcriptWs = null;
        this.mediaWs = null;
        
        // Call states
        this.CALL_STATES = {
            IDLE: 'idle',
            CONNECTING: 'connecting',
            CONNECTED: 'connected',
            ENDED: 'ended',
            ERROR: 'error'
        };
        this.currentState = this.CALL_STATES.IDLE;
        
        this.init();
    }

    /**
     * Initialize the call manager
     */
    init() {
        
        // Connect to transcript WebSocket immediately for live updates
        this.connectTranscriptWebSocket();
        
    }


    /**
     * Check if a call is currently active
     */
    isCallActive() {
        return this.isCallActive;
    }

    /**
     * Get current call state
     */
    getCallState() {
        return this.currentState;
    }

    /**
     * Make an outbound call
     */
    makeCall(contact, systemPrompt, firstMessage) {
        
        const callData = {
            number: contact.phone,
            contactName: contact.name
        };
        
        // Connect to media stream and wait for config to be sent before making API call
        this.connectMediaStream(systemPrompt, firstMessage).then(() => {
            fetch(`${this.app.getServerUrl()}/proxy-outbound-call`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(callData)
            })
            .then(response => response.json())
            .then(data => {
            
            if (data.success) {
                
                this.callSid = data.callSid;
                this.isCallActive = true;
                this.callStartTime = new Date();
                this.setCallState(this.CALL_STATES.CONNECTING);
                this.updateCallUI();
            } else {
                this.app.showError(`Failed to make call: ${data.error}`);
            }
        })
        .catch(error => {
            this.app.showError(`Error making call: ${error.message}`);
        });
        });
    }

    /**
     * Hang up the current call
     */
    async hangUpCall() {
        if (!this.isCallActive) {
            return;
        }
        
        try {
            // Make actual API call to hang up the call
            const result = await this.makeHangupRequest();
            
            this.endCall('Call ended by user');
            
        } catch (error) {
            this.app.showError('Error hanging up call: ' + error.message);
            
            // Force end the call anyway
            this.endCall('Call ended with error');
        }
    }

    /**
     * End the call and clean up
     */
    endCall(reason = 'Call ended') {
        this.isCallActive = false;
        this.setCallState(this.CALL_STATES.ENDED);
        this.updateCallUI();
        
        // Add end message to transcript
        this.app.addMessageToTranscript('System', reason, 'system');
        
        // Clean up
        this.cleanupCall();
        
        this.app.showSuccess('Call ended');
    }

    /**
     * Set call state and notify UI
     */
    setCallState(state) {
        const previousState = this.currentState;
        this.currentState = state;
        
        
        // Emit state change event for other components
        this.onCallStateChange(state, previousState);
    }

    /**
     * Handle call state changes
     */
    onCallStateChange(newState, previousState) {
        // Update call status in app
        const callStatusElement = this.app.elements.callStatus;
        const statusSpan = callStatusElement?.querySelector('span');
        
        switch (newState) {
            case this.CALL_STATES.IDLE:
                if (callStatusElement) callStatusElement.classList.remove('status-active', 'status-calling');
                if (statusSpan) statusSpan.textContent = 'Call: Disconnected';
                break;
                
            case this.CALL_STATES.CONNECTING:
                if (callStatusElement) {
                    callStatusElement.classList.add('status-calling');
                    callStatusElement.classList.remove('status-active');
                }
                if (statusSpan) statusSpan.textContent = 'Call: Connecting...';
                break;
                
            case this.CALL_STATES.CONNECTED:
                if (callStatusElement) {
                    callStatusElement.classList.add('status-active');
                    callStatusElement.classList.remove('status-calling');
                }
                if (statusSpan) statusSpan.textContent = 'Call: Connected';
                break;
                
            case this.CALL_STATES.ENDED:
            case this.CALL_STATES.ERROR:
                if (callStatusElement) callStatusElement.classList.remove('status-active', 'status-calling');
                if (statusSpan) statusSpan.textContent = 'Call: Disconnected';
                break;
        }
    }

    /**
     * Force enable hangup button during active calls (additional safeguard)
     */
    forceEnableHangupButton() {
        const hangupBtn = this.app.elements.hangupBtn;
        // Only force enable if call is actually active or connecting (not just callSid exists)
        if (hangupBtn && this.isCallActive && 
           (this.currentState === this.CALL_STATES.CONNECTING ||
            this.currentState === this.CALL_STATES.CONNECTED)) {
            console.log('🔍 Force enabling hangup button via safeguard method');
            hangupBtn.disabled = false;
            hangupBtn.removeAttribute('disabled');
            hangupBtn.style.pointerEvents = 'auto';
        }
    }

    /**
     * Update call-related UI elements
     */
    updateCallUI() {
        const callBtn = this.app.elements.callBtn;
        const hangupBtn = this.app.elements.hangupBtn;
        
        // Enable hangup when call is active OR when we have a callSid and are in connecting/connected state
        const shouldEnableHangup = (this.isCallActive && 
                                   (this.currentState === this.CALL_STATES.CONNECTING ||
                                    this.currentState === this.CALL_STATES.CONNECTED)) ||
                                   (this.callSid && 
                                   (this.currentState === this.CALL_STATES.CONNECTING ||
                                    this.currentState === this.CALL_STATES.CONNECTED));
        
        if (shouldEnableHangup) {
            if (callBtn) {
                callBtn.disabled = true;
                callBtn.classList.remove('loading');
                if (this.currentState === this.CALL_STATES.CONNECTING) {
                    callBtn.classList.add('calling');
                }
            }
            
            if (hangupBtn) {
                hangupBtn.disabled = false;
                hangupBtn.style.pointerEvents = 'auto';
                
                if (this.currentState === this.CALL_STATES.CONNECTED) {
                    hangupBtn.classList.add('active');
                }
            }
        } else {
            if (callBtn) {
                callBtn.classList.remove('loading', 'calling');
                this.app.validateCallButton();
            }
            
            if (hangupBtn) {
                hangupBtn.disabled = true;
                hangupBtn.classList.remove('active');
            }
        }
    }

    /**
     * Connect to media stream WebSocket for configuration
     */
    connectMediaStream(systemPrompt, firstMessage) {
        
        return new Promise((resolve, reject) => {
            // Use same endpoint as backup for compatibility
            const wsUrl = `ws://localhost:8080/outbound-media-stream`;
            this.mediaWs = new WebSocket(wsUrl);
            
            this.mediaWs.onopen = () => {
                
                // Send configuration immediately
                const configMessage = {
                    type: "configure_agent",
                    prompt: systemPrompt,
                    first_message: firstMessage
                };
                
                this.mediaWs.send(JSON.stringify(configMessage));
                
                // Resolve after sending the config message
                resolve();
            };
            
            this.mediaWs.onclose = (event) => {
                this.mediaWs = null;
            };
            
            this.mediaWs.onerror = (error) => {
                this.mediaWs = null;
                reject(error);
            };
            
            this.mediaWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                } catch (error) {
                }
            };
        });
    }

    /**
     * Connect to transcript WebSocket for live updates
     */
    connectTranscriptWebSocket() {
        if (this.transcriptWs && this.transcriptWs.readyState === WebSocket.OPEN) {
            return; // Already connected
        }
        
        
        const wsUrl = `ws://localhost:8080/transcript-ws`;
        this.transcriptWs = new WebSocket(wsUrl);
        
        this.transcriptWs.onopen = () => {
        };
        
        this.transcriptWs.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleTranscriptMessage(data);
            } catch (error) {
            }
        };
        
        this.transcriptWs.onclose = (event) => {
            
            // Reconnect after 3 seconds if not intentionally closed
            if (event.code !== 1000) {
                setTimeout(() => this.connectTranscriptWebSocket(), 3000);
            }
        };
        
        this.transcriptWs.onerror = (error) => {
        };
    }

    /**
     * Handle transcript WebSocket messages
     */
    handleTranscriptMessage(data) {
        
        switch (data.type) {
            case 'user_transcript':
                this.app.addMessageToTranscript('User', data.message);
                break;
                
            case 'agent_response':
                this.app.addMessageToTranscript('Agent', data.message);
                break;
                
            case 'call_status':
                this.handleCallStatusUpdate(data);
                break;
                
            case 'call_started':
                if (!this.isCallActive) {
                    this.isCallActive = true;
                    this.callStartTime = new Date();
                    this.setCallState(this.CALL_STATES.CONNECTED);
                    this.updateCallUI();
                    this.startCallDurationTimer();
                } else {
                }
                break;
                
            case 'call_ended':
                if (this.isCallActive) {
                    this.endCall(data.reason || 'Call ended');
                } else {
                }
                break;
                
            // NEW INBOUND CALL EVENTS
            case 'inbound_call_started':
                this.handleInboundCallStarted(data);
                break;
                
            case 'inbound_call_ended':
                this.handleInboundCallEnded(data);
                break;
                
            case 'conversation_status_change':
                this.handleConversationStatusChange(data);
                break;
                
            case 'conversation_count_update':
                this.handleConversationCountUpdate(data);
                break;
                
            case 'service_status':
                this.handleServiceStatus(data);
                break;
                
            case 'error':
                this.app.showError(data.message || 'Call error occurred');
                if (this.isCallActive) {
                    this.endCall('Call ended due to error');
                }
                break;
                
            default:
        }
        
    }

    /**
     * Handle call status updates
     */
    handleCallStatusUpdate(data) {
        const isActive = data.active || data.status === 'active';
        
        if (isActive && !this.isCallActive) {
            // Call became active
            this.isCallActive = true;
            this.callStartTime = new Date();
            this.setCallState(this.CALL_STATES.CONNECTED);
            this.updateCallUI();
            this.startCallDurationTimer();
            
        } else if (!isActive && this.isCallActive && (data.status === 'completed' || data.status === 'busy' || data.status === 'no-answer' || data.status === 'failed')) {
            // Call became inactive with a terminal status - only end call for explicit terminal statuses
            this.endCall('Call ended');
        }
    }

    /**
     * Start call duration timer
     */
    startCallDurationTimer() {
        if (this.callDurationInterval) {
            clearInterval(this.callDurationInterval);
        }
        
        // Create or update call duration display
        this.updateCallDuration();
        
        this.callDurationInterval = setInterval(() => {
            this.updateCallDuration();
        }, 1000);
    }

    /**
     * Update call duration display
     */
    updateCallDuration() {
        if (!this.callStartTime) return;
        
        const duration = Math.floor((new Date() - this.callStartTime) / 1000);
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Find or create duration display
        let durationElement = document.querySelector('.call-duration');
        if (!durationElement && this.isCallActive) {
            durationElement = document.createElement('div');
            durationElement.className = 'call-duration';
            
            const conversationDisplay = this.app.elements.transcriptContainer?.parentElement;
            if (conversationDisplay) {
                conversationDisplay.appendChild(durationElement);
            }
        }
        
        if (durationElement) {
            durationElement.textContent = timeString;
        }
    }

    /**
     * Clean up call-related resources
     */
    cleanupCall() {
        // Clear duration timer
        if (this.callDurationInterval) {
            clearInterval(this.callDurationInterval);
            this.callDurationInterval = null;
        }
        
        // Remove duration display
        const durationElement = document.querySelector('.call-duration');
        if (durationElement) {
            durationElement.remove();
        }
        
        // Close media WebSocket
        if (this.mediaWs) {
            this.mediaWs.close();
            this.mediaWs = null;
        }
        
        // Reset call variables
        this.callSid = null;
        this.callStartTime = null;
        this.currentState = this.CALL_STATES.IDLE;
        
    }

    /**
     * Hangup call using Twilio API (for outbound calls)
     */
    async makeHangupRequest() {
        try {
            // If we have a callSid, use Twilio API to terminate the call
            if (this.callSid) {
                console.log(`Terminating call via Twilio API: ${this.callSid}`);
                
                const response = await fetch(`${this.app.getServerUrl()}/api/calls/hangup`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ callSid: this.callSid })
                });
                
                const result = await response.json();
                
                if (!result.success) {
                    console.error('Failed to terminate call:', result.error);
                    throw new Error(result.error || 'Failed to terminate call');
                }
                
                console.log('Call terminated successfully via Twilio API');
            }
            
            // Close media WebSocket connection as cleanup
            if (this.mediaWs && this.mediaWs.readyState === WebSocket.OPEN) {
                this.mediaWs.close();
                this.mediaWs = null;
            }
            
            return { success: true, message: "Call terminated" };
        } catch (error) {
            console.error('Hangup error:', error);
            
            // Fallback: close WebSocket connections even if API fails
            if (this.mediaWs && this.mediaWs.readyState === WebSocket.OPEN) {
                this.mediaWs.close();
                this.mediaWs = null;
            }
            
            return { success: false, message: error.message };
        }
    }

    /**
     * Get call statistics
     */
    getCallStats() {
        return {
            isActive: this.isCallActive,
            state: this.currentState,
            callSid: this.callSid,
            duration: this.callStartTime ? Math.floor((new Date() - this.callStartTime) / 1000) : 0,
            startTime: this.callStartTime
        };
    }

    /**
     * Send message through media stream (if needed for advanced features)
     */
    sendMediaMessage(message) {
        if (this.mediaWs && this.mediaWs.readyState === WebSocket.OPEN) {
            this.mediaWs.send(JSON.stringify(message));
        } else {
        }
    }

    /**
     * Handle inbound call started events
     */
    handleInboundCallStarted(data) {
        const conversationId = data.conversation_id || data.call_sid;
        const phoneNumber = this.extractPhoneFromMessage(data.message);
        
        console.log('📞 Inbound call started (sound played server-side)');
        console.log('📞 Call data:', data);
        
        // Show inbound call notification
        this.app.showInboundCallNotification({
            conversationId,
            phoneNumber,
            message: data.message,
            timestamp: data.timestamp
        });
        
        // Add to transcript
        this.app.addMessageToTranscript('System', data.message, 'system');
        
        // Update UI to show inbound call indicator
        this.updateInboundCallIndicator(true);
        
        // Refresh call history to show the new inbound call
        setTimeout(() => {
            if (window.loadCallHistoryModal) {
                const modal = document.getElementById('history-modal');
                if (modal && (modal.style.display === 'block' || modal.classList.contains('active'))) {
                    console.log('📋 Refreshing call history to show new inbound call');
                    window.loadCallHistoryModal();
                }
            }
        }, 1000); // Small delay to ensure call history is saved on server
    }

    /**
     * Handle inbound call ended events
     */
    handleInboundCallEnded(data) {
        const conversationId = data.conversation_id;
        
        // Hide inbound call notification for this conversation
        this.app.hideInboundCallNotification(conversationId);
        
        // Add to transcript
        this.app.addMessageToTranscript('System', data.message, 'system');
        
        // Update UI
        this.updateInboundCallIndicator(false);
    }

    /**
     * Handle conversation status changes
     */
    handleConversationStatusChange(data) {
        const conversationId = data.conversation_id;
        
        // Update conversation status in UI
        if (conversationId) {
            this.app.updateConversationStatus(conversationId, data.message);
        }
    }

    /**
     * Handle conversation count updates
     */
    handleConversationCountUpdate(data) {
        // Update header with conversation count
        this.app.updateConversationCount(data.message);
    }

    /**
     * Handle service status updates
     */
    handleServiceStatus(data) {
        // Show service status in UI
        this.app.updateServiceStatus(data.message);
    }

    /**
     * Extract phone number from message string
     */
    extractPhoneFromMessage(message) {
        const phoneMatch = message.match(/from (\+?[\d\-\(\)\s]+)/);
        return phoneMatch ? phoneMatch[1].trim() : 'Unknown';
    }

    /**
     * Update inbound call indicator in header
     */
    updateInboundCallIndicator(hasInboundCalls) {
        const headerElement = document.querySelector('.header-center');
        if (!headerElement) return;
        
        let indicator = headerElement.querySelector('.inbound-call-indicator');
        
        if (hasInboundCalls && !indicator) {
            indicator = document.createElement('div');
            indicator.className = 'inbound-call-indicator';
            indicator.innerHTML = '📞 Inbound';
            headerElement.appendChild(indicator);
        } else if (!hasInboundCalls && indicator) {
            indicator.remove();
        }
    }

    /**
     * Cleanup when app is destroyed
     */
    destroy() {
        
        // End any active call
        if (this.isCallActive) {
            this.endCall('Application closing');
        }
        
        // Close WebSocket connections
        if (this.transcriptWs) {
            this.transcriptWs.close(1000, 'Application closing');
            this.transcriptWs = null;
        }
        
        if (this.mediaWs) {
            this.mediaWs.close(1000, 'Application closing');
            this.mediaWs = null;
        }
        
        // Clean up timers and UI
        this.cleanupCall();
        
    }
}

// Handle page unload to cleanup properly
window.addEventListener('beforeunload', () => {
    if (window.callAgentApp?.callManager) {
        window.callAgentApp.callManager.destroy();
    }
});