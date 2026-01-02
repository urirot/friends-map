import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { ref, set, onValue, serverTimestamp } from 'firebase/database';
import L from 'leaflet';
import './App.css';

// Fix for default Leaflet icon issues in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function App() {
  const [user, setUser] = useState(null);
  const [friends, setFriends] = useState({});
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🐄');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [accessRequests, setAccessRequests] = useState({});
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const [isIOSSafari, setIsIOSSafari] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [requestingAccess, setRequestingAccess] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState(null);

  // Animal emojis
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

  // Handle PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Check if iOS and not in standalone mode (not installed)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone;

    if (isIOS && !isStandalone) {
      setIsIOSSafari(isSafari);
      // Show iOS install prompt after a short delay
      setTimeout(() => setShowIOSInstall(true), 2000);
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Handle service worker updates
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const checkForUpdates = () => {
      navigator.serviceWorker.ready.then((registration) => {
        registration.update();
      });
    };

    // Check for updates every 60 seconds
    const interval = setInterval(checkForUpdates, 60000);

    // Listen for new service worker
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New service worker has taken control - reload the page
      window.location.reload();
    });

    // Detect waiting service worker
    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdatePrompt(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker installed, show update prompt
            setWaitingWorker(newWorker);
            setShowUpdatePrompt(true);
          }
        });
      });
    });

    return () => clearInterval(interval);
  }, []);

  // Handle update click
  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdatePrompt(false);
    }
  };

  // Handle install click
  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  // Check for redirect result on load
  useEffect(() => {
    const checkRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          console.log('Redirect sign-in successful:', result.user.email);
        }
      } catch (err) {
        console.error('Redirect result error:', err);
        if (err.message?.includes('session')) {
          setError('Sign in failed. Please enable cookies and site data in your browser settings.');
        }
      }
    };
    checkRedirect();
  }, []);

  // Handle Auth State
  useEffect(() => {
    console.log('Setting up auth listener...');
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Auth state changed:', currentUser ? currentUser.email : 'No user');

      if (currentUser) {
        const { get } = await import('firebase/database');

        // FIRST: Check if user is whitelisted
        const emailKey = currentUser.email.replace(/\./g, ',');
        const whitelistRef = ref(db, 'whitelist/' + emailKey);
        console.log('Checking whitelist for:', currentUser.email, '(key:', emailKey + ')');
        const whitelistSnapshot = await get(whitelistRef);
        console.log('Whitelist exists:', whitelistSnapshot.exists(), 'Value:', whitelistSnapshot.val());

        if (!whitelistSnapshot.exists() || whitelistSnapshot.val() !== true) {
          // User not whitelisted
          console.log('User not whitelisted:', currentUser.email);

          // If they're requesting access, let them stay signed in briefly
          if (!requestingAccess) {
            await auth.signOut();
            setError('Access denied. Your email is not whitelisted. Click "Request Access" to get permission.');
            return;
          }

          // They're requesting access - don't sign out, auth check complete
          setAuthLoading(false);
          return;
        }

        console.log('✓ User is whitelisted:', currentUser.email);

        // Check if user is admin
        const adminRef = ref(db, 'admins/' + currentUser.email.replace(/\./g, ','));
        const adminSnapshot = await get(adminRef);
        setIsAdmin(adminSnapshot.exists() && adminSnapshot.val() === true);

        // Check if user has a profile
        const userRef = ref(db, 'users/' + currentUser.uid);
        const snapshot = await get(userRef);

        const data = snapshot.val();
        const hasEmojiAvatar = data?.avatar && !data.avatar.startsWith('http');

        if (!snapshot.exists() || !data?.name || !hasEmojiAvatar) {
          // User needs to set up profile (or update from old photo URL to emoji)
          setNeedsProfile(true);
          setUser(currentUser);
        } else {
          // User has profile with emoji avatar, start tracking
          setUser(currentUser);
          setNeedsProfile(false);
          startTracking(currentUser);
        }
      } else {
        setUser(null);
        setNeedsProfile(false);
        setIsAdmin(false);
      }

      // Auth check complete
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Listen to access requests if admin
  useEffect(() => {
    if (!isAdmin) return;

    const accessRequestsRef = ref(db, 'accessRequests');
    const unsubscribe = onValue(accessRequestsRef, (snapshot) => {
      const data = snapshot.val();
      setAccessRequests(data || {});
    });

    return () => unsubscribe();
  }, [isAdmin]);

  // Start Tracking Location
  const startTracking = async (currentUser) => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    console.log('Starting location tracking...');
    setLoading(true);

    // Get user's profile data
    const { get } = await import('firebase/database');
    const userRef = ref(db, 'users/' + currentUser.uid);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    // Update location periodically (every 30 seconds) instead of continuously
    let locationInterval;

    const updateLocation = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          console.log('Location received:', latitude, longitude);
          setPosition([latitude, longitude]);
          setLoading(false);
          setError(null);

          // Write to Firebase - preserve name and avatar
          const userRef = ref(db, 'users/' + currentUser.uid);
          set(userRef, {
            name: userData.name,
            avatar: userData.avatar,
            lat: latitude,
            lng: longitude,
            lastUpdated: serverTimestamp()
          }).catch(err => {
            console.error('Error updating location:', err);
            setError('Failed to update location. Check Firebase permissions.');
          });
        },
        (err) => {
          console.error('Geolocation error:', err);
          setLoading(false);

          switch(err.code) {
            case err.PERMISSION_DENIED:
              setError('Location permission denied. Please enable location access.');
              break;
            case err.POSITION_UNAVAILABLE:
              setError('Location information unavailable.');
              break;
            case err.TIMEOUT:
              setError('Location request timed out.');
              break;
            default:
              setError('An unknown error occurred while getting location.');
          }
        },
        {
          enableHighAccuracy: false,  // Use network/WiFi location (faster, less battery)
          timeout: 30000,  // Increased to 30 seconds
          maximumAge: 120000  // Accept cached position up to 2 minutes old
        }
      );
    };

    // Get initial location
    updateLocation();

    // Update every 2 minutes
    locationInterval = setInterval(updateLocation, 120000);

    // Listen for friends' locations
    const usersRef = ref(db, 'users');
    onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) setFriends(data);
    }, (err) => {
      console.error('Error reading locations:', err);
      setError('Failed to load friends. Check Firebase permissions.');
    });

    // Cleanup
    return () => {
      if (locationInterval) {
        clearInterval(locationInterval);
      }
    };
  };

  const handleLogin = async () => {
    try {
      console.log('Starting Google sign-in...');
      await signInWithPopup(auth, provider);
      console.log('Sign-in popup completed');
      // Whitelist check happens in onAuthStateChanged listener
    } catch (err) {
      console.error('Login error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);

      // If popup fails due to session storage issues, try redirect instead
      if (err.code === 'auth/web-storage-unsupported' ||
          err.code === 'auth/operation-not-supported-in-this-environment' ||
          err.message?.includes('session')) {
        console.log('Popup failed, trying redirect...');
        try {
          await signInWithRedirect(auth, provider);
        } catch (redirectErr) {
          console.error('Redirect error:', redirectErr);
          setError('Failed to sign in. Please check your browser settings and allow cookies/storage.');
        }
      } else if (err.code === 'auth/popup-closed-by-user') {
        // User closed popup, don't show error
        return;
      } else if (err.code === 'PERMISSION_DENIED' || err.message?.includes('Permission denied')) {
        setError('Database permission denied. Check Firebase security rules.');
      } else {
        setError(`Failed to sign in: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const handleRequestAccess = async () => {
    try {
      setRequestingAccess(true);
      setError(null);

      console.log('Starting access request sign-in...');
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log('User signed in for access request:', user.email);

      // Save access request to Firebase
      const requestRef = ref(db, 'accessRequests/' + user.email.replace(/\./g, ','));
      console.log('Saving access request to Firebase...');
      await set(requestRef, {
        email: user.email,
        name: user.displayName,
        avatar: user.photoURL,
        requestedAt: serverTimestamp()
      });
      console.log('Access request saved successfully');

      // Sign them out
      await auth.signOut();
      setRequestingAccess(false);

      setError('Access request submitted! The administrator will review your request. You will be notified via email once approved.');
    } catch (err) {
      console.error('Request access error:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      setRequestingAccess(false);

      if (err.code === 'PERMISSION_DENIED' || err.message?.includes('Permission denied')) {
        setError('Failed to submit request. Database permissions may need updating. Please contact the administrator.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError(null); // User cancelled, don't show error
      } else {
        setError('Failed to submit access request. Please try again.');
      }
    }
  };

  // Save user profile
  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      setError('Please enter a name');
      return;
    }

    if (!user || !user.uid) {
      setError('Not authenticated. Please sign out and sign in again. (Error: Missing user ID)');
      console.error('User object missing or invalid:', user);
      return;
    }

    setError(null); // Clear any previous errors
    setLoading(true);

    try {
      console.log('Saving profile for user:', user.uid);
      console.log('User email:', user.email);
      console.log('Profile name:', profileName.trim());
      console.log('Selected emoji:', selectedEmoji);

      const userRef = ref(db, 'users/' + user.uid);
      console.log('Writing to database path:', 'users/' + user.uid);

      await set(userRef, {
        name: profileName.trim(),
        avatar: selectedEmoji,
        lastUpdated: serverTimestamp()
      });

      console.log('✓ Profile saved successfully');
      setLoading(false);
      setNeedsProfile(false);
      startTracking(user);
    } catch (err) {
      setLoading(false);
      console.error('Error saving profile:', err);
      console.error('Error code:', err.code);
      console.error('Error message:', err.message);
      console.error('Error stack:', err.stack);

      // Provide detailed error messages visible to the user
      if (err.code === 'PERMISSION_DENIED' || err.message?.includes('Permission denied')) {
        setError(`Permission denied writing to database. Error code: ${err.code}. Please contact the administrator.`);
      } else if (err.code === 'NETWORK_ERROR' || err.message?.includes('network')) {
        setError(`Network error. Please check your internet connection and try again.`);
      } else {
        setError(`Failed to save profile. Error: ${err.code || err.message || 'Unknown error'}. Please screenshot this and send to admin.`);
      }
    }
  };

  // Approve access request
  const handleApproveAccess = async (email) => {
    try {
      const whitelistRef = ref(db, 'whitelist/' + email.replace(/\./g, ','));
      await set(whitelistRef, true);

      // Remove from access requests
      const requestRef = ref(db, 'accessRequests/' + email.replace(/\./g, ','));
      await set(requestRef, null);

      setError(`✅ Approved ${email}`);
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error('Error approving access:', err);
      setError('Failed to approve access. Please try again.');
    }
  };

  // Reject access request
  const handleRejectAccess = async (email) => {
    try {
      const requestRef = ref(db, 'accessRequests/' + email.replace(/\./g, ','));
      await set(requestRef, null);

      setError(`❌ Rejected ${email}`);
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error('Error rejecting access:', err);
      setError('Failed to reject access. Please try again.');
    }
  };

  // Check if avatar is an emoji (not a URL)
  const isEmoji = (str) => {
    if (!str) return false;
    // URLs start with http or https
    if (str.startsWith('http')) return false;
    // Check if it's a single emoji character (most emojis are 2-4 chars due to unicode)
    return str.length <= 10;
  };

  // Custom Icon for Friends (emoji-based)
  const createIcon = (avatar, isOffline = false) => {
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

  // Check if user is offline (no update in 16 minutes)
  const isUserOffline = (lastUpdated) => {
    if (!lastUpdated) return true;
    const now = Date.now();
    const sixteenMinutes = 16 * 60 * 1000;
    return (now - lastUpdated) > sixteenMinutes;
  };

  // Show nothing while checking auth state
  if (authLoading) {
    return null;
  }

  if (!user) {
    // Show request access if they got "access denied" error, otherwise show login
    const showRequestAccess = error && error.includes('Access denied');

    return (
      <div className='login-screen'>
        <img src='/icon-192.png' alt='Egels Map' className='login-logo' />
        <h1>Egels Map</h1>
        <p>See where your friends are in real-time</p>
        {showRequestAccess ? (
          <button onClick={handleRequestAccess}>
            Request Access
          </button>
        ) : (
          <button onClick={handleLogin}>Sign in with Google</button>
        )}
        {error && (
          <div className='error-message'>
            {error}
            <button className='error-close' onClick={() => setError(null)}>✕</button>
          </div>
        )}
      </div>
    );
  }

  // Profile setup screen
  if (needsProfile) {
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
            {animalEmojis.map((emoji) => (
              <button
                key={emoji}
                className={`emoji-button ${selectedEmoji === emoji ? 'selected' : ''}`}
                onClick={() => setSelectedEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>

          <button onClick={handleSaveProfile} className='save-button' disabled={loading}>
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
        {error && (
          <div className='error-message'>
            {error}
            <button className='error-close' onClick={() => setError(null)}>✕</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='App'>
      {error && (
        <div className='error-message'>
          {error}
          <button className='error-close' onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {showUpdatePrompt && (
        <div className='install-prompt' style={{background: '#4ade80'}}>
          <span>🎉 New update available!</span>
          <button onClick={handleUpdate}>Update Now</button>
          <button onClick={() => setShowUpdatePrompt(false)} style={{background: '#888'}}>Later</button>
        </div>
      )}

      {showInstallPrompt && !showUpdatePrompt && (
        <div className='install-prompt'>
          <span>Install Egels Map for quick access</span>
          <button onClick={handleInstall}>Install</button>
          <button onClick={() => setShowInstallPrompt(false)} style={{background: '#888'}}>Later</button>
        </div>
      )}

      {showIOSInstall && !showUpdatePrompt && (
        <div className='install-prompt'>
          {isIOSSafari ? (
            <span>📱 Tap Share → Add to Home Screen to install</span>
          ) : (
            <span>📱 Open in Safari to install this app</span>
          )}
          <button onClick={() => setShowIOSInstall(false)} style={{background: '#888'}}>Got it</button>
        </div>
      )}

      {isAdmin && (
        <button
          className='admin-button'
          onClick={() => setShowAdminPanel(!showAdminPanel)}
        >
          {showAdminPanel ? '✕ Close Admin' : `⚙️ Admin ${Object.keys(accessRequests).length > 0 ? `(${Object.keys(accessRequests).length})` : ''}`}
        </button>
      )}

      {showAdminPanel && (
        <div className='admin-panel'>
          <h2>Access Requests</h2>
          {Object.keys(accessRequests).length === 0 ? (
            <p style={{color: '#888', textAlign: 'center'}}>No pending requests</p>
          ) : (
            <div className='access-requests'>
              {Object.entries(accessRequests).map(([key, request]) => (
                <div key={key} className='access-request'>
                  <div className='request-info'>
                    <div className='request-name'>{request.name || 'Anonymous'}</div>
                    <div className='request-email'>{request.email}</div>
                  </div>
                  <div className='request-actions'>
                    <button onClick={() => handleApproveAccess(request.email)} className='approve-btn'>
                      ✓ Approve
                    </button>
                    <button onClick={() => handleRejectAccess(request.email)} className='reject-btn'>
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {position ? (
        <MapContainer center={position} zoom={15} scrollWheelZoom={true}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />

          {/* Render Friends */}
          {Object.entries(friends).map(([key, friend]) => {
            const offline = isUserOffline(friend.lastUpdated);
            return friend.lat && friend.lng && (
              <Marker
                key={key}
                position={[friend.lat, friend.lng]}
                icon={createIcon(friend.avatar || '👤', offline)}
              >
                <Popup>
                  <div style={{textAlign: 'center'}}>
                    <div style={{fontSize: '40px', marginBottom: '8px'}}>
                      {isEmoji(friend.avatar) ? friend.avatar : '👤'}
                    </div>
                    <b>{friend.name || 'Anonymous'}</b>
                    {offline && <div style={{color: '#888', fontSize: '12px'}}>Offline</div>}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      ) : (
        <div className='loading-overlay' style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
          {loading ? 'Getting your location...' : 'Waiting for location...'}
        </div>
      )}
    </div>
  );
}

export default App;
