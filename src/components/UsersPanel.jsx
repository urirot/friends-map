import React from 'react';

export default function UsersPanel({ 
  showUsersPanel, 
  friends, 
  user, 
  isUserOffline, 
  isEmoji, 
  onClose, 
  onFocusUser 
}) {
  if (!showUsersPanel) return null;

  return (
    <div className='users-panel'>
      <div className='users-panel-header'>
        <h3>All Users</h3>
        <button className='close-users-panel' onClick={onClose}>
          ✕
        </button>
      </div>
      <div className='users-list'>
        {Object.entries(friends).map(([key, friend]) => {
          const isCurrentUser = user && key === user.uid;
          const offline = isCurrentUser ? false : isUserOffline(friend.lastUpdated);
          const hasLocation = friend.lat && friend.lng;
          
          return (
            <div
              key={key}
              className={`user-item ${isCurrentUser ? 'current-user' : ''} ${offline ? 'offline' : ''} ${!hasLocation ? 'no-location' : ''}`}
              onClick={() => hasLocation && onFocusUser(key, friend.lat, friend.lng)}
              style={{ cursor: hasLocation ? 'pointer' : 'not-allowed' }}
            >
              <div className='user-avatar' style={{ fontSize: '24px' }}>
                {isEmoji(friend.avatar) ? friend.avatar : '👤'}
              </div>
              <div className='user-info'>
                <div className='user-name'>
                  {friend.name || 'Anonymous'}
                  {isCurrentUser && <span className='you-badge'> (You)</span>}
                </div>
                {offline && <div className='user-status'>Offline</div>}
                {!hasLocation && <div className='user-status'>No location</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

