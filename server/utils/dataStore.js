import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Data file paths
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CALL_HISTORY_FILE = path.join(DATA_DIR, 'call_history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize data files if they don't exist
const initializeDataFile = (filePath, defaultData) => {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
};

// Initialize all data files with defaults
initializeDataFile(CONTACTS_FILE, []);
initializeDataFile(SETTINGS_FILE, {
  systemPrompt: "You are a helpful assistant from the phone store",
  firstMessage: "Hello! How can I help you today?",
  uiPreferences: {
    theme: "light",
    autoAnswer: false
  }
});
initializeDataFile(CALL_HISTORY_FILE, []);

// Generic read function
const readData = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return null;
  }
};

// Generic write function
const writeData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    return false;
  }
};

// Contacts functions
export const contacts = {
  getAll: () => readData(CONTACTS_FILE) || [],
  
  getById: (id) => {
    const allContacts = readData(CONTACTS_FILE) || [];
    return allContacts.find(contact => contact.id === id);
  },
  
  create: (contactData) => {
    const allContacts = readData(CONTACTS_FILE) || [];
    const newContact = {
      id: Date.now().toString(),
      ...contactData,
      createdAt: new Date().toISOString()
    };
    allContacts.push(newContact);
    writeData(CONTACTS_FILE, allContacts);
    return newContact;
  },
  
  update: (id, updates) => {
    const allContacts = readData(CONTACTS_FILE) || [];
    const index = allContacts.findIndex(contact => contact.id === id);
    if (index === -1) return null;
    
    allContacts[index] = {
      ...allContacts[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeData(CONTACTS_FILE, allContacts);
    return allContacts[index];
  },
  
  delete: (id) => {
    const allContacts = readData(CONTACTS_FILE) || [];
    const filtered = allContacts.filter(contact => contact.id !== id);
    if (filtered.length === allContacts.length) return false;
    
    writeData(CONTACTS_FILE, filtered);
    return true;
  },
  
  updateLastCalled: (phone) => {
    const allContacts = readData(CONTACTS_FILE) || [];
    const contact = allContacts.find(c => c.phone === phone);
    if (contact) {
      contact.lastCalled = new Date().toISOString();
      writeData(CONTACTS_FILE, allContacts);
    }
  }
};

// Settings functions
export const settings = {
  get: () => readData(SETTINGS_FILE) || {},
  
  update: (updates) => {
    const currentSettings = readData(SETTINGS_FILE) || {};
    const newSettings = {
      ...currentSettings,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeData(SETTINGS_FILE, newSettings);
    return newSettings;
  },
  
  getSystemPrompt: () => {
    const settings = readData(SETTINGS_FILE) || {};
    return settings.systemPrompt || "You are a helpful assistant";
  },
  
  getFirstMessage: () => {
    const settings = readData(SETTINGS_FILE) || {};
    return settings.firstMessage || "Hello! How can I help you today?";
  }
};

// Call history functions
export const callHistory = {
  getAll: () => readData(CALL_HISTORY_FILE) || [],
  
  getByContactId: (contactId) => {
    const allCalls = readData(CALL_HISTORY_FILE) || [];
    return allCalls.filter(call => call.contactId === contactId);
  },
  
  create: (callData) => {
    const allCalls = readData(CALL_HISTORY_FILE) || [];
    const newCall = {
      id: Date.now().toString(),
      ...callData,
      timestamp: new Date().toISOString()
    };
    allCalls.unshift(newCall); // Add to beginning for most recent first
    
    // Keep only last 100 calls
    if (allCalls.length > 100) {
      allCalls.splice(100);
    }
    
    writeData(CALL_HISTORY_FILE, allCalls);
    return newCall;
  },
  
  update: (callSid, updates) => {
    const allCalls = readData(CALL_HISTORY_FILE) || [];
    const index = allCalls.findIndex(call => call.callSid === callSid);
    if (index === -1) return null;
    
    allCalls[index] = {
      ...allCalls[index],
      ...updates
    };
    writeData(CALL_HISTORY_FILE, allCalls);
    return allCalls[index];
  }
};

export default {
  contacts,
  settings,
  callHistory
};