import React from 'react';
import ErrorMessage from './ErrorMessage';

export default function LoginScreen({ error, onLogin, onRequestAccess }) {
  const showRequestAccess = error && error.includes('Access denied');

  return (
    <div className='login-screen'>
      <img src='/icon-192.png' alt='Egels Map' className='login-logo' />
      <h1>Egels Map</h1>
      <p>See where your friends are in real-time</p>
      {showRequestAccess ? (
        <button onClick={onRequestAccess}>
          Request Access
        </button>
      ) : (
        <button onClick={onLogin}>Sign in with Google</button>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}

