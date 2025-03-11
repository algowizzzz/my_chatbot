#!/bin/bash
set -e

echo "🔄 Migrating MongoDB data from local to Atlas..."

# Set variables
LOCAL_DB="chatbot"
ATLAS_URI="mongodb+srv://sahme29:Gzt2AZw6NJqj95Dn@cluster0.k1x8c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
DUMP_DIR="./mongodb_dump"

# Create dump directory if it doesn't exist
mkdir -p $DUMP_DIR

# Step 1: Dump data from local MongoDB
echo "📤 Exporting data from local MongoDB..."
mongodump --db $LOCAL_DB --out $DUMP_DIR

# Step 2: Restore data to MongoDB Atlas
echo "📥 Importing data to MongoDB Atlas..."
mongorestore --uri="$ATLAS_URI" --db $LOCAL_DB $DUMP_DIR/$LOCAL_DB

echo "✅ Migration complete!"
echo "🧹 Cleaning up temporary files..."
rm -rf $DUMP_DIR

echo "🎉 Your data has been successfully migrated to MongoDB Atlas!"
