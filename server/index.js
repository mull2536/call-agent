import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get current directory for static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import Twilio from "twilio";

// Load environment variables from .env file in project root
dotenv.config({ path: join(__dirname, '..', '.env') });

// Check for required environment variables
const {
  ELEVENLABS_API_KEY,
  ELEVENLABS_AGENT_ID,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  TWILIO_PHONE_NUMBER2,
} = process.env;

// Collect available Twilio phone numbers
const availableTwilioNumbers = [];
if (TWILIO_PHONE_NUMBER) availableTwilioNumbers.push(TWILIO_PHONE_NUMBER);
if (TWILIO_PHONE_NUMBER2) availableTwilioNumbers.push(TWILIO_PHONE_NUMBER2);

// Add any additional TWILIO_PHONE_NUMBER3, TWILIO_PHONE_NUMBER4, etc.
for (let i = 3; i <= 10; i++) {
  const numberKey = `TWILIO_PHONE_NUMBER${i}`;
  if (process.env[numberKey]) {
    availableTwilioNumbers.push(process.env[numberKey]);
  }
}

// Current selected phone number (defaults to first available)
let selectedTwilioNumber = availableTwilioNumbers[0] || TWILIO_PHONE_NUMBER;

if (
  !ELEVENLABS_API_KEY ||
  !ELEVENLABS_AGENT_ID ||
  !TWILIO_ACCOUNT_SID ||
  !TWILIO_AUTH_TOKEN ||
  availableTwilioNumbers.length === 0
) {
  console.error("Missing required environment variables");
  console.error("Available Twilio numbers:", availableTwilioNumbers);
  throw new Error("Missing required environment variables");
}

// Initialize Fastify server
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Register static file serving
fastify.register(fastifyStatic, {
  root: join(__dirname, '..'),
  prefix: '/'
});

// Serve index.html at root
fastify.get('/', async (request, reply) => {
  return reply.sendFile('client/index.html');
});

const PORT = process.env.PORT || 8080;

// Health check route
fastify.get("/health", async (_, reply) => {
  reply.send({ message: "Server is running", status: "ok" });
});

// Call history now fetched directly from ElevenLabs - see /api/elevenlabs-conversations

/**
 * API endpoint to fetch conversation details by ElevenLabs conversation_id
 */
fastify.get("/api/conversation/:conversationId", async (request, reply) => {
  try {
    const { conversationId } = request.params;
    console.log(`🔍 Fetching ElevenLabs conversation details for: ${conversationId}`);
    
    // Log the exact request details
    const requestUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`;
    const requestHeaders = {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json'
    };
    
    console.log('📤 REQUEST TO ELEVENLABS:');
    console.log('   URL:', requestUrl);
    console.log('   Method: GET');
    console.log('   Headers:', {
      'xi-api-key': process.env.ELEVENLABS_API_KEY ? `${process.env.ELEVENLABS_API_KEY.substring(0, 10)}...` : 'MISSING',
      'Content-Type': 'application/json'
    });
    
    // Fetch conversation details directly from ElevenLabs
    const detailResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📥 RESPONSE FROM ELEVENLABS:');
    console.log('   Status:', detailResponse.status);
    console.log('   Status Text:', detailResponse.statusText);
    console.log('   Headers:', Object.fromEntries(detailResponse.headers.entries()));
    
    if (!detailResponse.ok) {
      console.error(`❌ ElevenLabs API error: ${detailResponse.status}`);
      return reply.code(detailResponse.status).send({ 
        error: "Failed to fetch conversation details from ElevenLabs",
        conversation_id: conversationId
      });
    }
    
    const conversationDetails = await detailResponse.json();
    console.log(`✅ Successfully fetched conversation ${conversationId}`);
    console.log('🔍 ElevenLabs response keys:', Object.keys(conversationDetails));
    console.log('🔍 Transcript field:', conversationDetails.transcript ? 'EXISTS' : 'MISSING');
    console.log('🔍 Transcript length:', conversationDetails.transcript ? conversationDetails.transcript.length : 'N/A');
    
    // Extract call duration from metadata
    const durationSecs = conversationDetails.metadata?.call_duration_secs;
    if (durationSecs) {
      console.log('🔍 Call duration:', durationSecs, 'seconds');
      
      // Format duration as human-readable
      const minutes = Math.floor(durationSecs / 60);
      const seconds = durationSecs % 60;
      const durationFormatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      
      // Add duration to the response
      conversationDetails.duration_formatted = durationFormatted;
      conversationDetails.duration_seconds = durationSecs;
    }
    
    // Log first few fields for debugging
    if (conversationDetails.transcript && conversationDetails.transcript.length > 0) {
      console.log('🔍 First transcript entry:', JSON.stringify(conversationDetails.transcript[0], null, 2));
    }
    
    // Return the conversation data
    reply.send({
      success: true,
      conversation: conversationDetails
    });
    
  } catch (error) {
    console.error(`❌ Error fetching conversation ${request.params.conversationId}:`, error.message);
    reply.code(500).send({ 
      error: "Internal server error",
      message: error.message 
    });
  }
});

// Twilio phone number management endpoints
fastify.get("/twilio-numbers", async (request, reply) => {
  reply.send({ 
    success: true, 
    numbers: availableTwilioNumbers,
    selected: selectedTwilioNumber 
  });
});

fastify.post("/set-twilio-number", async (request, reply) => {
  const { phoneNumber } = request.body;
  
  if (!phoneNumber || !availableTwilioNumbers.includes(phoneNumber)) {
    return reply.code(400).send({ 
      success: false, 
      error: "Invalid phone number. Must be one of the available numbers." 
    });
  }
  
  selectedTwilioNumber = phoneNumber;
  console.log(`📞 Twilio number changed to: ${selectedTwilioNumber}`);
  
  reply.send({ 
    success: true, 
    message: "Twilio number updated", 
    selected: selectedTwilioNumber 
  });
});

// ============================================================================
// INBOUND CALL HANDLING - ElevenLabs Webhook Integration
// ============================================================================

const activeInboundConversations = new Map();

/**
 * ElevenLabs webhook endpoint for conversation initiation
 * Called when someone calls our Twilio number that forwards to ElevenLabs
 */
fastify.post("/elevenlabs-webhook", async (request, reply) => {
  try {
    const webhookData = request.body;
    const headers = request.headers;
    const rawBody = request.rawBody;
    
    // Extract call information from ElevenLabs webhook
    const callSid = webhookData.call_sid;
    const conversationId = webhookData.conversation_id;
    const callerPhone = webhookData.caller_id;
    const calledNumber = webhookData.called_number;
    const agentId = webhookData.agent_id;

    console.log(`📞 Inbound call: ${callSid} from ${callerPhone} to ${calledNumber}`);
    
    if (!callSid) {
      console.error("❌ No call_sid found in webhook data");
      console.error("📋 Available fields:", Object.keys(webhookData || {}));
      return reply.code(400).send({ error: "Missing call_sid" });
    }
    
    // Notify of inbound call
    broadcastTranscript('inbound_call_started', `Inbound call from ${callerPhone || 'Unknown'}`, callSid);
    
    // Play sound notification
    try {
      const { exec } = await import('child_process');
      const soundPath = join(__dirname, '..', 'client', 'assets', 'call.mp3');
      exec(`powershell -c "Add-Type -AssemblyName presentationCore; $mediaPlayer = New-Object System.Windows.Media.MediaPlayer; $mediaPlayer.Open('${soundPath}'); $mediaPlayer.Play(); Start-Sleep 2"`);
    } catch (error) {
      console.log('🔇 Sound error:', error.message);
    }

    // Acknowledge webhook receipt
    reply.send({ 
      success: true, 
      message: "Call initiation webhook processed",
      call_sid: callSid,
      caller_id: callerPhone 
    });
    
  } catch (error) {
    console.error("❌ Error processing ElevenLabs webhook:", error);
    reply.code(500).send({ error: "Internal server error" });
  }
});


/**
 * Get active inbound conversations
 */
fastify.get("/inbound-conversations", async (request, reply) => {
  const conversations = Array.from(activeInboundConversations.values());
  reply.send({ 
    success: true, 
    conversations,
    count: conversations.length
  });
});

/**
 * Get specific conversation details
 */
fastify.get("/inbound-conversations/:conversationId", async (request, reply) => {
  const { conversationId } = request.params;
  const conversation = activeInboundConversations.get(conversationId);
  
  if (!conversation) {
    return reply.code(404).send({ 
      success: false, 
      error: "Conversation not found" 
    });
  }
  
  reply.send({ 
    success: true, 
    conversation 
  });
});

/**
 * Force end a conversation (for testing/admin purposes)
 */
fastify.post("/inbound-conversations/:conversationId/end", async (request, reply) => {
  const { conversationId } = request.params;
  const conversation = activeInboundConversations.get(conversationId);
  
  if (!conversation) {
    return reply.code(404).send({ 
      success: false, 
      error: "Conversation not found" 
    });
  }
  
  try {
    // Mark as ended
    conversation.status = 'ended';
    conversation.endTime = new Date();
    
        (conversationId);
    
    // Broadcast call end
    broadcastTranscript('inbound_call_ended', 'Inbound call ended manually', conversationId);
    
    // Schedule cleanup
    setTimeout(() => {
      activeInboundConversations.delete(conversationId);
      conversationCache.delete(conversationId);
    }, 2000);
    
    reply.send({ 
      success: true, 
      message: "Conversation ended",
      conversation_id: conversationId
    });
    
  } catch (error) {
    console.error(`❌ Error ending conversation ${conversationId}:`, error);
    reply.code(500).send({ 
      success: false, 
      error: "Failed to end conversation" 
    });
  }
});

/**
 * Get conversation tracking statistics
 */
fastify.get("/conversation-stats", async (request, reply) => {
  const stats = {
    active_conversations: activeInboundConversations.size,
    cached_conversations: conversationCache.size,
    polling_interval: POLLING_INTERVAL,
    polling_active: pollingInterval !== null,
    active_conversations_list: Array.from(activeInboundConversations.entries()).map(([id, conv]) => ({
      conversation_id: id,
      phone_number: conv.phoneNumber,
      status: conv.status,
      duration_seconds: conv.startTime ? Math.floor((new Date() - conv.startTime) / 1000) : 0,
      start_time: conv.startTime
    }))
  };
  
  reply.send({
    success: true,
    stats
  });
});

/**
 * Debug endpoint to test specific conversation IDs
 */
fastify.get("/api/debug-conversations", async (request, reply) => {
  try {
    console.log('🔍 TESTING ELEVENLABS API...');

    // Test the list API
    const listResponse = await fetch('https://api.elevenlabs.io/v1/convai/conversations?page_size=30', {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    const listData = await listResponse.json();
    console.log('📋 LIST API RESPONSE:', JSON.stringify(listData, null, 2));

    // Test specific conversation IDs
    const testConversations = [
      'conv_2901k5m05188eabtvbp8sex4yeqp', // outbound
      'conv_0201k5kvesdmenmtge4x6t7z7t4y'  // inbound
    ];

    const detailResults = {};

    for (const convId of testConversations) {
      try {
        const detailResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${convId}`, {
          method: 'GET',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          }
        });

        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          detailResults[convId] = detailData;
          console.log(`📞 CONVERSATION ${convId}:`, JSON.stringify(detailData, null, 2));
        } else {
          console.log(`❌ Failed to fetch ${convId}: ${detailResponse.status}`);
          detailResults[convId] = { error: `Status ${detailResponse.status}` };
        }
      } catch (error) {
        console.log(`❌ Error fetching ${convId}:`, error.message);
        detailResults[convId] = { error: error.message };
      }
    }

    reply.send({
      success: true,
      listData,
      detailResults
    });

  } catch (error) {
    console.error("❌ Debug API error:", error);
    reply.code(500).send({ error: "Debug test failed" });
  }
});

/**
 * Get ElevenLabs conversations list for UI
 */
fastify.get("/api/elevenlabs-conversations", async (request, reply) => {
  try {
    // Fetch last 30 conversations (both inbound and outbound)
    const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations?page_size=30', {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return reply.code(response.status).send({
        error: "Failed to fetch conversations from ElevenLabs",
        status: response.status
      });
    }

    const conversationsData = await response.json();

    // Filter and format conversations for UI
    const conversations = (conversationsData.conversations || []).map(conv => {
      const startTime = conv.start_time_unix_secs ? new Date(conv.start_time_unix_secs * 1000) : new Date();
      const duration = conv.call_duration_secs || 0;
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      const durationFormatted = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

      return {
        conversationId: conv.conversation_id,
        callSid: conv.conversation_id, // Use conversation_id as callSid for lookup
        contactName: conv.agent_name || 'AI Agent',
        callerPhone: 'Unknown', // ElevenLabs doesn't provide caller phone in list
        contactPhone: 'Unknown',
        direction: conv.direction === 'inbound' ? 'inbound' : 'outbound', // null = outbound, 'inbound' = inbound
        status: conv.call_successful === 'success' ? 'completed' : (conv.status || 'failed'),
        startTime: startTime.toISOString(),
        duration: durationFormatted,
        durationSecs: duration,
        messageCount: conv.message_count || 0,
        hasTranscript: (conv.message_count || 0) > 0,
        source: 'elevenlabs',
        summary: conv.call_summary_title || conv.transcript_summary || 'No summary'
      };
    });

    reply.send({
      success: true,
      conversations,
      total: conversations.length
    });

  } catch (error) {
    console.error("❌ Error fetching ElevenLabs conversations:", error);
    reply.code(500).send({ error: "Internal server error" });
  }
});

// Conversation management utilities
const conversationUtils = {
  /**
   * Start tracking a new inbound conversation
   */
  startInboundConversation: async (conversationId, phoneNumber) => {
    if (activeInboundConversations.has(conversationId)) {
      console.log(`⚠️ Conversation ${conversationId} already being tracked`);
      return activeInboundConversations.get(conversationId);
    }
    
    const conversation = {
      conversationId,
      phoneNumber,
      startTime: new Date(),
      status: 'active',
      transcript: [],
      messageCount: 0,
      lastActivity: new Date()
    };
    
    activeInboundConversations.set(conversationId, conversation);
    
        
    console.log(`🆕 Started tracking inbound conversation: ${conversationId}`);
    return conversation;
  },

  /**
   * End tracking an inbound conversation
   */
  endInboundConversation: async (conversationId, reason = 'completed') => {
    const conversation = activeInboundConversations.get(conversationId);
    if (!conversation) {
      console.log(`⚠️ Attempted to end non-existent conversation: ${conversationId}`);
      return false;
    }
    
    conversation.status = 'ended';
    conversation.endTime = new Date();
    conversation.endReason = reason;
    
        (conversationId);
    
    // Schedule cleanup
    setTimeout(() => {
      activeInboundConversations.delete(conversationId);
      conversationCache.delete(conversationId);
    }, 5000);
    
    console.log(`📞 Ended tracking inbound conversation: ${conversationId} (${reason})`);
    return true;
  },

  /**
   * Get all active inbound conversations
   */
  getActiveInboundConversations: () => {
    return Array.from(activeInboundConversations.values());
  },

  /**
   * Update conversation activity timestamp
   */
  updateConversationActivity: (conversationId) => {
    const conversation = activeInboundConversations.get(conversationId);
    if (conversation) {
      conversation.lastActivity = new Date();
      conversation.messageCount = (conversation.messageCount || 0) + 1;
    }
  },

  /**
   * Check for inactive conversations and clean them up
   */
  cleanupInactiveConversations: async (timeoutMinutes = 5) => {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const now = new Date();
    
    const inactiveConversations = [];
    
    for (const [conversationId, conversation] of activeInboundConversations.entries()) {
      const lastActivity = conversation.lastActivity || conversation.startTime;
      const inactiveDuration = now - lastActivity;
      
      if (inactiveDuration > timeoutMs && conversation.status === 'active') {
        inactiveConversations.push(conversationId);
      }
    }
    
    for (const conversationId of inactiveConversations) {
      console.log(`⏰ Cleaning up inactive conversation: ${conversationId}`);
      await conversationUtils.endInboundConversation(conversationId, 'timeout');
      broadcastTranscript('inbound_call_ended', 'Call ended due to inactivity', conversationId);
    }
    
    return inactiveConversations.length;
  }
};

// Periodic cleanup of inactive conversations (every 2 minutes)
setInterval(async () => {
  try {
    const cleanedCount = await conversationUtils.cleanupInactiveConversations(5);
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} inactive conversations`);
    }
  } catch (error) {
    console.error('❌ Error during periodic conversation cleanup:', error);
  }
}, 2 * 60 * 1000); // 2 minutes

// Make conversation utilities available globally for other parts of the application
global.conversationUtils = conversationUtils;

// ============================================================================
// MCP-POWERED CONVERSATION POLLING SERVICE
// ============================================================================

// Polling configuration
const POLLING_INTERVAL = 3000; // 3 seconds
let pollingInterval = null;
let conversationCache = new Map(); // Cache to track conversation states

/**
 * Start the MCP conversation polling service
 */
function startConversationPolling() {
  if (pollingInterval) {
    console.log("📡 Conversation polling service already running");
    return;
  }
  
  console.log("🚀 Starting MCP conversation polling service...");
  
  pollingInterval = setInterval(async () => {
    try {
      await pollActiveConversations();
    } catch (error) {
      console.error("❌ MCP conversation polling error:", error);
    }
  }, POLLING_INTERVAL);
  
  console.log(`📡 Polling service started with ${POLLING_INTERVAL}ms interval`);
}

/**
 * Stop the conversation polling service
 */
function stopConversationPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log("⏹️ Conversation polling service stopped");
  }
}

/**
 * Poll active conversations using MCP
 */
async function pollActiveConversations() {
  try {
    // Use direct ElevenLabs API to get conversations
    const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations', {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ ElevenLabs API error: ${response.status} ${response.statusText}`);
      return;
    }
    
    const conversationsData = await response.json();
    console.log(`📡 Polling found ${conversationsData.conversations?.length || 0} total conversations`);
    
    if (!conversationsData.conversations || conversationsData.conversations.length === 0) {
      // No conversations found
      if (activeInboundConversations.size > 0) {
        console.log("🧹 No conversations found, cleaning up tracking");
        activeInboundConversations.clear();
      }
      return;
    }
    
    const activeConversations = conversationsData.conversations;
    
    // Broadcast conversation count update if it changed
    const currentCount = activeConversations.length;
    const previousCount = global.lastConversationCount || 0;
    if (currentCount !== previousCount) {
      broadcastTranscript('conversation_count_update', `${currentCount} active conversation${currentCount !== 1 ? 's' : ''}`, null);
      global.lastConversationCount = currentCount;
    }
  
    // Only process conversations we're actually tracking from webhooks
    const trackedCallSids = Array.from(activeInboundConversations.keys());
    const trackedConversationIds = Array.from(activeInboundConversations.values())
      .map(call => call.conversationId)
      .filter(id => id !== null);
    
    let processedCount = 0;
    for (const conversation of activeConversations) {
      const conversationId = conversation.conversation_id;
      
      // Only process if this conversation belongs to one of our tracked calls
      const isTracked = trackedCallSids.includes(conversationId) || 
                       trackedConversationIds.includes(conversationId) ||
                       Array.from(activeInboundConversations.values()).some(call => 
                         call.callSid === conversationId || call.conversationId === conversationId
                       );
      
      if (isTracked) {
        await processConversationUpdate(conversation);
        processedCount++;
      }
    }
    
    if (processedCount > 0) {
      console.log(`📡 Processed ${processedCount} tracked conversations (skipped ${activeConversations.length - processedCount} unrelated)`);
    } else if (activeConversations.length > 0) {
      console.log(`📡 No tracked conversations to process (${activeConversations.length} total conversations in account)`);
    }
    
    // Clean up conversations that are no longer active
    await cleanupInactiveConversations(activeConversations);
    
  } catch (error) {
    console.error("❌ MCP conversation polling error:", error);
    
    // Handle rate limiting
    if (error.message?.includes('rate limit') || error.code === 429) {
      console.log("⏳ Rate limit detected, slowing down polling");
      // Could implement exponential backoff here if needed
    }
  }
}

/**
 * Process conversation updates from MCP polling
 */
async function processConversationUpdate(conversation) {
  const conversationId = conversation.conversation_id;
  const status = conversation.status;
  const phoneNumber = conversation.phone_number;
  
  // Check if this is a conversation from our webhook (has phone number) or a new one from polling
  const trackedCall = Array.from(activeInboundConversations.values()).find(call => 
    call.callSid === conversationId || call.conversationId === conversationId
  );
  
  if (trackedCall) {
    // This is a call we're tracking from webhook, update its status
    console.log(`📝 Conversation ${conversationId} status changed: ${trackedCall.status} → ${status}`);
    trackedCall.status = status;
    trackedCall.conversationId = conversationId; // Link the conversation ID
    
    broadcastTranscript('conversation_status_change', `Conversation status: ${status}`, conversationId);
    
    // Only fetch conversation details when call is DONE
    if (status === 'done') {
      console.log(`✅ Call completed, fetching conversation details for ${conversationId}`);
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`, {
          method: 'GET',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const conversationDetails = await response.json();
          await processTranscriptUpdates(conversationId, conversationDetails);
          
          // Finalize call history now that we have the complete conversation
          (trackedCall.callSid || conversationId);
        } else {
          console.log(`⚠️ Could not get details for completed conversation ${conversationId}: ${response.status}`);
        }
        
      } catch (error) {
        console.error(`❌ Error getting completed conversation details for ${conversationId}:`, error.message);
      }
    }
  } else {
    // This shouldn't happen since we pre-filter conversations in polling
    console.log(`⚠️ Unexpected: conversation ${conversationId} not found in tracked calls`);
  }
  
}

/**
 * Process transcript updates from conversation details
 */
async function processTranscriptUpdates(conversationId, conversationDetails) {
  // Extract messages/events from conversation details
  const events = conversationDetails.events || conversationDetails.messages || [];
  
  // Get cached conversation state to avoid duplicate broadcasts
  const cachedState = conversationCache.get(conversationId) || { lastEventIndex: -1 };
  
  // Process new events since last poll
  const newEvents = events.slice(cachedState.lastEventIndex + 1);
  
  if (newEvents.length > 0) {
    console.log(`📝 Processing ${newEvents.length} new transcript events for ${conversationId}`);
    
    for (const event of newEvents) {
      await processTranscriptEvent(conversationId, event);
    }
    
    // Update cache
    conversationCache.set(conversationId, {
      lastEventIndex: events.length - 1,
      lastUpdated: new Date()
    });
  }
}

/**
 * Process individual transcript events
 */
async function processTranscriptEvent(conversationId, event) {
  const eventType = event.type || event.event_type;
  const message = event.message || event.content || event.text;
  
  if (!message) return;
  
  // Update conversation activity
  conversationUtils.updateConversationActivity(conversationId);
  
  switch (eventType) {
    case 'user_transcript':
    case 'user_message':
    case 'user_response':
      broadcastTranscript('user_transcript', message, conversationId);
      break;
      
    case 'agent_response':
    case 'agent_message':  
    case 'assistant_response':
      broadcastTranscript('agent_response', message, conversationId);
      break;
      
    case 'agent_response_correction':
      broadcastTranscript('agent_response', `[Corrected] ${message}`, conversationId);
      break;
      
    default:
      console.log(`📋 Unknown transcript event type: ${eventType} for ${conversationId}`);
  }
}

/**
 * Clean up conversations that are no longer active in MCP response
 */
async function cleanupInactiveConversations(activeConversations) {
  const activeIds = new Set(activeConversations.map(c => c.conversation_id));
  
  for (const [conversationId, conversation] of activeInboundConversations.entries()) {
    if (!activeIds.has(conversationId) && conversation.status === 'active') {
      console.log(`🧹 Conversation ${conversationId} no longer active, cleaning up`);
      
      conversation.status = 'ended';
      conversation.endTime = new Date();
      
            (conversationId);
      
      // Broadcast call end
      broadcastTranscript('inbound_call_ended', 'Inbound call ended', conversationId);
      
      // Schedule cleanup
      setTimeout(() => {
        activeInboundConversations.delete(conversationId);
        conversationCache.delete(conversationId);
      }, 5000);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('📡 Shutting down conversation polling service...');
  stopConversationPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('📡 Shutting down conversation polling service...');
  stopConversationPolling();
  process.exit(0);
});

// Hangup endpoint for outbound calls
fastify.post("/api/calls/hangup", async (request, reply) => {
  const { callSid } = request.body;
  
  if (!callSid) {
    console.log("❌ Hangup called without callSid");
    return reply.code(400).send({ error: "callSid is required" });
  }
  
  console.log(`📞 Hanging up call: ${callSid}`);
  
  try {
    // First fetch the current call status to determine the best termination method
    const currentCall = await twilioClient.calls(callSid).fetch();
    
    let terminatedCall;
    
    if (currentCall.status === 'in-progress') {
      // Call is connected with active media stream - use TwiML Hangup
      terminatedCall = await twilioClient.calls(callSid).update({
        twiml: '<Response><Hangup/></Response>'
      });
      
    } else if (currentCall.status === 'ringing' || currentCall.status === 'queued' || currentCall.status === 'initiated') {
      // Call hasn't been answered yet - use status update to cancel
      terminatedCall = await twilioClient.calls(callSid).update({ 
        status: 'completed' 
      });
      
    } else {
      // Call is already in a terminal state
      terminatedCall = currentCall;
    }
    
    // Clean up WebSocket connections if they exist
    if (activeWebSocketConnections.has(callSid)) {
      const connections = activeWebSocketConnections.get(callSid);

      if (connections.elevenLabsWs && connections.elevenLabsWs.readyState === WebSocket.OPEN) {
        connections.elevenLabsWs.close();
      }

      if (connections.twilioWs && connections.twilioWs.readyState === WebSocket.OPEN) {
        connections.twilioWs.close();
      }

      activeWebSocketConnections.delete(callSid);
    }

    
        if (activeCallHistories.has(callSid)) {
      (callSid, 'ended by user');
    }
    
    // Broadcast call ended event
    broadcastTranscript('call_ended', 'Call terminated by user', callSid);
    
    reply.send({ 
      success: true, 
      message: "Call terminated successfully"
    });
  } catch (error) {
    console.error(`❌ Hangup failed:`, error.message);
    
    reply.code(500).send({ 
      success: false, 
      error: error.message,
      code: error.code
    });
  }
});

// Test endpoint for mock conversation (no credits required)
fastify.post("/test-transcript", async (request, reply) => {
  console.log("🧪 Test transcript endpoint called");
  
  // Mock conversation sequence
  const mockMessages = [
    { type: 'agent_response', message: 'Hi, this is an AI assistant calling. How are you today?' },
    { type: 'user_transcript', message: 'Hi there, I am doing well, thank you for asking.' },
    { type: 'agent_response', message: 'That is great to hear! Is there anything I can help you with today?' },
    { type: 'user_transcript', message: 'Actually yes, I wanted to ask about your services.' },
    { type: 'agent_response', message: 'I would be happy to tell you about our services. What specific information are you looking for?' }
  ];
  
  // Send messages with delay to simulate real conversation
  let delay = 500;
  mockMessages.forEach((msg, index) => {
    setTimeout(() => {
      console.log(`🧪 Broadcasting mock message ${index + 1}:`, msg.type, msg.message);
      broadcastTranscript(msg.type, msg.message);
    }, delay);
    delay += 2000; // 2 second intervals
  });
  
  reply.send({ 
    success: true, 
    message: "Mock conversation started",
    messageCount: mockMessages.length 
  });
});

// Initialize Twilio client
const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Ngrok domain for webhooks
const NGROK_DOMAIN = process.env.NGROK_DOMAIN || 'included-verified-tarpon.ngrok-free.app';

// Helper function to get signed URL for authenticated conversations
async function getSignedUrl() {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: "GET",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

// Proxy route for frontend
fastify.post("/proxy-outbound-call", async (request, reply) => {
  const { number, contactName } = request.body;

  if (!number) {
    return reply.code(400).send({ error: "Phone number is required" });
  }

  try {
    const call = await twilioClient.calls.create({
      from: selectedTwilioNumber,
      to: number,
      url: `https://${NGROK_DOMAIN}/outbound-call-twiml`,
      statusCallback: `https://${NGROK_DOMAIN}/call-status`,
      statusCallbackEvent: ['completed'],
    });

    console.log(`Call initiated: ${call.sid}`);
    
        
    reply.send({
      success: true,
      message: "Call initiated",
      callSid: call.sid,
    });
  } catch (error) {
    console.error("❌ DETAILED TWILIO ERROR:");
    console.error("- Message:", error.message);
    console.error("- Code:", error.code);
    console.error("- Status:", error.status);
    console.error("- More info:", error.moreInfo);
    console.error("- Full error:", error);
    reply.code(500).send({
      success: false,
      error: "Failed to initiate call",
      details: error.message,
      twilioCode: error.code,
      moreInfo: error.moreInfo
    });
  }
});


// Route to initiate outbound calls
fastify.post("/outbound-call", async (request, reply) => {
  const { number } = request.body;

  if (!number) {
    return reply.code(400).send({ error: "Phone number is required" });
  }

  try {
    const call = await twilioClient.calls.create({
      from: selectedTwilioNumber,
      to: number,
      url: `https://${NGROK_DOMAIN}/outbound-call-twiml`,
      statusCallback: `https://${NGROK_DOMAIN}/call-status`,
      statusCallbackEvent: ['completed'],
    });

    reply.send({
      success: true,
      message: "Call initiated",
      callSid: call.sid,
    });
  } catch (error) {
    console.error("❌ DETAILED TWILIO ERROR:");
    console.error("- Message:", error.message);
    console.error("- Code:", error.code);
    console.error("- Status:", error.status);
    console.error("- More info:", error.moreInfo);
    console.error("- Full error:", error);
    reply.code(500).send({
      success: false,
      error: "Failed to initiate call",
      details: error.message,
      twilioCode: error.code,
      moreInfo: error.moreInfo
    });
  }
});

// Call status webhook to track call progress
fastify.all("/call-status", async (request, reply) => {
  const { CallStatus, CallSid, CallDuration } = request.body || {};
  
  if (CallStatus) {
    console.log(`Call ${CallSid}: ${CallStatus}${CallDuration ? ` (${CallDuration}s)` : ''}`);
    broadcastTranscript('call_status', `Call status: ${CallStatus}`);
    
    // Finalize call history when call completes
    if (CallStatus === 'completed' || CallStatus === 'busy' || CallStatus === 'no-answer' || CallStatus === 'failed') {
      (CallSid, CallStatus);
    }
  }
  
  reply.type('text/xml').send('<Response></Response>');
});


// TwiML route for outbound calls
fastify.all("/outbound-call-twiml", async (request, reply) => {
  const streamUrl = `wss://${request.headers.host}/outbound-media-stream`;
  const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;

  reply
    .type("text/xml")
    .header('Cache-Control', 'no-cache')
    .send(twimlResponse);
});

// WebSocket connections for real-time transcript updates
const transcriptClients = new Set();

// Global agent configuration shared between all WebSocket connections
let globalAgentConfig = {};


// WebSocket connection tracking for hangup cleanup
const activeWebSocketConnections = new Map(); // Maps callSid to { twilioWs, elevenLabsWs }

// Track calls that already have ElevenLabs connections to prevent duplicates
const activeElevenLabsCalls = new Set(); // Set of callSids with active ElevenLabs connections

// Track the first WebSocket (ringing phase) to close it when second connects
let ringingPhaseWebSocket = null;







// WebSocket route for transcript updates
fastify.register(async fastifyInstance => {
  fastifyInstance.get(
    "/transcript-ws",
    { websocket: true },
    (ws, req) => {
      console.log("🔗 Transcript client connected");
      transcriptClients.add(ws);
      
      ws.on("close", () => {
        console.log("🔗 Transcript client disconnected");
        transcriptClients.delete(ws);
      });
      
      ws.on("error", (error) => {
        console.error("❌ Transcript WebSocket error:", error);
        transcriptClients.delete(ws);
      });
    }
  );
});

// Function to broadcast transcript messages to all connected clients
function broadcastTranscript(type, message, callSidOrConversationId = null) {
  console.log(`📡 [${type}]: ${message}`);
  
    if (callSidOrConversationId && (type === 'agent_response' || type === 'user_transcript')) {
    const speaker = type === 'agent_response' ? 'Agent' : 'User';
      }
  
  // Include conversation_id in the broadcast data for frontend routing
  const data = JSON.stringify({ 
    type, 
    message, 
    timestamp: new Date().toISOString(),
    conversation_id: callSidOrConversationId
  });
  
  let sentCount = 0;
  let errorCount = 0;
  
  transcriptClients.forEach(client => {
    const readyState = client.readyState ?? client.socket?.readyState ?? client._socket?.readyState;
    
    if (readyState === 1) { // WebSocket.OPEN
      try {
        if (client.send) {
          client.send(data);
        } else if (client.socket?.send) {
          client.socket.send(data);
        } else {
          console.error("❌ No send method found on client");
          return;
        }
        sentCount++;
      } catch (error) {
        console.error("❌ Error sending to client:", error);
        transcriptClients.delete(client);
        errorCount++;
      }
    } else {
      transcriptClients.delete(client);
    }
  });
  
  if (errorCount > 0 || transcriptClients.size === 0) {
    console.log(`📊 Broadcast: ${sentCount} sent, ${errorCount} errors, ${transcriptClients.size} clients`);
  }
}




// WebSocket route for handling media streams
fastify.register(async fastifyInstance => {
  fastifyInstance.get(
    "/outbound-media-stream",
    { websocket: true },
    (ws, req) => {
      console.log("[Server] Twilio connected to outbound media stream");

      // Variables to track the call
      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      // Use global configuration that can be shared between connections
      let agentConfig = {...globalAgentConfig};
      let audioBuffer = []; // Buffer audio until StreamSid is available
      let streamStarted = false; // Track if Twilio stream has started
      let messageCount = 0; // Count messages from Twilio

      ws.socket.on("error", (error) => {
        console.error("[Twilio] WebSocket error:", error);
      });

      ws.socket.on("close", (code, reason) => {
        console.log(`[Twilio] WebSocket closed - Code: ${code}, Reason: ${reason}`);

        // ALWAYS close ElevenLabs connection if it exists (critical for preventing orphaned connections)
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          console.log("[Cleanup] Closing ElevenLabs connection");
          elevenLabsWs.close();

        }

        // Clean up WebSocket connection tracking
        if (callSid && activeWebSocketConnections.has(callSid)) {
          const connections = activeWebSocketConnections.get(callSid);
          activeWebSocketConnections.delete(callSid);
        }

        // Clean up ElevenLabs call tracking
        if (callSid && activeElevenLabsCalls.has(callSid)) {
          activeElevenLabsCalls.delete(callSid);
          console.log(`[CLEANUP] Removed call ${callSid} from active ElevenLabs calls`);
        }


        // Finalize call history if call was active
        if (callSid) {
          // finalizeCallHistory(callSid, 'disconnected');
        }
      });


      // Set up ElevenLabs connection - only called after configuration is received
      const setupElevenLabs = async () => {
        // If we already have an ElevenLabs connection on this WebSocket, don't create another
        if (elevenLabsWs) {
          console.log(`[SKIP] ElevenLabs connection already exists on this WebSocket`);
          return;
        }


        try {
          console.log(`[NEW] Creating ElevenLabs connection for call ${callSid || 'unknown'}`);
          const signedUrl = await getSignedUrl();
          elevenLabsWs = new WebSocket(signedUrl);

          elevenLabsWs.on("open", () => {
            console.log("[ElevenLabs] Connected to Conversational AI");

            console.log(`[CREATED] ElevenLabs connection for call ${callSid || 'unknown'}`);

            // Track this call to prevent duplicates
            if (callSid) {
              activeElevenLabsCalls.add(callSid);
              console.log(`[TRACKING] Added call ${callSid} to active ElevenLabs calls`);
            }

            // Update WebSocket tracking with ElevenLabs connection
            if (callSid && activeWebSocketConnections.has(callSid)) {
              const connections = activeWebSocketConnections.get(callSid);
              connections.elevenLabsWs = elevenLabsWs;
              activeWebSocketConnections.set(callSid, connections);
            }

            // Send initial configuration with prompt, first message, and audio format
            const initialConfig = {
              type: "conversation_initiation_client_data",
              conversation_config_override: {
                agent: {
                  prompt: {
                    prompt: agentConfig.prompt
                  },
                  first_message: agentConfig.first_message
                },
                audio_interface: {
                  output_format: "ulaw_8000"
                }
              },
            };

            console.log("[ElevenLabs] Sending config with:", {
              system_prompt: agentConfig.prompt,
              first_message: agentConfig.first_message
            });
            
            // Ensure WebSocket is fully ready before sending
            if (elevenLabsWs.readyState === WebSocket.OPEN) {
              elevenLabsWs.send(JSON.stringify(initialConfig));
            } else {
              console.log("[ElevenLabs] WebSocket not ready, waiting...");
              setTimeout(() => {
                if (elevenLabsWs.readyState === WebSocket.OPEN) {
                  elevenLabsWs.send(JSON.stringify(initialConfig));
                  console.log("[ElevenLabs] Config sent after delay");
                } else {
                  console.error("[ElevenLabs] WebSocket still not ready after delay");
                }
              }, 100);
            }
          });

          elevenLabsWs.on("message", async (data) => {
            try {
              const message = JSON.parse(data);

              switch (message.type) {
                case "conversation_initiation_metadata":
                  // Display the first message when conversation starts
                  if (agentConfig.first_message) {
                    broadcastTranscript('agent_response', agentConfig.first_message, callSid);
                  }
                  break;

                case "agent_response":
                  const agentResponse = message.agent_response_event?.agent_response || message.agent_response;
                  if (agentResponse) {
                    broadcastTranscript('agent_response', agentResponse, callSid);
                  }
                  break;

                case "user_transcript":
                  const userTranscript = message.user_transcription_event?.user_transcript || message.user_transcript;
                  if (userTranscript) {
                    broadcastTranscript('user_transcript', userTranscript, callSid);
                  }
                  break;

                case "audio":
                  let audioPayload = null;
                  if (message.audio?.chunk) {
                    audioPayload = message.audio.chunk;
                  } else if (message.audio_event?.audio_base_64) {
                    audioPayload = message.audio_event.audio_base_64;
                  }
                  
                  if (audioPayload) {
                    if (streamStarted && streamSid) {
                      // Stream is ready - send audio immediately
                      const audioData = {
                        event: "media",
                        streamSid,
                        media: {
                          track: "outbound",
                          payload: audioPayload,
                        },
                      };
                      ws.socket.send(JSON.stringify(audioData));
                    } else {
                      // Buffer audio until stream starts
                      audioBuffer.push(audioPayload);
                    }
                  }
                  break;

                case "interruption":
                  if (streamSid) {
                    ws.socket.send(
                      JSON.stringify({
                        event: "clear",
                        streamSid,
                      })
                    );
                  }
                  break;

                case "ping":
                  if (message.ping_event?.event_id) {
                    elevenLabsWs.send(
                      JSON.stringify({
                        type: "pong",
                        event_id: message.ping_event.event_id,
                      })
                    );
                  }
                  break;



                case "agent_response_correction":
                  const correctedResponse = message.agent_response_correction_event?.corrected_response;
                  if (correctedResponse) {
                    broadcastTranscript('agent_response', `[Corrected] ${correctedResponse}`);
                  }
                  break;
              }
            } catch (error) {
              console.error("[ElevenLabs] Error processing message:", error);
            }
          });

          elevenLabsWs.on("error", error => {
            console.error("[ElevenLabs] WebSocket error:", error);
            broadcastTranscript('call_status', 'Connection error occurred');
          });

          elevenLabsWs.on("close", (code, reason) => {
            console.log(`[ElevenLabs] Disconnected`);
            broadcastTranscript('call_status', 'AI service disconnected');
          });
        } catch (error) {
          console.error("[ElevenLabs] Setup error:", error);
        }
      };

      // Wait 1 second then create ElevenLabs connection
      setTimeout(() => {
        if (!elevenLabsWs) {
          // Don't create ElevenLabs during ringing phase (no callSid yet)
          if (!callSid) {
            ringingPhaseWebSocket = ws;
            console.log("⏰ [TIMEOUT] Ringing phase - waiting for pickup before creating ElevenLabs");
            return;
          }

          // Check if this call already has an ElevenLabs connection
          if (activeElevenLabsCalls.has(callSid)) {
            console.log(`⏰ [TIMEOUT] Skipping - call ${callSid} already has ElevenLabs connection`);
            return;
          }

          console.log("⏰ [TIMEOUT] Creating ElevenLabs connection after 1 second delay");
          setupElevenLabs();
        }
      }, 1000); // Wait 1 second for frontend configuration

      // Handle configuration messages from frontend (JSON) and Twilio messages
      ws.socket.on("message", (message, isBinary) => {
        try {
          const msg = JSON.parse(message);
          messageCount++;

          // Handle frontend configuration messages
          if (msg.type === "configure_agent") {
            console.log("🔥 Agent config received:", {
              prompt: msg.prompt?.substring(0, 50) + "...",
              first_message: msg.first_message
            });

            // Update GLOBAL config so all connections can use it
            globalAgentConfig = {
              prompt: msg.prompt || globalAgentConfig.prompt,
              first_message: msg.first_message || globalAgentConfig.first_message
            };

            // Update local config too
            agentConfig = {...globalAgentConfig};

            // Don't create ElevenLabs immediately - wait for 1-second timeout
            console.log("📝 Config received, will initialize ElevenLabs after 1 second delay");
            return;
          }

          switch (msg.event) {
            case "connected":
              console.log("[Twilio] Connected - waiting for stream start");
              break;

            case "start":
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              streamStarted = true;

              console.log(`[Twilio] Stream started: ${streamSid} for call ${callSid}`);

              console.log(`[START] Stream started for call ${callSid}`);

              // Close the ringing phase WebSocket if this is the pickup connection
              if (ringingPhaseWebSocket && ringingPhaseWebSocket !== ws) {
                console.log("[PICKUP] Closing ringing phase WebSocket - call was answered");
                ringingPhaseWebSocket.socket.close();
                ringingPhaseWebSocket = null;
              }

              // Create ElevenLabs connection now that call is answered
              if (!elevenLabsWs && !activeElevenLabsCalls.has(callSid)) {
                console.log("[PICKUP] Call answered - creating ElevenLabs connection");
                setupElevenLabs();
              }

              // Track this call for ElevenLabs if connection already exists
              if (callSid && elevenLabsWs && !activeElevenLabsCalls.has(callSid)) {
                activeElevenLabsCalls.add(callSid);
                console.log(`[TRACKING] Added call ${callSid} to active ElevenLabs calls (from start event)`);
              }

              // Track WebSocket connections for hangup cleanup
              if (callSid) {
                activeWebSocketConnections.set(callSid, {
                  twilioWs: ws,
                  elevenLabsWs: elevenLabsWs, // May be null initially, will be updated
                  streamSid: streamSid
                });
              }
              
              // Flush any buffered audio from ElevenLabs
              if (audioBuffer.length > 0) {
                console.log(`[Buffer] Flushing ${audioBuffer.length} audio chunks`);
                audioBuffer.forEach((audioPayload) => {
                  const audioData = {
                    event: "media",
                    streamSid,
                    media: {
                      track: "outbound",
                      payload: audioPayload,
                    },
                  };
                  ws.socket.send(JSON.stringify(audioData));
                });
                audioBuffer = [];
              }
              
              broadcastTranscript('call_status', 'Call connected');
              break;

            case "media":
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                const audioMessage = {
                  type: "user_audio_chunk",
                  user_audio_chunk: msg.media.payload,
                };
                elevenLabsWs.send(JSON.stringify(audioMessage));
              }
              break;

            case "stop":
              console.log(`[Twilio] Stream ended: ${streamSid}`);
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                elevenLabsWs.close();
              }
              // Don't automatically broadcast "Call ended" - let Twilio status callbacks handle this
              broadcastTranscript('call_status', 'Stream ended');
              break;
          }
        } catch (error) {
          console.error("[Twilio] Error processing message:", error.message);
        }
      });
      

      ws.on("close", () => {
        if (elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });
    }
  );
});

/**
 * Get specific conversation data by call_sid using direct ElevenLabs API
 */
async function getConversationByCallSid(callSid) {
  try {
    console.log(`🔍 Fetching conversation data for call_sid: ${callSid}`);
    
    // First, get all conversations and find the one matching our call_sid
    const response = await fetch('https://api.elevenlabs.io/v1/convai/conversations', {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error(`❌ ElevenLabs API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const conversationsData = await response.json();
    const conversation = conversationsData.conversations?.find(conv => 
      conv.conversation_id === callSid || 
      conv.call_sid === callSid ||
      conv.id === callSid
    );
    
    if (conversation) {
      console.log(`✅ Found conversation for call_sid ${callSid}:`, conversation.conversation_id || conversation.id);
      return conversation;
    } else {
      console.log(`⚠️ No conversation found for call_sid: ${callSid} in ${conversationsData.conversations?.length || 0} conversations`);
      return null;
    }
    
  } catch (error) {
    console.error(`❌ Error fetching conversation for call_sid ${callSid}:`, error.message);
    return null;
  }
}

// Start the Fastify server
fastify.listen({ port: PORT }, err => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log(`[Server] Listening on port ${PORT}`);
  console.log(`[Webhook] ElevenLabs webhook endpoint: http://localhost:${PORT}/elevenlabs-webhook`);
  console.log(`[Webhook] Ngrok URL: https://${NGROK_DOMAIN}/elevenlabs-webhook`);
  console.log(`[API] Active conversations: http://localhost:${PORT}/inbound-conversations`);
});