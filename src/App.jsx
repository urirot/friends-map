import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { ref, set, onValue, serverTimestamp, get } from 'firebase/database';
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

// Component to handle map controls
function MapController({ center, onCenterChange, onZoomChange }) {
  const map = useMap();

  useEffect(() => {
    if (center && onCenterChange) {
      onCenterChange(map);
    }
  }, [center, map, onCenterChange]);

  useEffect(() => {
    if (!map || !onZoomChange) return;

    const handleZoom = () => {
      onZoomChange(map.getZoom());
    };

    // Set initial zoom
    onZoomChange(map.getZoom());

    // Listen for zoom changes
    map.on('zoomend', handleZoom);

    return () => {
      map.off('zoomend', handleZoom);
    };
  }, [map, onZoomChange]);

  return null;
}

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
  const [clusterRadius, setClusterRadius] = useState(50);
  const [messageBoxEnabled, setMessageBoxEnabled] = useState(true);
  const [sharedMessage, setSharedMessage] = useState('');
  const [showMessageEditor, setShowMessageEditor] = useState(false);
  const [editingMessage, setEditingMessage] = useState('');
  const mapRef = useRef(null);
  const [downloadingMaps, setDownloadingMaps] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(15);
  const [noSignal, setNoSignal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  // Auto-dismiss error messages after 10 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 10000);

      return () => clearTimeout(timer);
    }
  }, [error]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNoSignal(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNoSignal(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Handle visibility change - update location when app comes back to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user && !needsProfile) {
        // App just became visible, update location
        console.log('App became visible - updating location');
        updateUserLocation();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, needsProfile]);

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

    // Listen for service worker messages (cache progress)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'CACHE_PROGRESS') {
        setDownloadProgress(event.data.percentage);
      } else if (event.data.type === 'CACHE_COMPLETE') {
        setDownloadingMaps(false);
        setDownloadProgress(100);
        setTimeout(() => setDownloadProgress(0), 3000);
      }
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

  // Listen to cluster radius setting from database
  useEffect(() => {
    const settingsRef = ref(db, 'settings/clusterRadius');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        setClusterRadius(data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to message box enabled setting
  useEffect(() => {
    const settingsRef = ref(db, 'settings/messageBoxEnabled');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      const data = snapshot.val();
      if (data !== null) {
        setMessageBoxEnabled(data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Listen to shared message
  useEffect(() => {
    const messageRef = ref(db, 'sharedMessage');
    const unsubscribe = onValue(messageRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.text) {
        setSharedMessage(data.text);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load all users when showing profile setup (to prevent duplicate avatars)
  useEffect(() => {
    if (needsProfile && user) {
      const usersRef = ref(db, 'users');
      const unsubscribe = onValue(usersRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          console.log('Loaded existing users for avatar checking');
          setFriends(data);
        }
      });

      return () => unsubscribe();
    }
  }, [needsProfile, user]);

  // Auto-download maps when user is authenticated and has profile
  useEffect(() => {
    if (user && !needsProfile && !downloadingMaps) {
      // Check if maps are already cached
      if ('caches' in window) {
        caches.open('egels-map-tiles-v4').then(async cache => {
          const keys = await cache.keys();
          console.log(`📦 Found ${keys.length} cached tiles`);

          if (keys.length === 0) {
            // Maps not cached yet, start download
            console.log('🚀 Starting map download...');
            handleDownloadMaps();
          } else {
            console.log('✅ Maps already cached');
          }
        });
      }
    }
  }, [user, needsProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update cluster radius in database
  const handleClusterRadiusChange = async (newRadius) => {
    setClusterRadius(newRadius);
    if (isAdmin) {
      try {
        const settingsRef = ref(db, 'settings/clusterRadius');
        await set(settingsRef, newRadius);
      } catch (err) {
        console.error('Error updating cluster radius:', err);
        setError('Failed to save cluster radius setting');
      }
    }
  };

  // Toggle message box enabled
  const handleToggleMessageBox = async (enabled) => {
    if (isAdmin) {
      try {
        const settingsRef = ref(db, 'settings/messageBoxEnabled');
        await set(settingsRef, enabled);
        setMessageBoxEnabled(enabled);
      } catch (err) {
        console.error('Error toggling message box:', err);
        setError('Failed to save message box setting');
      }
    }
  };

  // Save shared message
  const handleSaveMessage = async () => {
    if (!user) return;

    const trimmedMessage = editingMessage.trim();
    if (trimmedMessage.length > 100) {
      setError('Message must be 100 characters or less');
      return;
    }

    try {
      const messageRef = ref(db, 'sharedMessage');
      await set(messageRef, {
        text: trimmedMessage,
        author: user.displayName || user.email,
        timestamp: serverTimestamp()
      });
      setShowMessageEditor(false);
      setEditingMessage('');
    } catch (err) {
      console.error('Error saving message:', err);
      setError('Failed to save message');
    }
  };

  // Open message editor
  const handleOpenMessageEditor = () => {
    setEditingMessage(sharedMessage);
    setShowMessageEditor(true);
  };

  // Load Initial Location
  const startTracking = async (currentUser) => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    console.log('Loading location...');
    setLoading(true);

    // Get user's profile data
    const { get } = await import('firebase/database');
    const userRef = ref(db, 'users/' + currentUser.uid);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    // Load last known location from Firebase immediately
    if (userData && userData.lat && userData.lng) {
      console.log('Loading last known location:', userData.lat, userData.lng);
      setPosition([userData.lat, userData.lng]);
      setLoading(false);
    }

    let locationInterval = null;

    const updateLocationInFirebase = async (latitude, longitude) => {
      const userRef = ref(db, 'users/' + currentUser.uid);

      // Get current data to check if location changed
      const snapshot = await get(userRef);
      const currentData = snapshot.val();

      let moveCount = currentData?.moveCount || 0;

      // Check if location changed at all
      if (currentData?.lat && currentData?.lng) {
        const latChanged = currentData.lat !== latitude;
        const lngChanged = currentData.lng !== longitude;

        if (latChanged || lngChanged) {
          moveCount += 1;
          console.log(`Location changed. Move count: ${moveCount}`);
        }
      } else {
        // First location update
        moveCount = 0;
      }

      set(userRef, {
        name: userData.name,
        avatar: userData.avatar,
        lat: latitude,
        lng: longitude,
        moveCount: moveCount,
        lastUpdated: serverTimestamp()
      }).catch(err => {
        console.error('Error updating location:', err);
        setError('Failed to update location. Check Firebase permissions.');
      });
    };

    // Function to fetch friends' locations
    const fetchFriendsLocations = async () => {
      try {
        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        const data = snapshot.val();
        if (data) {
          console.log('Fetched friends locations');
          setFriends(data);
        }
      } catch (err) {
        console.error('Error reading locations:', err);
        setError('Failed to load friends. Check Firebase permissions.');
      }
    };

    // Function to fetch shared message
    const fetchSharedMessage = async () => {
      try {
        const messageRef = ref(db, 'sharedMessage');
        const snapshot = await get(messageRef);
        const data = snapshot.val();
        if (data && data.text) {
          console.log('Fetched shared message:', data.text);
          setSharedMessage(data.text);
        } else {
          setSharedMessage('');
        }
      } catch (err) {
        console.error('Error reading shared message:', err);
      }
    };

    // Fetch friends' locations immediately
    fetchFriendsLocations();

    // Fetch shared message immediately
    fetchSharedMessage();

    // Get current location in background
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log('Current location received:', latitude, longitude);
        setPosition([latitude, longitude]);
        setLoading(false);
        setError(null);
        setNoSignal(false);

        // Update Firebase
        updateLocationInFirebase(latitude, longitude);

        // Start 1-minute interval for updates
        locationInterval = setInterval(() => {
          console.log('Updating location (1-min interval)');
          // Update own location
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              console.log('Periodic location update:', latitude, longitude);
              setPosition([latitude, longitude]);
              updateLocationInFirebase(latitude, longitude);
              setNoSignal(false);
            },
            (err) => {
              console.error('Periodic location error:', err);
              if (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT) {
                setNoSignal(true);
              }
            },
            {
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 60000  // Accept cached position up to 1 minute
            }
          );
          // Also fetch friends' locations and shared message
          fetchFriendsLocations();
          fetchSharedMessage();
        }, 60000);  // Every 1 minute
      },
      (err) => {
        console.error('Geolocation error:', err);

        // Only show error if we don't have a last known position
        if (!userData || !userData.lat || !userData.lng) {
          setLoading(false);
          switch(err.code) {
            case err.PERMISSION_DENIED:
              setError('Location permission denied. Please enable location access.');
              break;
            case err.POSITION_UNAVAILABLE:
              setNoSignal(true);
              break;
            case err.TIMEOUT:
              setNoSignal(true);
              break;
            default:
              setError('An unknown error occurred while getting location.');
          }
        } else {
          // We have last known position, just log the error
          console.log('Using last known position due to location error');
          setLoading(false);
        }
      },
      {
        enableHighAccuracy: false,  // Use network/WiFi location (faster, less battery)
        timeout: 30000,  // 30 second timeout for initial load
        maximumAge: 60000  // Accept cached position up to 1 minute old
      }
    );

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

  // Create custom cluster icon
  const createClusterCustomIcon = (cluster) => {
    const count = cluster.getChildCount();

    const html = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      ">
        <div style="font-size: 32px;">👑</div>
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
      </div>
    `;

    return L.divIcon({
      html: html,
      className: 'custom-cluster-icon',
      iconSize: L.point(40, 60, true)
    });
  };

  // Update user location in database
  const updateUserLocation = async () => {
    if (!user || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        // Get user's profile data
        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        const userData = snapshot.val();

        let moveCount = userData?.moveCount || 0;

        // Check if location changed at all
        if (userData?.lat && userData?.lng) {
          const latChanged = userData.lat !== latitude;
          const lngChanged = userData.lng !== longitude;

          if (latChanged || lngChanged) {
            moveCount += 1;
            console.log(`Location changed. Move count: ${moveCount}`);
          }
        } else {
          // First location update
          moveCount = 0;
        }

        // Update location in Firebase
        await set(userRef, {
          name: userData.name,
          avatar: userData.avatar,
          lat: latitude,
          lng: longitude,
          moveCount: moveCount,
          lastUpdated: serverTimestamp()
        });

        setPosition([latitude, longitude]);
        setNoSignal(false);

        // Also fetch friends' locations and shared message
        try {
          const usersRef = ref(db, 'users');
          const usersSnapshot = await get(usersRef);
          const data = usersSnapshot.val();
          if (data) {
            console.log('Fetched friends locations on manual update');
            setFriends(data);
          }

          // Fetch shared message
          const messageRef = ref(db, 'sharedMessage');
          const messageSnapshot = await get(messageRef);
          const messageData = messageSnapshot.val();
          if (messageData && messageData.text) {
            setSharedMessage(messageData.text);
          } else {
            setSharedMessage('');
          }
        } catch (err) {
          console.error('Error reading locations:', err);
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        if (err.code === err.POSITION_UNAVAILABLE || err.code === err.TIMEOUT) {
          setNoSignal(true);
        } else {
          setError('Failed to get location');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 600000  // Accept cached position up to 10 minutes old
      }
    );
  };

  // Manual refresh function - update location and fetch latest data
  const handleRefresh = () => {
    console.log('🔄 Refreshing location and data...');
    updateUserLocation();
  };

  // Center map on user location and update it
  const handleCenter = () => {
    if (!mapRef.current || !position) return;

    updateUserLocation();

    // Center the map on user's position
    if (mapRef.current) {
      mapRef.current.setView(position, 15);
    }
  };

  // Download offline maps
  const handleDownloadMaps = async () => {
    if (!('serviceWorker' in navigator)) {
      setError('Service Worker not supported');
      return;
    }

    setDownloadingMaps(true);
    setDownloadProgress(0);

    try {
      const registration = await navigator.serviceWorker.ready;
      registration.active.postMessage({ type: 'CACHE_TILES' });
    } catch (err) {
      console.error('Failed to start map download:', err);
      setError('Failed to download maps');
      setDownloadingMaps(false);
    }
  };

  // Show nothing while checking auth state
  if (authLoading) {
    return null;
  }

  // No signal screen
  if (noSignal) {
    return (
      <div className='login-screen'>
        <img src='/sad_egel.jpg' alt='No Signal' style={{width: '200px', height: '200px', borderRadius: '50%', objectFit: 'cover'}} />
        <h1 style={{textAlign: 'center'}}>No Internet Connection</h1>
        <p style={{textAlign: 'center'}}>Please check your connection and try again</p>
        <button onClick={() => {
          setNoSignal(false);
          setLoading(true);
          if (user) {
            startTracking(user);
          }
        }}>Retry</button>
      </div>
    );
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
          <div className='error-message' style={error.includes('Access denied') ? {background: '#f59e0b'} : {}}>
            {error}
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

          <button onClick={handleSaveProfile} className='save-button' disabled={loading}>
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
        {error && (
          <div className='error-message' style={error.includes('Access denied') ? {background: '#f59e0b'} : {}}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='App'>
      {error && (
        <div className='error-message' style={error.includes('Access denied') ? {background: '#f59e0b'} : {}}>
          {error}
        </div>
      )}

      {messageBoxEnabled && user && !needsProfile && (
        <div
          className='message-box'
          onClick={handleOpenMessageEditor}
        >
          {sharedMessage || 'Click to set a message for everyone...'}
        </div>
      )}

      {showMessageEditor && (
        <div className='message-editor-overlay' onClick={() => setShowMessageEditor(false)}>
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
              <button onClick={handleSaveMessage} className='save-message-btn'>
                Save
              </button>
              <button onClick={() => setShowMessageEditor(false)} className='cancel-message-btn'>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showUpdatePrompt && !loading && (
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

      {isAdmin && (
        <button
          className='admin-button'
          onClick={() => setShowAdminPanel(!showAdminPanel)}
        >
          {showAdminPanel ? '✕' : Object.keys(accessRequests).length > 0 ? `⚙️ ${Object.keys(accessRequests).length}` : '⚙️'}
        </button>
      )}

      {position && (
        <>
          <button className='refresh-button' onClick={handleRefresh}>
            🔄
          </button>
          <button className='center-button' onClick={handleCenter}>
            <img src="/icon-512.png" style={{width: '20px', height: '20px', borderRadius: '50%'}} alt="Center" />
          </button>
        </>
      )}

      {isAdmin && position && (
        <div className='zoom-indicator'>
          Zoom: {zoomLevel}
        </div>
      )}

      {showAdminPanel && (
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
              onChange={(e) => handleClusterRadiusChange(Number(e.target.value))}
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
                onChange={(e) => handleToggleMessageBox(e.target.checked)}
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
        <MapContainer
          center={position}
          zoom={15}
          scrollWheelZoom={true}
          ref={mapRef}
        >
          <MapController
            center={position}
            onCenterChange={(map) => { mapRef.current = map; }}
            onZoomChange={setZoomLevel}
          />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          />

          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={clusterRadius}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={createClusterCustomIcon}
          >
            {/* Render Friends */}
            {Object.entries(friends).map(([key, friend]) => {
              const isCurrentUser = user && key === user.uid;
              const offline = isCurrentUser ? false : isUserOffline(friend.lastUpdated);
              return friend.lat && friend.lng && (
                <Marker
                  key={key}
                  position={[friend.lat, friend.lng]}
                  icon={createIcon(friend.avatar || '👤', offline)}
                >
                  <Popup>
                    <div style={{textAlign: 'center'}}>
                      {isCurrentUser ? (
                        <>
                          <div style={{fontSize: '40px', marginBottom: '8px'}}>
                            {isEmoji(friend.avatar) ? friend.avatar : '👤'}
                          </div>
                          <b>{friend.name || 'You'} (You)</b>
                        </>
                      ) : (
                        <>
                          <div style={{fontSize: '40px', marginBottom: '8px'}}>
                            {isEmoji(friend.avatar) ? friend.avatar : '👤'}
                          </div>
                          <b>{friend.name || 'Anonymous'}</b>
                          {offline && <div style={{color: '#888', fontSize: '12px'}}>Offline</div>}
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
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
