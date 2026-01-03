import React from 'react';

export default function AdminPanel({
  showAdminPanel,
  clusterRadius,
  messageBoxEnabled,
  accessRequests,
  onClusterRadiusChange,
  onToggleMessageBox,
  onApproveAccess,
  onRejectAccess
}) {
  if (!showAdminPanel) return null;

  return (
    <div className='admin-panel'>
      <h2>Admin Panel</h2>

      <div style={{marginBottom: '20px'}}>
        <label style={{display: 'block', fontSize: '14px', fontWeight: '600', color: '#333', marginBottom: '8px'}}>
          Cluster Radius: {clusterRadius}px
        </label>
        <input
          type='range'
          min='0'
          max='150'
          value={clusterRadius}
          onChange={(e) => onClusterRadiusChange(Number(e.target.value))}
          style={{width: '100%'}}
        />
        <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666', marginTop: '4px'}}>
          <span>No clustering</span>
          <span>Max clustering</span>
        </div>
      </div>

      <div style={{marginBottom: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb'}}>
        <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
          <input
            type='checkbox'
            checked={messageBoxEnabled}
            onChange={(e) => onToggleMessageBox(e.target.checked)}
            style={{width: '18px', height: '18px', cursor: 'pointer'}}
          />
          <span style={{fontSize: '14px', fontWeight: '600', color: '#333'}}>
            Enable Shared Message Box
          </span>
        </label>
      </div>

      <h3 style={{fontSize: '16px', margin: '0 0 12px 0', color: '#333'}}>Access Requests</h3>
      {Object.keys(accessRequests).length === 0 ? (
        <p style={{color: '#888', textAlign: 'center', margin: '0'}}>No pending requests</p>
      ) : (
        <div className='access-requests'>
          {Object.entries(accessRequests).map(([key, request]) => (
            <div key={key} className='access-request'>
              <div className='request-info'>
                <div className='request-name'>{request.name || 'Anonymous'}</div>
                <div className='request-email'>{request.email}</div>
              </div>
              <div className='request-actions'>
                <button onClick={() => onApproveAccess(request.email)} className='approve-btn'>
                  ✓ Approve
                </button>
                <button onClick={() => onRejectAccess(request.email)} className='reject-btn'>
                  ✕ Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

