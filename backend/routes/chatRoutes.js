const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB connection
const url = 'mongodb://localhost:27017';
const dbName = 'chatbot';

// Create new chat
router.post('/new', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const newChat = {
            title: req.body.title || 'New Chat',
            userId: 'test-user',
            createdAt: new Date(),
            messages: []
        };

        const result = await db.collection('chats').insertOne(newChat);
        client.close();

        res.json({
            _id: result.insertedId,
            ...newChat
        });
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Failed to create chat' });
    }
});

// Get all chats
router.get('/', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const chats = await db.collection('chats')
            .find({ userId: 'test-user' })
            .sort({ createdAt: -1 })
            .toArray();
            
        client.close();
        res.json(chats);
    } catch (error) {
        console.error('List chats error:', error);
        res.status(500).json({ error: 'Failed to list chats' });
    }
});

// Get chat messages - Fix the route path
router.get('/:chatId/messages', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        console.log('Fetching messages for chat:', req.params.chatId); // Debug log
        
        const chat = await db.collection('chats').findOne({
            _id: new ObjectId(req.params.chatId)
        });
        
        client.close();
        
        if (!chat) {
            console.log('Chat not found'); // Debug log
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        console.log('Found chat:', chat); // Debug log
        res.json(chat.messages || []);
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ error: 'Failed to get messages' });
    }
});

// Save messages to chat
router.post('/:chatId/messages', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const chatId = req.params.chatId;
        const newMessages = req.body.messages;
        
        console.log('Saving messages for chat:', chatId, newMessages);

        const result = await db.collection('chats').updateOne(
            { _id: new ObjectId(chatId) },
            { 
                $push: { 
                    messages: { 
                        $each: newMessages 
                    } 
                } 
            }
        );
        
        client.close();
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save messages error:', error);
        res.status(500).json({ error: 'Failed to save messages' });
    }
});

// Delete chat
router.delete('/:chatId', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const result = await db.collection('chats').deleteOne({
            _id: new ObjectId(req.params.chatId)
        });
        
        client.close();
        
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'Failed to delete chat' });
    }
});

// Rename chat
router.put('/:chatId/rename', async (req, res) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const result = await db.collection('chats').updateOne(
            { _id: new ObjectId(req.params.chatId) },
            { $set: { title: req.body.title } }
        );
        
        client.close();
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Rename chat error:', error);
        res.status(500).json({ error: 'Failed to rename chat' });
    }
});

module.exports = router; 