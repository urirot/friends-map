import React from 'react';

export default function ErrorMessage({ error }) {
  if (!error) return null;

  const isAccessDenied = error.includes('Access denied');
  
  return (
    <div 
      className='error-message' 
      style={isAccessDenied ? {background: '#f59e0b'} : {}}
    >
      {error}
    </div>
  );
}

