# SMF Call agent 

A real-time conversational AI system that enables AI-powered phone calls using Twilio and ElevenLabs. The system provides bidirectional audio streaming with live transcript display and contact management.

## 🔧 Prerequisites

Before setting up the application, you'll need accounts and tools for the following services:

### Required Accounts
- **[Twilio Account](https://www.twilio.com/)** - For telephony services and phone calls
  - Must have Media Streams enabled on your account
  - Purchase a phone number for outbound calls
- **[ElevenLabs Account](https://elevenlabs.io/)** - For conversational AI
  - Create a conversational agent and note the Agent ID
  - Ensure you have sufficient credits for voice conversations
- **[NGrok Account](https://ngrok.com/)** - For secure tunneling to localhost
  - Required for Twilio webhooks to reach your local development server

### Development Tools
- **Node.js** (v16 or higher)
- **NPM** package manager

## 🚀 Installation & Setup

### 1. Clone and Install Dependencies
```bash
git clone <repository-url>
cd call-agent
npm install
```

### 2. Environment Configuration
Create a `.env` file in the project root with your API credentials:

```env
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_agent_id

# Twilio Configuration  
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
m

# NGrok Configuration
NGROK_DOMAIN=your_ngrok_domain.ngrok-free.app

# Server Configuration
PORT=8080
```

### 3. NGrok Tunnel Setup (Essential)
NGrok is **required** for Twilio webhooks to reach your local server:

1. **Install NGrok**:
   ```bash
   npm install -g ngrok
   # or download from https://ngrok.com/download
   ```

2. **Authenticate NGrok**:
   ```bash
   ngrok config add-authtoken YOUR_NGROK_TOKEN
   ```

3. **Start NGrok Tunnel**:
   ```bash
   ngrok http 8080
   ```

4. **Copy Your NGrok Domain**:
   - NGrok will display URLs like: `https://abc123.ngrok-free.app`
   - Copy the domain part (`abc123.ngrok-free.app`) to your `.env` file
   - Update `NGROK_DOMAIN=abc123.ngrok-free.app`

### 4. Start the Application
```bash
npm start
# or for development with auto-restart
npm run dev
```

### 5. Access the Application
- Open your browser to `http://localhost:8080`
- You should see the SMF Call Agent interface

## 🏗️ Architecture Overview

### Core Components
- **Server (`server/index.js`)**: Fastify-based backend handling Twilio integration, ElevenLabs AI, and WebSocket communication
- **Frontend (`client/index-new.html`)**: Modern web interface for call management and real-time transcript display
- **Call Manager (`client/js/callManager.js`)**: Handles call lifecycle and WebSocket connections
- **Contact Manager (`client/js/contactsManager.js`)**: Contact storage and management system

### Key Features
- **Real-Time Audio Processing**: Bidirectional audio streaming between callers and AI
- **Live Transcription**: Real-time conversation display with speaker identification
- **Contact Management**: Store, edit, and organize contacts with local storage
- **Configurable AI**: Custom system prompts and first messages for different scenarios
- **Call Status Tracking**: Visual indicators for connection and call states

## 🔄 How It Works

1. **Setup Phase**: Configure AI prompt and select contact to call
2. **Call Initiation**: System establishes WebSocket connection and initiates Twilio call  
3. **Audio Bridge**: Real-time audio streams between caller and ElevenLabs AI
4. **Live Updates**: Conversation transcripts appear instantly in the UI
5. **Call Management**: Monitor status and end calls through the interface

## 🛠️ Technical Stack
- **Backend**: Node.js, Fastify, WebSocket
- **Frontend**: Vanilla JavaScript, Modern CSS, HTML5
- **Telephony**: Twilio Voice API with Media Streams
- **AI**: ElevenLabs Conversational AI
- **Tunneling**: NGrok for webhook connectivity

## 📝 Important Notes

- **NGrok is Essential**: Without NGrok, Twilio webhooks cannot reach your local server
- **Media Streams**: Ensure your Twilio account has Media Streams capability enabled
- **Credits**: ElevenLabs charges per conversation - monitor your usage
- **Audio Format**: System uses μ-law 8kHz for Twilio compatibility
- **WebSocket Auto-Reconnect**: Connections automatically recover from network issues

## 🐛 Troubleshooting

### Common Issues
- **"Server: Disconnected"**: Check if the server is running on port 8080
- **No audio in calls**: Verify Twilio Media Streams is enabled on your account
- **Webhook timeouts**: Ensure NGrok tunnel is active and domain is correct in `.env`
- **Call failures**: Verify all environment variables are correctly set

### Checking Your Setup
1. Visit `http://localhost:8080/health` - should return server status
2. Check NGrok dashboard at `http://localhost:4040` for tunnel status  
3. Test Twilio credentials using their consolem

4. Verify ElevenLabs agent is properly configured and has credits