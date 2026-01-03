import React from 'react';

export default function InstallPrompts({
  showUpdatePrompt,
  showInstallPrompt,
  showIOSInstall,
  isIOSSafari,
  downloadingMaps,
  downloadProgress,
  loading,
  onUpdate,
  onInstall,
  onDismissUpdate,
  onDismissInstall,
  onDismissIOS
}) {
  return (
    <>
      {showUpdatePrompt && !loading && (
        <div className='install-prompt' style={{background: '#4ade80'}}>
          <span>🎉 New update available!</span>
          <button onClick={onUpdate}>Update Now</button>
          <button onClick={onDismissUpdate} style={{background: '#888'}}>Later</button>
        </div>
      )}

      {showInstallPrompt && !showUpdatePrompt && (
        <div className='install-prompt'>
          <span>Install Egels Map for quick access</span>
          <button onClick={onInstall}>Install</button>
          <button onClick={onDismissInstall} style={{background: '#888'}}>Later</button>
        </div>
      )}

      {showIOSInstall && !showUpdatePrompt && (
        <div className='install-prompt'>
          {isIOSSafari ? (
            <span>📱 Tap Share → Add to Home Screen to install</span>
          ) : (
            <span>📱 Open in Safari to install this app</span>
          )}
          <button onClick={onDismissIOS} style={{background: '#888'}}>Got it</button>
        </div>
      )}

      {downloadingMaps && downloadProgress > 0 && downloadProgress < 100 && (
        <div className='install-prompt' style={{background: '#667eea'}}>
          <span>📥 Downloading Val Thorens map... {downloadProgress}%</span>
          <div style={{
            flex: 1,
            maxWidth: '100px',
            height: '6px',
            background: 'white',
            borderRadius: '3px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${downloadProgress}%`,
              height: '100%',
              background: 'white',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>
      )}

      {downloadProgress === 100 && (
        <div className='install-prompt' style={{background: '#4ade80'}}>
          <span>✅ Val Thorens map downloaded!</span>
        </div>
      )}
    </>
  );
}

