FROM node:18-alpine as build

# Set working directory
WORKDIR /app

# Copy package.json files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install
RUN cd frontend && npm install
RUN cd backend && npm install

# Copy all files
COPY . .

# Build the React app
RUN cd frontend && npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy from build stage
COPY --from=build /app/backend ./backend
COPY --from=build /app/frontend/build ./frontend/build
COPY --from=build /app/package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Expose port
EXPOSE 5005

# Start the server
CMD ["node", "backend/index.js"]
