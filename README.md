# AI-Powered Document Chat Assistant

An intelligent chatbot that allows users to upload documents and have AI-powered conversations about their content. Built with LangChain, OpenAI, and vector embeddings for accurate document search and retrieval.

<img width="1467" alt="image" src="https://github.com/user-attachments/assets/e5e16e02-4fdb-415e-b0a3-600153cf6866" />
<img width="570" alt="image" src="https://github.com/user-attachments/assets/3091f321-3ea8-4e73-b2bf-245cc1d20272" />

## Core Features

- 📝 **Document Management**
  - Upload and store various document types
  - Vector-based document search using Pinecone
  - Efficient document retrieval and querying

- 🤖 **AI Chat Interface**
  - Context-aware conversations using OpenAI's GPT
  - Document-grounded responses
  - Chat history tracking

- 🔐 **User System**
  - Secure user authentication
  - Personal document storage
  - Chat history persistence

## Technical Architecture

### Backend (`/backend`)
- **Server**: Express.js server with MongoDB integration
- **AI Integration**: 
  - LangChain for AI orchestration
  - OpenAI for language processing
  - Pinecone for vector embeddings
- **Data Models**:
  - `Chat.js`: Manages chat sessions and messages
  - `Document.js`: Handles document storage and retrieval
  - `User.js`: User authentication and management

### Frontend (`/frontend`)
- **Core**: React-based single-page application
- **Components**:
  - Login/Register system
  - Document upload interface
  - Real-time chat UI
- **Styling**: Custom CSS with responsive design

## Setup Instructions

1. **Environment Setup**


Clone repository
git clone https://github.com/algowizzzz/my_chatbot.git
cd my_chatbot
Install dependencies
cd backend && npm install
cd ../frontend && npm install

2. **Configure Environment Variables**
Create `backend/.env` with:


env
MONGODB_URI=your_mongodb_connection_string
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX=your_index_name
PORT=5004

3. **Start the Application**

Start frontend (from /frontend)
npm start
.
- `POST /upload-document`: Upload


## API Endpoints

### Documents
- `POST /upload-document`: Upload new document
- `GET /documents/:userId`: Get user's documents
- `POST /query-document/:documentId`: Query specific document

### Chat
- `POST /chat`: Send message to AI
- `GET /chats`: Get chat history
- `POST /chats/:id/messages`: Add message to chat

### Authentication
- `POST /register`: Create new user account
- `POST /login`: Authenticate user

## Technologies Used

- **Backend**:
  - Node.js & Express
  - MongoDB & Mongoose
  - LangChain
  - OpenAI GPT
  - Pinecone Vector DB

- **Frontend**:
  - React
  - Axios
  - CSS3

## Future Enhancements

- [ ] PDF document support
- [ ] Real-time chat updates
- [ ] Enhanced document search
- [ ] User document sharing
- [ ] Chat export functionality

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.


## Getting Started

1. Clone the repository
2. Install dependencies in both frontend and backend directories
3. Set up environment variables
4. Start backend: `npm run dev`
5. Start frontend: `npm start`

## Main Features

### Document Processing
- Upload documents
- Vector embedding storage
- Intelligent search capabilities

### Chat Interface
- Real-time AI responses
- Document context integration
- Chat history storage

### User System
- Secure authentication
- Personal document management

