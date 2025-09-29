/**
 * Contacts Manager - Handles contact management functionality
 * Adapted from the voice-agent people management system for phone contacts
 */

class ContactsManager {
    constructor(app) {
        this.app = app;
        this.contacts = [];
        this.selectedContact = null;
        this.editingContact = null;
        
        // UI elements
        this.modal = document.getElementById('contacts-modal');
        this.contactsGrid = document.getElementById('contacts-grid');
        this.editContactSection = document.getElementById('edit-contact-section');
        this.addContactSection = document.getElementById('add-contact-section');
        
        // Form inputs
        this.newContactName = document.getElementById('new-contact-name');
        this.newContactPhone = document.getElementById('new-contact-phone');
        this.editContactName = document.getElementById('edit-contact-name');
        this.editContactPhone = document.getElementById('edit-contact-phone');
        
        // Action buttons
        this.saveBtn = document.getElementById('save-btn');
        this.deleteBtn = document.getElementById('delete-btn');
        this.useBtn = document.getElementById('use-btn');
        
        this.init();
    }

    /**
     * Initialize the contacts manager
     */
    init() {
        
        // Load contacts from storage
        this.loadContacts();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Render initial contacts grid
        this.renderContactsGrid();
        
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Phone number input validation
        if (this.newContactPhone) {
            this.newContactPhone.addEventListener('input', (e) => this.validatePhoneInput(e));
        }
        if (this.editContactPhone) {
            this.editContactPhone.addEventListener('input', (e) => this.validatePhoneInput(e));
        }
        
        // Enter key handlers
        if (this.newContactName) {
            this.newContactName.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveOrUpdateContact();
            });
        }
        if (this.newContactPhone) {
            this.newContactPhone.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.saveOrUpdateContact();
            });
        }
        
        // Input validation
        [this.newContactName, this.newContactPhone, this.editContactName, this.editContactPhone]
            .forEach(input => {
                if (input) {
                    input.addEventListener('input', () => this.validateForm());
                }
            });
    }

    /**
     * Open the contacts modal
     */
    openModal() {
        if (this.modal) {
            this.modal.classList.add('show');
            this.modal.style.display = 'flex';
            this.renderContactsGrid();
            this.resetForm();
        }
    }

    /**
     * Close the contacts modal
     */
    closeModal() {
        if (this.modal) {
            this.modal.classList.remove('show');
            this.modal.style.display = 'none';
            this.resetForm();
        }
    }

    /**
     * Validate phone number input
     */
    validatePhoneInput(event) {
        const input = event.target;
        let value = input.value;
        
        // Remove any non-digit characters except +
        value = value.replace(/[^\d+]/g, '');
        
        // Ensure + is only at the beginning
        if (value.includes('+') && !value.startsWith('+')) {
            value = '+' + value.replace(/\+/g, '');
        }
        
        // Limit length
        if (value.length > 16) {
            value = value.substring(0, 16);
        }
        
        input.value = value;
        this.validateForm();
    }

    /**
     * Validate the form inputs
     */
    validateForm() {
        const isEditing = this.editingContact !== null;
        
        let name, phone;
        
        if (isEditing) {
            name = this.editContactName?.value.trim() || '';
            phone = this.editContactPhone?.value.trim() || '';
        } else {
            name = this.newContactName?.value.trim() || '';
            phone = this.newContactPhone?.value.trim() || '';
        }
        
        const isValidPhone = this.isValidPhoneNumber(phone);
        const isValidName = name.length > 0;
        const isFormValid = isValidName && isValidPhone;
        
        // Update save button state
        if (this.saveBtn) {
            this.saveBtn.disabled = !isFormValid;
        }
        
        return isFormValid;
    }

    /**
     * Check if phone number is valid
     */
    isValidPhoneNumber(phone) {
        // Basic validation: starts with + and has 10-15 digits
        const phoneRegex = /^\+\d{10,15}$/;
        return phoneRegex.test(phone);
    }

    /**
     * Render the contacts grid
     */
    renderContactsGrid() {
        if (!this.contactsGrid) return;
        
        this.contactsGrid.innerHTML = '';
        
        if (this.contacts.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-contacts-message';
            emptyMessage.style.cssText = `
                grid-column: 1 / -1;
                text-align: center;
                padding: 2rem;
                color: var(--text-secondary);
                font-style: italic;
            `;
            emptyMessage.textContent = 'No contacts yet. Add your first contact below.';
            this.contactsGrid.appendChild(emptyMessage);
            return;
        }
        
        this.contacts.forEach((contact, index) => {
            const contactBtn = document.createElement('button');
            contactBtn.className = 'contact-btn';
            contactBtn.dataset.index = index;
            
            if (this.selectedContact && 
                this.selectedContact.phone === contact.phone && 
                this.selectedContact.name === contact.name) {
                contactBtn.classList.add('selected');
            }
            
            contactBtn.innerHTML = `
                <div class="contact-name">${this.escapeHtml(contact.name)}</div>
                <div class="contact-phone">${this.escapeHtml(contact.phone)}</div>
            `;
            
            // Single click to select
            contactBtn.addEventListener('click', () => {
                this.selectContact(index);
            });
            
            // Double click to use immediately
            contactBtn.addEventListener('dblclick', () => {
                this.selectContact(index);
                this.useContact();
            });
            
            this.contactsGrid.appendChild(contactBtn);
        });
    }

    /**
     * Select a contact
     */
    selectContact(index) {
        const contact = this.contacts[index];
        if (!contact) return;
        
        this.selectedContact = contact;
        this.renderContactsGrid(); // Re-render to show selection
        
        // Show edit form
        this.showEditForm(contact);
        
        // Enable action buttons
        if (this.deleteBtn) this.deleteBtn.style.display = 'inline-flex';
        if (this.useBtn) this.useBtn.style.display = 'inline-flex';
        
    }

    /**
     * Show edit form for selected contact
     */
    showEditForm(contact) {
        if (!this.editContactSection) return;
        
        this.editingContact = { ...contact };
        
        // Hide add form, show edit form
        if (this.addContactSection) this.addContactSection.style.display = 'none';
        this.editContactSection.style.display = 'block';
        
        // Populate edit form
        if (this.editContactName) this.editContactName.value = contact.name;
        if (this.editContactPhone) this.editContactPhone.value = contact.phone;
        
        // Update save button text
        if (this.saveBtn) this.saveBtn.textContent = 'Update';
        
        this.validateForm();
    }

    /**
     * Reset form to add new contact mode
     */
    resetForm() {
        this.selectedContact = null;
        this.editingContact = null;
        
        // Clear all inputs
        [this.newContactName, this.newContactPhone, this.editContactName, this.editContactPhone]
            .forEach(input => {
                if (input) input.value = '';
            });
        
        // Show add form, hide edit form
        if (this.addContactSection) this.addContactSection.style.display = 'block';
        if (this.editContactSection) this.editContactSection.style.display = 'none';
        
        // Hide action buttons
        if (this.deleteBtn) this.deleteBtn.style.display = 'none';
        if (this.useBtn) this.useBtn.style.display = 'none';
        
        // Reset save button
        if (this.saveBtn) this.saveBtn.textContent = 'Save';
        
        this.renderContactsGrid();
        this.validateForm();
    }

    /**
     * Save or update contact
     */
    saveOrUpdateContact() {
        if (!this.validateForm()) {
            this.app.showError('Please enter a valid name and phone number');
            return;
        }
        
        let name, phone;
        
        if (this.editingContact) {
            // Update existing contact
            name = this.editContactName?.value.trim();
            phone = this.editContactPhone?.value.trim();
            
            if (!name || !phone) {
                this.app.showError('Please enter both name and phone number');
                return;
            }
            
            // Find and update the contact
            const index = this.contacts.findIndex(c => 
                c.name === this.editingContact.name && c.phone === this.editingContact.phone
            );
            
            if (index !== -1) {
                this.contacts[index] = { name, phone };
                this.app.showSuccess(`Contact "${name}" updated successfully`);
            }
        } else {
            // Add new contact
            name = this.newContactName?.value.trim();
            phone = this.newContactPhone?.value.trim();
            
            if (!name || !phone) {
                this.app.showError('Please enter both name and phone number');
                return;
            }
            
            // Check for duplicates
            const duplicate = this.contacts.find(c => 
                c.name.toLowerCase() === name.toLowerCase() || c.phone === phone
            );
            
            if (duplicate) {
                this.app.showError('A contact with this name or phone number already exists');
                return;
            }
            
            this.contacts.push({ name, phone });
            this.app.showSuccess(`Contact "${name}" added successfully`);
        }
        
        // Save to storage and update UI
        this.saveContacts();
        this.resetForm();
    }

    /**
     * Delete selected contact
     */
    deleteContact() {
        if (!this.selectedContact) {
            this.app.showError('No contact selected');
            return;
        }
        
        const contactName = this.selectedContact.name;
        
        // Show confirmation
        if (!confirm(`Are you sure you want to delete "${contactName}"?`)) {
            return;
        }
        
        // Remove from contacts array
        this.contacts = this.contacts.filter(c => 
            !(c.name === this.selectedContact.name && c.phone === this.selectedContact.phone)
        );
        
        // If this was the current contact in the app, clear it
        if (this.app.currentContact && 
            this.app.currentContact.name === this.selectedContact.name &&
            this.app.currentContact.phone === this.selectedContact.phone) {
            this.app.setCurrentContact(null);
        }
        
        this.saveContacts();
        this.resetForm();
        this.app.showSuccess(`Contact "${contactName}" deleted`);
        
    }

    /**
     * Use selected contact (set as current contact in app)
     */
    useContact() {
        if (!this.selectedContact || !this.selectedContact.name) {
            this.app.showError('No contact selected');
            return;
        }
        
        // Save reference before closing modal (which clears selectedContact)
        const contactToUse = this.selectedContact;
        
        this.app.setCurrentContact(contactToUse);
        this.closeModal();
        this.app.showSuccess(`Using contact: ${contactToUse.name}`);
        
    }

    /**
     * Load contacts from localStorage
     */
    loadContacts() {
        try {
            // Try new format first
            let saved = localStorage.getItem('callAgentContacts');
            
            if (saved) {
                this.contacts = JSON.parse(saved);
            } else {
                // Try old format for backward compatibility
                saved = localStorage.getItem('phoneContacts');
                
                if (saved) {
                    const oldContacts = JSON.parse(saved);
                    
                    // Convert old format {name, number} to new format {name, phone}
                    this.contacts = oldContacts.map(contact => ({
                        name: contact.name,
                        phone: contact.number || contact.phone // Handle both formats
                    }));
                    
                    // Save in new format
                    this.saveContacts();
                } else {
                    this.contacts = [];
                }
            }
        } catch (error) {
            this.contacts = [];
            this.app.showError('Error loading contacts');
        }
    }

    /**
     * Save contacts to localStorage
     */
    saveContacts() {
        try {
            localStorage.setItem('callAgentContacts', JSON.stringify(this.contacts));
        } catch (error) {
            this.app.showError('Error saving contacts');
        }
    }

    /**
     * Get all contacts
     */
    getContacts() {
        return [...this.contacts];
    }

    /**
     * Get contact by phone number
     */
    getContactByPhone(phone) {
        return this.contacts.find(c => c.phone === phone);
    }

    /**
     * Export contacts as JSON
     */
    exportContacts() {
        const dataStr = JSON.stringify(this.contacts, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = 'call-agent-contacts.json';
        link.click();
        
    }

    /**
     * Import contacts from JSON
     */
    importContacts(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedContacts = JSON.parse(e.target.result);
                
                if (!Array.isArray(importedContacts)) {
                    throw new Error('Invalid file format');
                }
                
                // Validate contacts
                const validContacts = importedContacts.filter(c => 
                    c.name && c.phone && this.isValidPhoneNumber(c.phone)
                );
                
                if (validContacts.length === 0) {
                    throw new Error('No valid contacts found');
                }
                
                // Merge with existing contacts, avoiding duplicates
                let addedCount = 0;
                validContacts.forEach(contact => {
                    const exists = this.contacts.find(c => 
                        c.name.toLowerCase() === contact.name.toLowerCase() || c.phone === contact.phone
                    );
                    
                    if (!exists) {
                        this.contacts.push(contact);
                        addedCount++;
                    }
                });
                
                if (addedCount > 0) {
                    this.saveContacts();
                    this.renderContactsGrid();
                    this.app.showSuccess(`Imported ${addedCount} new contacts`);
                } else {
                    this.app.showError('No new contacts to import (all already exist)');
                }
                
                
            } catch (error) {
                this.app.showError('Error importing contacts: ' + error.message);
            }
        };
        
        reader.readAsText(file);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}