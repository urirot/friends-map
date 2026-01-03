import React from 'react';

export default function MessageBox({ 
  messageBoxEnabled, 
  user,
  needsProfile,
  sharedMessage, 
  showMessageEditor, 
  editingMessage, 
  setEditingMessage, 
  onOpenEditor, 
  onCloseEditor, 
  onSaveMessage 
}) {
  if (!messageBoxEnabled || !user || needsProfile) return null;

  return (
    <>
      <div
        className='message-box'
        onClick={onOpenEditor}
      >
        {sharedMessage || 'Click to set a message for everyone...'}
      </div>

      {showMessageEditor && (
        <div className='message-editor-overlay' onClick={onCloseEditor}>
          <div className='message-editor' onClick={(e) => e.stopPropagation()}>
            <h3 style={{margin: '0 0 16px 0', fontSize: '18px', color: '#333'}}>
              Shared Message
            </h3>
            <textarea
              value={editingMessage}
              onChange={(e) => setEditingMessage(e.target.value)}
              placeholder='Enter a message for everyone...'
              maxLength={100}
              className='message-textarea'
              autoFocus
            />
            <div style={{fontSize: '12px', color: '#666', marginBottom: '16px', textAlign: 'right'}}>
              {editingMessage.length}/100
            </div>
            <div style={{display: 'flex', gap: '8px'}}>
              <button onClick={onSaveMessage} className='save-message-btn'>
                Save
              </button>
              <button onClick={onCloseEditor} className='cancel-message-btn'>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

