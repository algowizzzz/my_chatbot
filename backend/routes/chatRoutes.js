const express = require('express');
const router = express.Router();
const { MongoClient, ObjectId } = require('mongodb');
const { ApiError } = require('../middleware/errorHandler');

// MongoDB connection - using environment variable for consistency
const url = process.env.MONGODB_URI;
// Extract database name from connection string or use default
const isAtlasUri = url && url.includes('mongodb+srv');
const dbName = isAtlasUri ? url.split('/').pop().split('?')[0] || 'chatbot' : 'chatbot';

// Log connection info for debugging
console.log('Chat routes using MongoDB connection:', {
    usingEnvVar: !!process.env.MONGODB_URI,
    dbName
});

// Create new chat
router.post('/new', async (req, res, next) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        // In a production app, userId would come from authenticated user
        const userId = req.body.userId || 'test-user';
        
        const newChat = {
            title: req.body.title || 'New Chat',
            userId,
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
        next(new ApiError('Failed to create chat', 500, error.message));
    }
});

// Get all chats
router.get('/', async (req, res, next) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        // In a production app, userId would come from authenticated user
        const userId = req.query.userId || 'test-user';
        
        const chats = await db.collection('chats')
            .find({ userId })
            .sort({ createdAt: -1 })
            .toArray();
            
        client.close();
        res.json(chats);
    } catch (error) {
        console.error('List chats error:', error);
        next(new ApiError('Failed to list chats', 500, error.message));
    }
});

// Get chat messages
router.get('/:chatId/messages', async (req, res, next) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        console.log('Fetching messages for chat:', req.params.chatId);
        
        const chat = await db.collection('chats').findOne({
            _id: new ObjectId(req.params.chatId)
        });
        
        client.close();
        
        if (!chat) {
            console.log('Chat not found');
            return next(new ApiError('Chat not found', 404));
        }
        
        console.log('Found chat:', chat);
        res.json(chat.messages || []);
    } catch (error) {
        console.error('Get messages error:', error);
        next(new ApiError('Failed to get messages', 500, error.message));
    }
});

// Save messages to chat (append)
router.post('/:chatId/messages', async (req, res, next) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const chatId = req.params.chatId;
        const newMessages = req.body.messages;
        
        if (!newMessages || !Array.isArray(newMessages)) {
            client.close();
            return next(new ApiError('Messages must be provided as an array', 400));
        }
        
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
        
        if (result.matchedCount === 0) {
            return next(new ApiError('Chat not found', 404));
        }
        
        res.json({ success: true, message: 'Messages appended successfully' });
    } catch (error) {
        console.error('Save messages error:', error);
        next(new ApiError('Failed to save messages', 500, error.message));
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

// Update chat messages (replace all messages)
router.put('/:chatId/messages', async (req, res, next) => {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db(dbName);
        
        const chatId = req.params.chatId;
        const updatedMessages = req.body.messages;
        
        if (!updatedMessages || !Array.isArray(updatedMessages)) {
            client.close();
            return next(new ApiError('Messages must be provided as an array', 400));
        }
        
        console.log('Updating all messages for chat:', chatId);

        const result = await db.collection('chats').updateOne(
            { _id: new ObjectId(chatId) },
            { $set: { messages: updatedMessages } }
        );
        
        client.close();
        
        if (result.matchedCount === 0) {
            return next(new ApiError('Chat not found', 404));
        }
        
        res.json({ 
            success: true, 
            message: 'Chat messages updated successfully',
            count: updatedMessages.length
        });
    } catch (error) {
        console.error('Update messages error:', error);
        next(new ApiError('Failed to update chat messages', 500, error.message));
    }
});

module.exports = router;