# CLAUDE.md

**Project Purpose:**  
This repository is a Twilio + ElevenLabs conversational AI integration that enables AI-powered phone calls with real-time audio streaming and transcript display. The system supports outbound calls with bidirectional audio flow between callers and ElevenLabs conversational agents.

**Expertise Required:**  
AI assistants are to act as expert Node.js, WebSocket, and frontend developers. Focus on real-time audio processing, WebSocket communication, and telephony integrations. Use simple, readable code and respect the existing file structure.

## Personal Agents Available

This project uses specialized Claude Code agents for different aspects of development:

### **frontend-developer** 
- **Purpose**: HTML, CSS, JavaScript, and React development
- **Use for**: Building user interfaces, responsive design, frontend debugging, styling issues
- **Example**: "Use the frontend-developer agent to create a responsive call interface"

### **node-backend-developer**
- **Purpose**: Backend Node.js development, APIs, server architecture  
- **Use for**: Express/Fastify server development, WebSocket handling, API endpoints, middleware
- **Example**: "Use the node-backend-developer agent to optimize the audio streaming pipeline"

### **playwright-qa-tester**
- **Purpose**: Automated testing with Playwright
- **Use for**: End-to-end testing, browser automation, UI testing, call flow testing
- **Example**: "Use the playwright-qa-tester agent to create tests for the call workflow"

### **project-implementation-manager**
- **Purpose**: Project organization and complex implementation planning
- **Use for**: Breaking down complex features, project structure, implementation phases
- **Example**: "Use the project-implementation-manager agent to plan the video calling feature"

### **documentation-context-analyzer**
- **Purpose**: Documentation creation with deep codebase context
- **Use for**: API documentation, architecture docs, integration guides
- **Example**: "Use the documentation-context-analyzer agent to document the WebSocket message flow"

## MCP Integrations

### **Playwright MCP**
- **Purpose**: Browser automation and testing capabilities
- **Features**: Visual testing, cross-browser compatibility, performance testing
- **Use cases**: Testing call interfaces, validating UI flows, automated regression testing

### **Context7 MCP** 
- **Purpose**: Enhanced contextual understanding and code analysis
- **Features**: Deep codebase analysis, pattern recognition, architectural insights
- **Use cases**: Understanding complex integrations, identifying optimization opportunities

### **Perplexity MCP**
- **Purpose**: Real-time research and technical information lookup
- **Features**: Latest API documentation, troubleshooting guides, best practices
- **Use cases**: Researching Twilio/ElevenLabs API changes, finding solutions to integration issues

## Standard Workflow

1. **Understand the Problem:**  
   - Use Context7 MCP for deep codebase analysis when dealing with complex integrations
   - Carefully read the relevant code and files in this repository
   - Search project knowledge for existing implementations before proposing changes

2. **Research & Planning:**  
   - Use Perplexity MCP for latest API documentation and best practices
   - Draft a clear implementation plan outlining the proposed solution
   - Consider WebSocket communication patterns and audio processing requirements

3. **Implementation with Specialized Agents:**  
   - Use **node-backend-developer** for server-side logic and API development
   - Use **frontend-developer** for UI components and client-side functionality
   - Use **project-implementation-manager** for complex multi-phase implementations

4. **Testing & Quality Assurance:**  
   - Use **playwright-qa-tester** for automated testing of call flows
   - Use Playwright MCP for comprehensive browser testing and validation
   - Test audio quality, WebSocket connectivity, and error handling

5. **Documentation:**  
   - Use **documentation-context-analyzer** for comprehensive documentation
   - Document WebSocket message flows, API endpoints, and integration patterns
   - Maintain clear troubleshooting guides for common issues

6. **Respect File Structure:**  
   - Current structure:
     - `outbound.js` - Main Fastify server with Twilio integration, WebSocket handling, and ElevenLabs connectivity
     - `index.html` - Frontend interface for initiating calls and viewing transcripts
     - `script.js` - Client-side JavaScript for call management and real-time transcript display
     - `styles.css` - UI styling for the call interface
     - `.env` - Environment variables (API keys, ngrok domain, phone numbers)
   - Maintain clean separation between server logic and client interface
   - WebSocket endpoints should remain focused and performant

7. **Audio Processing Best Practices:**  
   - Always use `ulaw_8000` format for Twilio compatibility
   - Include `track: "outbound"` when sending audio TO caller
   - Buffer audio appropriately when StreamSid is not yet available
   - Handle ElevenLabs audio events: `audio`, `user_transcript`, `agent_response`

8. **WebSocket Communication:**  
   - Use `ws.socket.send()` for Fastify WebSocket wrapper (not `ws.send()`)
   - Handle Twilio events: `connected` → `start` → `media` → `stop`
   - Implement proper error handling and connection recovery
   - Always validate X-Twilio-Signature for security

9. **Environment & Configuration:**  
   - Use environment variables for all sensitive data (API keys, tokens)
   - Configure ngrok domain for webhook URLs
   - Set proper CORS headers for frontend communication
   - Include comprehensive status callback handling

10. **Real-time Features:**  
    - Implement WebSocket connections for live transcript updates
    - Broadcast conversation events to connected clients
    - Handle connection state changes gracefully
    - Provide clear status indicators for call progress

11. **Error Handling & Monitoring:**  
    - Log all WebSocket connection events and errors
    - Implement timeout detection for silent connections
    - Provide diagnostic endpoints for troubleshooting
    - Monitor call status webhooks for completion tracking

## Project-Specific Guidelines

### Twilio Integration
- Media Streams must be enabled on Twilio account for WebSocket functionality
- Use proper TwiML structure: `<Connect><Stream>` for bidirectional audio
- Include status callback URLs for call progress monitoring
- Handle international calling permissions and restrictions

### ElevenLabs Conversational AI  
- Configure audio interface with `output_format: "ulaw_8000"`
- Handle conversation events: initiation, transcription, responses, corrections
- Implement proper ping-pong keepalive for WebSocket connections
- Buffer audio chunks until Twilio StreamSid is available

### Frontend Call Interface
- Provide intuitive call initiation with contact selection
- Display real-time transcript with speaker identification
- Handle WebSocket connection status and reconnection
- Show call progress and connection state clearly

### WebSocket Message Flow
```
Twilio: connected → start → media (ongoing) → stop
ElevenLabs: conversation_initiation_metadata → audio → user_transcript → agent_response
Server: Bridges between both services with proper format conversion
```

### Common Issues & Solutions
- **No audio heard**: Check Media Streams account enablement
- **WebSocket timeout**: Verify ngrok tunnel and firewall settings  
- **Format errors**: Ensure μ-law audio format and proper track direction
- **Connection drops**: Implement reconnection logic and error recovery

***

**Note:**  
This is a real-time audio processing system handling telephony integration. Prioritize audio quality, connection reliability, and responsive user experience. The system processes live conversations - latency and connection stability are critical for user satisfaction.