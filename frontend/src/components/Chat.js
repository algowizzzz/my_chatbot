import React, { useState } from 'react';
import axios from 'axios';

function Chat({ selectedDocument }) {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleQuery = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post('/api/documents/query', {
        query,
        documentId: selectedDocument?._id, // Optional, for single-doc search
      });

      setResponse({
        answer: response.data.answer,
        sources: response.data.relevantSections
      });
    } catch (error) {
      console.error('Query failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      <form onSubmit={handleQuery}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question..."
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Searching...' : 'Ask'}
        </button>
      </form>

      {response && (
        <div className="response">
          <p>{response.answer}</p>
          <div className="sources">
            <h4>Sources:</h4>
            {response.sources.map((source, index) => (
              <div key={index} className="source">
                <p>Page {source.pageNumber}, {source.section}</p>
                <p>Relevance: {Math.round(source.score * 100)}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Chat; 