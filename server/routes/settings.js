import { settings } from '../utils/dataStore.js';

export default async function settingsRoutes(fastify, opts) {
  // Get current settings
  fastify.get('/api/settings', async (request, reply) => {
    try {
      const currentSettings = settings.get();
      return reply.send({
        success: true,
        data: currentSettings
      });
    } catch (error) {
      console.error('Error fetching settings:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch settings'
      });
    }
  });

  // Update settings
  fastify.post('/api/settings', async (request, reply) => {
    try {
      const { systemPrompt, firstMessage, uiPreferences } = request.body;
      
      const updates = {};
      
      // Validate and add system prompt
      if (systemPrompt !== undefined) {
        if (typeof systemPrompt !== 'string' || systemPrompt.trim().length === 0) {
          return reply.code(400).send({
            success: false,
            error: 'System prompt must be a non-empty string'
          });
        }
        updates.systemPrompt = systemPrompt.trim();
      }
      
      // Validate and add first message
      if (firstMessage !== undefined) {
        if (typeof firstMessage !== 'string' || firstMessage.trim().length === 0) {
          return reply.code(400).send({
            success: false,
            error: 'First message must be a non-empty string'
          });
        }
        updates.firstMessage = firstMessage.trim();
      }
      
      // Handle UI preferences
      if (uiPreferences !== undefined) {
        const currentSettings = settings.get();
        updates.uiPreferences = {
          ...currentSettings.uiPreferences,
          ...uiPreferences
        };
      }
      
      // Apply updates
      const updatedSettings = settings.update(updates);
      
      // Also update the global agent config if system prompt or first message changed
      if (systemPrompt || firstMessage) {
        // This will be used by the WebSocket handlers
        fastify.updateGlobalAgentConfig({
          prompt: updatedSettings.systemPrompt,
          first_message: updatedSettings.firstMessage
        });
      }
      
      return reply.send({
        success: true,
        data: updatedSettings,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update settings'
      });
    }
  });

  // Get just the agent configuration (system prompt and first message)
  fastify.get('/api/settings/agent', async (request, reply) => {
    try {
      const systemPrompt = settings.getSystemPrompt();
      const firstMessage = settings.getFirstMessage();
      
      return reply.send({
        success: true,
        data: {
          systemPrompt,
          firstMessage
        }
      });
    } catch (error) {
      console.error('Error fetching agent settings:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch agent settings'
      });
    }
  });

  // Reset settings to defaults
  fastify.post('/api/settings/reset', async (request, reply) => {
    try {
      const defaultSettings = {
        systemPrompt: "You are a helpful assistant from the phone store",
        firstMessage: "Hello! How can I help you today?",
        uiPreferences: {
          theme: "light",
          autoAnswer: false
        }
      };
      
      const resetSettings = settings.update(defaultSettings);
      
      // Update global agent config
      fastify.updateGlobalAgentConfig({
        prompt: resetSettings.systemPrompt,
        first_message: resetSettings.firstMessage
      });
      
      return reply.send({
        success: true,
        data: resetSettings,
        message: 'Settings reset to defaults'
      });
    } catch (error) {
      console.error('Error resetting settings:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to reset settings'
      });
    }
  });
}