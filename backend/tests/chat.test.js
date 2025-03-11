const request = require('supertest');
const app = require('../index');
const Chat = require('../models/Chat');

describe('Chat API Endpoints', () => {
  describe('POST /api/chats/new', () => {
    it('should create a new chat', async () => {
      const res = await request(app)
        .post('/api/chats/new')
        .expect(200);

      expect(res.body).toHaveProperty('id');
      const chat = await Chat.findById(res.body.id);
      expect(chat).toBeTruthy();
    });
  });

  describe('POST /api/chats/:chatId/messages', () => {
    let chatId;

    beforeEach(async () => {
      const chat = await Chat.create({});
      chatId = chat._id;
    });

    it('should add a message to existing chat', async () => {
      const message = {
        content: 'Test message',
        role: 'user'
      };

      const res = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .send(message)
        .expect(200);

      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].content).toBe(message.content);
    });

    it('should handle invalid chat ID', async () => {
      await request(app)
        .post('/api/chats/invalid-id/messages')
        .send({ content: 'Test', role: 'user' })
        .expect(400);
    });
  });
});
