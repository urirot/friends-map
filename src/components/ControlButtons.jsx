import React from 'react';

export default function ControlButtons({ 
  position, 
  onRefresh, 
  onCenter, 
  showUsersPanel, 
  onToggleUsersPanel 
}) {
  if (!position) return null;

  return (
    <>
      <button className='refresh-button' onClick={onRefresh}>
        🔄
      </button>
      <button className='center-button' onClick={onCenter}>
        <img src="/icon-512.png" style={{width: '20px', height: '20px', borderRadius: '50%'}} alt="Center" />
      </button>
      <button className='users-button' onClick={onToggleUsersPanel}>
        🐮
      </button>
    </>
  );
}

