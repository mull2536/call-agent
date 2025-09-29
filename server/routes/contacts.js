import { contacts } from '../utils/dataStore.js';

export default async function contactsRoutes(fastify, opts) {
  // Get all contacts
  fastify.get('/api/contacts', async (request, reply) => {
    try {
      const allContacts = contacts.getAll();
      return reply.send({
        success: true,
        data: allContacts
      });
    } catch (error) {
      console.error('Error fetching contacts:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch contacts'
      });
    }
  });

  // Get single contact
  fastify.get('/api/contacts/:id', async (request, reply) => {
    try {
      const contact = contacts.getById(request.params.id);
      if (!contact) {
        return reply.code(404).send({
          success: false,
          error: 'Contact not found'
        });
      }
      return reply.send({
        success: true,
        data: contact
      });
    } catch (error) {
      console.error('Error fetching contact:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch contact'
      });
    }
  });

  // Create new contact
  fastify.post('/api/contacts', async (request, reply) => {
    try {
      const { name, phone, notes } = request.body;
      
      // Validation
      if (!name || !phone) {
        return reply.code(400).send({
          success: false,
          error: 'Name and phone are required'
        });
      }

      // Check if phone number already exists
      const existingContacts = contacts.getAll();
      if (existingContacts.some(c => c.phone === phone)) {
        return reply.code(409).send({
          success: false,
          error: 'Contact with this phone number already exists'
        });
      }

      const newContact = contacts.create({
        name,
        phone,
        notes: notes || ''
      });

      return reply.code(201).send({
        success: true,
        data: newContact
      });
    } catch (error) {
      console.error('Error creating contact:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to create contact'
      });
    }
  });

  // Update contact
  fastify.put('/api/contacts/:id', async (request, reply) => {
    try {
      const { name, phone, notes } = request.body;
      
      // Check if contact exists
      const existingContact = contacts.getById(request.params.id);
      if (!existingContact) {
        return reply.code(404).send({
          success: false,
          error: 'Contact not found'
        });
      }

      // If phone is being changed, check for duplicates
      if (phone && phone !== existingContact.phone) {
        const allContacts = contacts.getAll();
        if (allContacts.some(c => c.phone === phone && c.id !== request.params.id)) {
          return reply.code(409).send({
            success: false,
            error: 'Another contact with this phone number already exists'
          });
        }
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (phone !== undefined) updates.phone = phone;
      if (notes !== undefined) updates.notes = notes;

      const updatedContact = contacts.update(request.params.id, updates);

      return reply.send({
        success: true,
        data: updatedContact
      });
    } catch (error) {
      console.error('Error updating contact:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to update contact'
      });
    }
  });

  // Delete contact
  fastify.delete('/api/contacts/:id', async (request, reply) => {
    try {
      const deleted = contacts.delete(request.params.id);
      
      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Contact not found'
        });
      }

      return reply.send({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete contact'
      });
    }
  });
}