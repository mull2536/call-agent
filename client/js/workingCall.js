// EXACT WORKING BACKUP CALL FUNCTIONALITY
// Global variables
const SERVER_URL = 'http://localhost:8080';
let selectedContact = null;
let serverConnected = true; // Assume connected for now

// Get selected contact from the app when needed
function getSelectedContact() {
    return window.callAgentApp?.currentContact || null;
}

// Simple makeCall function - EXACT COPY from working backup
function makeCall() {
    
    selectedContact = getSelectedContact(); // Get from new UI
    
    if (!selectedContact) {
        alert('Please select a contact to call');
        return;
    }
    
    
    const systemPrompt = document.getElementById('system-prompt')?.value?.trim() || 'You are a friendly AI assistant.';
    const firstMessage = document.getElementById('first-message')?.value?.trim() || 'Hi, this is an AI assistant calling.';
    
    
    const callData = {
        number: selectedContact.phone  // Use phone instead of number
    };
    
    
    // Disable the call button to prevent multiple calls
    document.getElementById('call-btn').disabled = true;
    
    // Use the proxy endpoint to avoid CORS issues
    
    fetch(`${SERVER_URL}/proxy-outbound-call`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(callData)
    })
    .then(response => {
        return response.json();
    })
    .then(data => {
        
        if (data.success) {
            
        } else {
            alert(`Failed to make call: ${data.error}`);
            document.getElementById('call-btn').disabled = false;
        }
    })
    .catch(error => {
        alert(`Error making call: ${error.message}`);
        document.getElementById('call-btn').disabled = false;
    });
}