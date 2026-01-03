import React from 'react';
import ErrorMessage from './ErrorMessage';

const animalEmojis = [
  '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯',
  '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆',
  '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋',
  '🐌', '🐞', '🐜', '🦟', '🦗', '🕷', '🦂', '🐢', '🐍', '🦎',
  '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟',
  '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧',
  '🐘', '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🦬', '🐃', '🐂',
  '🐄', '🐎', '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩',
  '🦮', '🐕‍🦺', '🐈', '🐈‍⬛', '🪶', '🐓', '🦃', '🦤', '🦚', '🦜',
  '🦢', '🦩', '🕊', '🐇', '🦝', '🦨', '🦡', '🦫', '🦦', '🦥'
];

export default function ProfileSetup({ 
  profileName, 
  setProfileName, 
  selectedEmoji, 
  setSelectedEmoji, 
  friends, 
  loading, 
  error, 
  onSave 
}) {
  return (
    <div className='login-screen'>
      <h1>Set Up Your Profile</h1>
      <div className='profile-setup'>
        <div className='profile-preview'>
          <div className='emoji-display'>{selectedEmoji}</div>
        </div>

        <input
          type='text'
          placeholder='Enter your name'
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          className='profile-input'
          maxLength={20}
        />

        <div className='emoji-grid'>
          {animalEmojis.map((emoji) => {
            // Check if this emoji is already in use by another user
            const isUsed = Object.values(friends).some(
              (friend) => friend.avatar === emoji && friend.avatar !== selectedEmoji
            );
            return (
              <button
                key={emoji}
                className={`emoji-button ${selectedEmoji === emoji ? 'selected' : ''}`}
                onClick={() => !isUsed && setSelectedEmoji(emoji)}
                disabled={isUsed}
                title={isUsed ? 'Claimed!' : ''}
                style={isUsed ? {
                  opacity: 0.3,
                  cursor: 'not-allowed',
                  filter: 'grayscale(100%)'
                } : {}}
              >
                {emoji}
              </button>
            );
          })}
        </div>

        <button onClick={onSave} className='save-button' disabled={loading}>
          {loading ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
      <ErrorMessage error={error} />
    </div>
  );
}

