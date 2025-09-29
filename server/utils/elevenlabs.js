import WebSocket from 'ws';
import { settings } from './dataStore.js';

// Helper function to get signed URL for authenticated conversations
export async function getSignedUrl() {
  // Get ElevenLabs configuration from environment at runtime, not import time
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
  
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    throw new Error(`Missing ElevenLabs environment variables: API_KEY=${ELEVENLABS_API_KEY ? 'Set' : 'Missing'}, AGENT_ID=${ELEVENLABS_AGENT_ID ? 'Set' : 'Missing'}`);
  }
  
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get signed URL: ${response.statusText}`);
    }

    const data = await response.json();
    return data.signed_url;
  } catch (error) {
    console.error('Error getting signed URL:', error);
    throw error;
  }
}

// Create ElevenLabs WebSocket connection
export async function createElevenLabsConnection(config = {}) {
  try {
    const signedUrl = await getSignedUrl();
    const elevenLabsWs = new WebSocket(signedUrl);
    
    // Get settings from dataStore if not provided
    const agentConfig = {
      prompt: config.prompt || settings.getSystemPrompt(),
      first_message: config.first_message || settings.getFirstMessage()
    };

    return new Promise((resolve, reject) => {
      elevenLabsWs.on('open', () => {
        console.log('[ElevenLabs] Connected to Conversational AI');

        // Send initial configuration with prompt, first message, and audio format
        const initialConfig = {
          type: 'conversation_initiation_client_data',
          conversation_config_override: {
            agent: {
              prompt: {
                prompt: agentConfig.prompt
              },
              first_message: agentConfig.first_message
            },
            audio_interface: {
              output_format: 'ulaw_8000'
            }
          },
        };

        console.log('[ElevenLabs] Sending config with:', {
          system_prompt: agentConfig.prompt?.substring(0, 50) + '...',
          first_message: agentConfig.first_message
        });
        
        elevenLabsWs.send(JSON.stringify(initialConfig));
        resolve(elevenLabsWs);
      });

      elevenLabsWs.on('error', (error) => {
        console.error('[ElevenLabs] WebSocket error:', error);
        reject(error);
      });

      // Set timeout for connection
      setTimeout(() => {
        if (elevenLabsWs.readyState !== WebSocket.OPEN) {
          elevenLabsWs.close();
          reject(new Error('ElevenLabs connection timeout'));
        }
      }, 10000); // 10 second timeout
    });
  } catch (error) {
    console.error('[ElevenLabs] Setup error:', error);
    throw error;
  }
}

// Handle ElevenLabs message processing
export function processElevenLabsMessage(message, handlers = {}) {
  try {
    const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;

    switch (parsedMessage.type) {
      case 'conversation_initiation_metadata':
        if (handlers.onMetadata) {
          handlers.onMetadata(parsedMessage);
        }
        break;

      case 'audio':
        if (handlers.onAudio) {
          let audioPayload = null;
          if (parsedMessage.audio?.chunk) {
            audioPayload = parsedMessage.audio.chunk;
          } else if (parsedMessage.audio_event?.audio_base_64) {
            audioPayload = parsedMessage.audio_event.audio_base_64;
          }
          
          if (audioPayload) {
            handlers.onAudio(audioPayload);
          }
        }
        break;

      case 'interruption':
        if (handlers.onInterruption) {
          handlers.onInterruption();
        }
        break;

      case 'ping':
        if (parsedMessage.ping_event?.event_id && handlers.onPing) {
          handlers.onPing(parsedMessage.ping_event.event_id);
        }
        break;

      case 'agent_response':
        const agentResponse = parsedMessage.agent_response_event?.agent_response;
        if (agentResponse && handlers.onAgentResponse) {
          handlers.onAgentResponse(agentResponse);
        }
        break;

      case 'user_transcript':
        const userTranscript = parsedMessage.user_transcription_event?.user_transcript;
        if (userTranscript && handlers.onUserTranscript) {
          handlers.onUserTranscript(userTranscript);
        }
        break;

      case 'agent_response_correction':
        const correctedResponse = parsedMessage.agent_response_correction_event?.corrected_response;
        if (correctedResponse && handlers.onAgentCorrection) {
          handlers.onAgentCorrection(correctedResponse);
        }
        break;

      default:
        if (handlers.onUnknown) {
          handlers.onUnknown(parsedMessage);
        }
    }
  } catch (error) {
    console.error('[ElevenLabs] Error processing message:', error);
    if (handlers.onError) {
      handlers.onError(error);
    }
  }
}

// Send user audio chunk to ElevenLabs
export function sendUserAudio(elevenLabsWs, audioPayload) {
  if (elevenLabsWs?.readyState === WebSocket.OPEN) {
    const audioMessage = {
      type: 'user_audio_chunk',
      user_audio_chunk: audioPayload,
    };
    elevenLabsWs.send(JSON.stringify(audioMessage));
  }
}

// Send pong response to ElevenLabs
export function sendPong(elevenLabsWs, eventId) {
  if (elevenLabsWs?.readyState === WebSocket.OPEN) {
    elevenLabsWs.send(
      JSON.stringify({
        type: 'pong',
        event_id: eventId,
      })
    );
  }
}

export default {
  getSignedUrl,
  createElevenLabsConnection,
  processElevenLabsMessage,
  sendUserAudio,
  sendPong
};