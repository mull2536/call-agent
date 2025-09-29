import Twilio from 'twilio';
import { callHistory, contacts } from '../utils/dataStore.js';
import { broadcastTranscript } from './websocket.js';

export default async function callsRoutes(fastify, opts) {
  // Get Twilio configuration from environment
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
  } = process.env;

  // Initialize Twilio client
  const twilioClient = new Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  
  // Ngrok domain for webhooks
  const NGROK_DOMAIN = process.env.NGROK_DOMAIN || 'included-verified-tarpon.ngrok-free.app';

  // Initiate outbound call (new API endpoint)
  fastify.post('/api/calls/outbound', async (request, reply) => {
    const { number, contactId } = request.body;

    if (!number) {
      return reply.code(400).send({ 
        success: false,
        error: 'Phone number is required' 
      });
    }

    try {
      // Create call via Twilio
      const call = await twilioClient.calls.create({
        from: TWILIO_PHONE_NUMBER,
        to: number,
        url: `https://${NGROK_DOMAIN}/outbound-call-twiml`,
        statusCallback: `https://${NGROK_DOMAIN}/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      console.log(`Call initiated: ${call.sid}`);
      
      // Record in call history
      const callRecord = callHistory.create({
        callSid: call.sid,
        contactId: contactId || null,
        phone: number,
        direction: 'outbound',
        status: 'initiated',
        duration: 0
      });

      // Update contact's lastCalled if contactId provided
      if (contactId) {
        const contact = contacts.getById(contactId);
        if (contact) {
          contacts.update(contactId, {
            lastCalled: new Date().toISOString()
          });
        }
      } else {
        // Update by phone number if no contactId
        contacts.updateLastCalled(number);
      }

      reply.send({
        success: true,
        message: 'Call initiated',
        data: {
          callSid: call.sid,
          callRecord
        }
      });
    } catch (error) {
      console.error('DETAILED TWILIO ERROR:');
      console.error('- Message:', error.message);
      console.error('- Code:', error.code);
      console.error('- Status:', error.status);
      console.error('- More info:', error.moreInfo);
      
      reply.code(500).send({
        success: false,
        error: 'Failed to initiate call',
        details: error.message,
        twilioCode: error.code,
        moreInfo: error.moreInfo
      });
    }
  });

  // Get call history
  fastify.get('/api/calls/history', async (request, reply) => {
    try {
      const { contactId, limit = 50 } = request.query;
      
      let history;
      if (contactId) {
        history = callHistory.getByContactId(contactId);
      } else {
        history = callHistory.getAll();
      }
      
      // Apply limit
      if (limit && history.length > limit) {
        history = history.slice(0, limit);
      }

      return reply.send({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Error fetching call history:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch call history'
      });
    }
  });

  // Legacy proxy endpoint (kept for backward compatibility)
  fastify.post('/proxy-outbound-call', async (request, reply) => {
    console.log('📞 DEBUG proxy-outbound-call received request.body:', request.body);
    const { number } = request.body;
    console.log('📞 DEBUG extracted number:', number);

    if (!number) {
      return reply.code(400).send({ error: 'Phone number is required' });
    }

    try {
      const call = await twilioClient.calls.create({
        from: TWILIO_PHONE_NUMBER,
        to: number,
        url: `https://${NGROK_DOMAIN}/outbound-call-twiml`,
        statusCallback: `https://${NGROK_DOMAIN}/call-status`,
        statusCallbackEvent: ['completed'],
      });

      console.log(`Call initiated: ${call.sid}`);
      
      // Record in call history
      callHistory.create({
        callSid: call.sid,
        phone: number,
        direction: 'outbound',
        status: 'initiated',
        duration: 0
      });

      reply.send({
        success: true,
        message: 'Call initiated',
        callSid: call.sid,
      });
    } catch (error) {
      console.error('DETAILED TWILIO ERROR:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to initiate call',
        details: error.message,
        twilioCode: error.code,
        moreInfo: error.moreInfo
      });
    }
  });

  // Legacy outbound call endpoint (kept for backward compatibility)
  fastify.post('/outbound-call', async (request, reply) => {
    const { number } = request.body;

    if (!number) {
      return reply.code(400).send({ error: 'Phone number is required' });
    }

    try {
      const call = await twilioClient.calls.create({
        from: TWILIO_PHONE_NUMBER,
        to: number,
        url: `https://${NGROK_DOMAIN}/outbound-call-twiml`,
        statusCallback: `https://${NGROK_DOMAIN}/call-status`,
        statusCallbackEvent: ['completed'],
      });

      // Record in call history
      callHistory.create({
        callSid: call.sid,
        phone: number,
        direction: 'outbound',
        status: 'initiated',
        duration: 0
      });

      reply.send({
        success: true,
        message: 'Call initiated',
        callSid: call.sid,
      });
    } catch (error) {
      console.error('DETAILED TWILIO ERROR:', error);
      reply.code(500).send({
        success: false,
        error: 'Failed to initiate call',
        details: error.message,
        twilioCode: error.code,
        moreInfo: error.moreInfo
      });
    }
  });

  // Call status webhook to track call progress
  fastify.all('/call-status', async (request, reply) => {
    const { CallStatus, CallSid, CallDuration, Direction } = request.body || {};
    
    if (CallStatus && CallSid) {
      console.log(`Call ${CallSid}: ${CallStatus}${CallDuration ? ` (${CallDuration}s)` : ''}`);
      
      // Update call history
      callHistory.update(CallSid, {
        status: CallStatus.toLowerCase(),
        duration: CallDuration ? parseInt(CallDuration) : 0
      });
      
      // Broadcast status update
      broadcastTranscript('call_status', `Call status: ${CallStatus}`);
    }
    
    reply.type('text/xml').send('<Response></Response>');
  });

  // TwiML route for outbound calls
  fastify.all('/outbound-call-twiml', async (request, reply) => {
    const streamUrl = `wss://${request.headers.host}/outbound-media-stream`;
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" />
  </Connect>
</Response>`;

    reply
      .type('text/xml')
      .header('Cache-Control', 'no-cache')
      .send(twimlResponse);
  });

  // Get call statistics
  fastify.get('/api/calls/stats', async (request, reply) => {
    try {
      const history = callHistory.getAll();
      
      const stats = {
        totalCalls: history.length,
        outboundCalls: history.filter(c => c.direction === 'outbound').length,
        inboundCalls: history.filter(c => c.direction === 'inbound').length,
        completedCalls: history.filter(c => c.status === 'completed').length,
        averageDuration: 0,
        todaysCalls: 0,
        thisWeeksCalls: 0
      };

      // Calculate average duration
      const completedWithDuration = history.filter(c => c.status === 'completed' && c.duration > 0);
      if (completedWithDuration.length > 0) {
        const totalDuration = completedWithDuration.reduce((sum, c) => sum + c.duration, 0);
        stats.averageDuration = Math.round(totalDuration / completedWithDuration.length);
      }

      // Calculate today's and this week's calls
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

      history.forEach(call => {
        const callDate = new Date(call.timestamp);
        if (callDate >= todayStart) {
          stats.todaysCalls++;
        }
        if (callDate >= weekStart) {
          stats.thisWeeksCalls++;
        }
      });

      return reply.send({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error calculating call statistics:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to calculate call statistics'
      });
    }
  });
}