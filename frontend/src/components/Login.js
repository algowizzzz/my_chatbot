import React, { useState } from 'react';
import './Login.css';

function Login({ onLogin, switchToRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    // For demo, using test account
    if (email === 'test@test.com' && password === 'password') {
      onLogin({ userId: 'test-user-id' }); // We'll replace this with real user ID later
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>DeepLearnHQ</h1>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit">Login</button>
          <button type="button" onClick={switchToRegister} className="switch-button">
            Need an account? Register
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login; 