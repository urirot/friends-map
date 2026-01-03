import React from 'react';

export default function NoSignalScreen({ onRetry }) {
  return (
    <div className='login-screen'>
      <img 
        src='/sad_egel.jpg' 
        alt='No Signal' 
        style={{
          width: '200px', 
          height: '200px', 
          borderRadius: '50%', 
          objectFit: 'cover'
        }} 
      />
      <h1 style={{textAlign: 'center'}}>No Internet Connection</h1>
      <p style={{textAlign: 'center'}}>Please check your connection and try again</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  );
}

