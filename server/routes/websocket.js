import WebSocket from 'ws';
import { 
  createElevenLabsConnection, 
  processElevenLabsMessage, 
  sendUserAudio, 
  sendPong 
} from '../utils/elevenlabs.js';
import { settings } from '../utils/dataStore.js';

// WebSocket connections for real-time transcript updates
const transcriptClients = new Set();

// Global agent configuration shared between all WebSocket connections  
let globalAgentConfig = {
  prompt: "You are a friendly AI assistant making a phone call. Your goal is to have a natural conversation with the person who answers. Be polite, clear, and respectful.",
  first_message: "Hi, this is an AI assistant calling. How are you today?"
};

// Initialize global config from settings
export function initializeGlobalConfig() {
  globalAgentConfig = {
    prompt: settings.getSystemPrompt(),
    first_message: settings.getFirstMessage()
  };
  return globalAgentConfig;
}

// Update global agent configuration
export function updateGlobalAgentConfig(config) {
  globalAgentConfig = {
    prompt: config.prompt || globalAgentConfig?.prompt || settings.getSystemPrompt(),
    first_message: config.first_message || globalAgentConfig?.first_message || settings.getFirstMessage()
  };
  console.log('[WebSocket] Global agent config updated:', {
    prompt: globalAgentConfig.prompt?.substring(0, 50) + '...',
    first_message: globalAgentConfig.first_message
  });
  return globalAgentConfig;
}

// Function to broadcast transcript messages to all connected clients
export function broadcastTranscript(type, message) {
  const data = JSON.stringify({ 
    type, 
    message, 
    timestamp: new Date().toISOString() 
  });
  
  transcriptClients.forEach(client => {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(data);
      } catch (error) {
        transcriptClients.delete(client);
      }
    } else {
      transcriptClients.delete(client);
    }
  });
}

export default async function websocketRoutes(fastify, opts) {
  // Expose broadcast function to fastify instance
  fastify.decorate('broadcastTranscript', broadcastTranscript);
  fastify.decorate('updateGlobalAgentConfig', updateGlobalAgentConfig);

  // WebSocket route for transcript updates
  fastify.get(
    '/transcript-ws',
    { websocket: true },
    (connection, req) => {
      const ws = connection.socket;
      transcriptClients.add(ws);
      console.log('[Transcript WS] Client connected. Total clients:', transcriptClients.size);
      
      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connection',
        message: 'Connected to transcript service',
        timestamp: new Date().toISOString()
      }));
      
      ws.on('close', () => {
        transcriptClients.delete(ws);
        console.log('[Transcript WS] Client disconnected. Total clients:', transcriptClients.size);
      });
      
      ws.on('error', (error) => {
        console.error('[Transcript WS] WebSocket error:', error);
        transcriptClients.delete(ws);
      });
    }
  );


  // WebSocket route for handling media streams
  fastify.get(
    '/outbound-media-stream',
    { websocket: true },
    (ws, req) => {
      console.log('[Server] Twilio connected to outbound media stream');

      // Variables to track the call
      let streamSid = null;
      let callSid = null;
      let elevenLabsWs = null;
      let elevenLabsConnected = false; // Flag to prevent duplicate connections
      // Use global configuration that can be shared between connections
      let agentConfig = {...globalAgentConfig};
      let audioBuffer = []; // Buffer audio until StreamSid is available
      let streamStarted = false; // Track if Twilio stream has started
      let messageCount = 0; // Count messages from Twilio

      ws.socket.on('error', (error) => {
        console.error('[Twilio] WebSocket error:', error);
      });
      
      ws.socket.on('close', (code, reason) => {
        console.log(`[Twilio] WebSocket closed - Code: ${code}, Reason: ${reason}`);
        if (elevenLabsWs?.readyState === WebSocket.OPEN) {
          elevenLabsWs.close();
        }
      });

      // Set up ElevenLabs connection - only called after configuration is received
      const setupElevenLabs = async () => {
        if (elevenLabsConnected) {
          console.log('[ElevenLabs] Already connected, skipping duplicate connection');
          return;
        }
        elevenLabsConnected = true;
        
        try {
          elevenLabsWs = await createElevenLabsConnection(agentConfig);
          
          // Set up message handlers
          elevenLabsWs.on('message', data => {
            processElevenLabsMessage(data, {
              onAudio: (audioPayload) => {
                if (streamStarted && streamSid) {
                  // Stream is ready - send audio immediately
                  const audioData = {
                    event: 'media',
                    streamSid,
                    media: {
                      track: 'outbound',
                      payload: audioPayload,
                    },
                  };
                  ws.socket.send(JSON.stringify(audioData));
                } else {
                  // Buffer audio until stream starts
                  audioBuffer.push(audioPayload);
                }
              },
              onInterruption: () => {
                if (streamSid) {
                  ws.socket.send(
                    JSON.stringify({
                      event: 'clear',
                      streamSid,
                    })
                  );
                }
              },
              onPing: (eventId) => {
                sendPong(elevenLabsWs, eventId);
              },
              onAgentResponse: (response) => {
                broadcastTranscript('agent_response', response);
              },
              onUserTranscript: (transcript) => {
                broadcastTranscript('user_transcript', transcript);
              },
              onAgentCorrection: (correctedResponse) => {
                broadcastTranscript('agent_response', `[Corrected] ${correctedResponse}`);
              }
            });
          });

          elevenLabsWs.on('error', error => {
            console.error('[ElevenLabs] WebSocket error:', error);
            broadcastTranscript('call_status', 'Connection error occurred');
          });

          elevenLabsWs.on('close', (code, reason) => {
            console.log(`[ElevenLabs] Disconnected`);
            broadcastTranscript('call_status', 'AI service disconnected');
          });
        } catch (error) {
          console.error('[ElevenLabs] Setup error:', error);
          elevenLabsConnected = false; // Reset flag on error
          broadcastTranscript('call_status', 'Failed to connect to AI service');
        }
      };

      // Wait for frontend configuration before initializing ElevenLabs
      setTimeout(() => {
        if (!elevenLabsConnected) {
          console.log('[TIMEOUT] No frontend config received, using defaults');
          console.log('[DEFAULT CONFIG]:', {
            prompt: agentConfig.prompt?.substring(0, 50) + '...',
            first_message: agentConfig.first_message
          });
          setupElevenLabs();
        }
      }, 1000); // Wait 1 second for frontend configuration

      // Handle configuration messages from frontend (JSON) and Twilio messages
      ws.socket.on('message', (message, isBinary) => {
        try {
          const msg = JSON.parse(message);
          messageCount++;

          // Handle frontend configuration messages
          if (msg.type === 'configure_agent') {
            console.log('🔥 [FRONTEND CONFIG] Received:', {
              prompt: msg.prompt?.substring(0, 50) + '...',
              first_message: msg.first_message
            });
            
            // Update GLOBAL config so all connections can use it
            globalAgentConfig = updateGlobalAgentConfig({
              prompt: msg.prompt,
              first_message: msg.first_message
            });
            
            // Update local config too
            agentConfig = {...globalAgentConfig};
            
            console.log('🚀 [FRONTEND CONFIG] Agent config updated');
            
            // Initialize ElevenLabs now that we have config
            if (!elevenLabsWs) {
              console.log('🚀 [FRONTEND CONFIG] Initializing ElevenLabs with frontend config');
              setupElevenLabs();
            }
            return;
          }

          // Handle Twilio messages
          switch (msg.event) {
            case 'connected':
              console.log('[Twilio] Connected - waiting for stream start');
              broadcastTranscript('call_status', 'Twilio connected');
              break;

            case 'start':
              streamSid = msg.start.streamSid;
              callSid = msg.start.callSid;
              streamStarted = true;
              
              console.log(`[Twilio] Stream started: ${streamSid}`);
              
              // Flush any buffered audio from ElevenLabs
              if (audioBuffer.length > 0) {
                console.log(`[Buffer] Flushing ${audioBuffer.length} audio chunks`);
                audioBuffer.forEach((audioPayload) => {
                  const audioData = {
                    event: 'media',
                    streamSid,
                    media: {
                      track: 'outbound',
                      payload: audioPayload,
                    },
                  };
                  ws.socket.send(JSON.stringify(audioData));
                });
                audioBuffer = [];
              }
              
              broadcastTranscript('call_status', 'Call connected');
              break;

            case 'media':
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                sendUserAudio(elevenLabsWs, msg.media.payload);
              }
              break;

            case 'stop':
              console.log(`[Twilio] Stream ended: ${streamSid}`);
              if (elevenLabsWs?.readyState === WebSocket.OPEN) {
                elevenLabsWs.close();
              }
              broadcastTranscript('call_status', 'Call ended');
              break;

            default:
              console.log(`[Twilio] Unknown event: ${msg.event}`);
          }
        } catch (error) {
          console.error('[Twilio] Error processing message:', error.message);
        }
      });
    }
  );
}