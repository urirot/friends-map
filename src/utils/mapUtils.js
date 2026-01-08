// Utility functions for map operations

// Check if avatar is an emoji (not a URL)
export const isEmoji = (str) => {
  if (!str) return false;
  // URLs start with http or https
  if (str.startsWith('http')) return false;
  // Check if it's a single emoji character (most emojis are 2-4 chars due to unicode)
  return str.length <= 10;
};

// Check if user is offline (no update in 16 minutes)
export const isUserOffline = (lastUpdated) => {
  if (!lastUpdated) return true;
  
  let timestamp;
  
  // Handle Firebase timestamp format
  if (typeof lastUpdated === 'object' && lastUpdated.seconds) {
    timestamp = lastUpdated.seconds * 1000;
  } else if (typeof lastUpdated === 'number') {
    // If it's already in milliseconds
    if (lastUpdated < 1000000000000) {
      timestamp = lastUpdated * 1000;
    } else {
      timestamp = lastUpdated;
    }
  } else {
    return true; // Unknown format, consider offline
  }
  
  const now = Date.now();
  const sixteenMinutes = 16 * 60 * 1000;
  return (now - timestamp) > sixteenMinutes;
};

// Format timestamp to "dd hh:mm" format (e.g., "Mon 14:30")
export const formatLastUpdated = (lastUpdated) => {
  if (!lastUpdated) return 'Never';
  
  let timestamp;
  
  // Handle Firebase timestamp format
  if (typeof lastUpdated === 'object' && lastUpdated.seconds) {
    timestamp = lastUpdated.seconds * 1000;
  } else if (typeof lastUpdated === 'number') {
    // If it's already in milliseconds
    if (lastUpdated < 1000000000000) {
      timestamp = lastUpdated * 1000;
    } else {
      timestamp = lastUpdated;
    }
  } else {
    return 'Unknown';
  }
  
  const date = new Date(timestamp);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = days[date.getDay()];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day} ${hours}:${minutes}`;
};

import L from 'leaflet';

// Create custom icon for friends (emoji-based)
export const createIcon = (avatar, isOffline = false) => {
  const borderColor = isOffline ? '#888' : '#4ade80';
  const emoji = isEmoji(avatar) ? avatar : '👤';

  const html = `<div style="
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: white;
    border: 3px solid ${borderColor};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    ${isOffline ? 'opacity: 0.5; filter: grayscale(100%);' : ''}
  ">${emoji}</div>`;

  return new L.DivIcon({
    html: html,
    iconSize: [32, 32],
    className: 'emoji-icon'
  });
};

// Create custom cluster icon
export const createClusterCustomIcon = (cluster) => {
  const count = cluster.getChildCount();

  const html = `
    <div style="
      background: #667eea;
      color: white;
      border-radius: 50%;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    ">${count}</div>
  `;

  return L.divIcon({
    html: html,
    className: 'custom-cluster-icon',
    iconSize: L.point(36, 36, true)
  });
};

