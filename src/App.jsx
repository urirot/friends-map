import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { auth, provider, db } from './firebase';
import { signInWithPopup, onAuthStateChanged } from 'firebase/auth';
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

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

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

  // Handle Auth State
  useEffect(() => {
    console.log('Setting up auth listener...');
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Auth state changed:', currentUser ? currentUser.email : 'No user');

      if (currentUser) {
        // Check if user has a profile
        const { get } = await import('firebase/database');
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
      }
    });
    return () => unsubscribe();
  }, []);

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
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user is whitelisted
      const whitelistRef = ref(db, 'whitelist/' + user.email.replace(/\./g, ','));
      const { get } = await import('firebase/database');
      const snapshot = await get(whitelistRef);

      if (!snapshot.exists() || snapshot.val() !== true) {
        // User not whitelisted - sign them out
        await auth.signOut();
        setError('Access denied. Your email is not whitelisted. Click "Request Access" below to get permission.');
        return;
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.code === 'PERMISSION_DENIED') {
        setError('Access denied. Your email is not whitelisted.');
      } else {
        setError('Failed to sign in. Please try again.');
      }
    }
  };

  const handleRequestAccess = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Save access request to Firebase
      const requestRef = ref(db, 'accessRequests/' + user.email.replace(/\./g, ','));
      await set(requestRef, {
        email: user.email,
        name: user.displayName,
        avatar: user.photoURL,
        requestedAt: serverTimestamp()
      });

      // Sign them out
      await auth.signOut();

      setError('Access request submitted! The administrator will review your request. You will be notified via email once approved.');
    } catch (err) {
      console.error('Request access error:', err);
      setError('Failed to submit access request. Please try again.');
    }
  };

  // Save user profile
  const handleSaveProfile = async () => {
    if (!profileName.trim()) {
      setError('Please enter a name');
      return;
    }

    try {
      const userRef = ref(db, 'users/' + user.uid);
      await set(userRef, {
        name: profileName.trim(),
        avatar: selectedEmoji,
        lastUpdated: serverTimestamp()
      });

      setNeedsProfile(false);
      startTracking(user);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('Failed to save profile. Please try again.');
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

  if (!user) {
    return (
      <div className='login-screen'>
        <h1>Egels Map</h1>
        <p>See where your friends are in real-time</p>
        <button onClick={handleLogin}>Sign in with Google</button>
        <button onClick={handleRequestAccess} style={{marginTop: '10px', background: '#888'}}>
          Request Access
        </button>
        {error && <div className='error-message'>{error}</div>}
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

          <button onClick={handleSaveProfile} className='save-button'>
            Save Profile
          </button>
        </div>
        {error && <div className='error-message'>{error}</div>}
      </div>
    );
  }

  return (
    <div className='App'>
      {error && <div className='error-message'>{error}</div>}

      {showInstallPrompt && (
        <div className='install-prompt'>
          <span>Install Egels Map for quick access</span>
          <button onClick={handleInstall}>Install</button>
          <button onClick={() => setShowInstallPrompt(false)} style={{background: '#888'}}>Later</button>
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
                    {offline && <div style={{color: '#888', fontSize: '12px'}}>Not online</div>}
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
