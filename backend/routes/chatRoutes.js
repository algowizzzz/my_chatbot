const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection
const url = 'mongodb://localhost:27017';
const dbName = 'chatbot';

// Create new chat
router.post('/new', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const newChat = {
            title: req.body.title || 'New Chat',
            userId: 'test-user',
            createdAt: new Date(),
            updatedAt: new Date(),
            messages: []
        };

        const result = await db.collection('chats').insertOne(newChat);

        // Return the complete chat object with _id
        res.json({
            _id: result.insertedId,
            ...newChat
        });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Failed to create chat' });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Get all chats
router.get('/', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const chats = await db.collection('chats')
            .find({ userId: 'test-user' })
            .sort({ updatedAt: -1 })
            .toArray();
        
        res.json(chats);
    } catch (error) {
        console.error('List chats error:', error);
        res.status(500).json({ error: 'Failed to list chats' });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Get chat messages
router.get('/:chatId/messages', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        console.log('Fetching messages for chat:', req.params.chatId); // Debug log
        
        const chat = await db.collection('chats').findOne({
            _id: new ObjectId(req.params.chatId)
        });
        
        if (!chat) {
            console.log('Chat not found'); // Debug log
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        console.log('Found chat:', chat); // Debug log
        res.json(chat.messages || []);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Save messages to chat
router.post('/:chatId/messages', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const chatId = req.params.chatId;
        const newMessages = req.body.messages;
        
        console.log('Saving messages for chat:', chatId, newMessages);

        // Update the chat with new messages and updatedAt timestamp
        const result = await db.collection('chats').findOneAndUpdate(
            { _id: new ObjectId(chatId) },
            { 
                $push: { 
                    messages: { 
                        $each: newMessages 
                    } 
                },
                $set: {
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );
        
        if (!result.value) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        res.json({ 
            success: true,
            chat: result.value
        });
    } catch (error) {
        console.error('Save messages error:', error);
        res.status(500).json({ error: 'Failed to save messages' });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Delete chat
router.delete('/:chatId', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const result = await db.collection('chats').deleteOne({
            _id: new ObjectId(req.params.chatId)
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        res.json({ 
            success: true,
            chatId: req.params.chatId
        });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

// Rename chat
router.put('/:chatId/rename', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        // Get the existing chat first
        const existingChat = await db.collection('chats').findOne({
            _id: new ObjectId(req.params.chatId)
        });

        if (!existingChat) {
            return res.status(404).json({ error: 'Chat not found' });
        }

        // Update the chat title while preserving other fields
        const result = await db.collection('chats').findOneAndUpdate(
            { _id: new ObjectId(req.params.chatId) },
            { 
                $set: { 
                    title: req.body.title,
                    updatedAt: new Date()
                } 
            },
            { returnDocument: 'after' } // Return the updated document
        );
        
        // Return the updated chat data
        res.json({
            success: true,
            chat: result.value
        });
    } catch (error) {
        console.error('Rename chat error:', error);
        res.status(500).json({ error: 'Failed to rename chat' });
    } finally {
        if (client) {
            await client.close();
        }
    }
});

module.exports = router; 