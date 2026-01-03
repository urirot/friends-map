import React, { useState, useEffect, useRef, useCallback } from 'react';
import { auth, provider, db } from './firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
import { ref, set, onValue, serverTimestamp, get } from 'firebase/database';
import L from 'leaflet';
import './App.css';

// Components
import LoginScreen from './components/LoginScreen';
import NoSignalScreen from './components/NoSignalScreen';
import ProfileSetup from './components/ProfileSetup';
import MapView from './components/MapView';
import UsersPanel from './components/UsersPanel';
import AdminPanel from './components/AdminPanel';
import MessageBox from './components/MessageBox';
import InstallPrompts from './components/InstallPrompts';
import ControlButtons from './components/ControlButtons';
import ErrorMessage from './components/ErrorMessage';
import { isEmoji, isUserOffline } from './utils/mapUtils';

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
  const requestingAccessRef = useRef(false);
  
  // Keep ref in sync with state
  useEffect(() => {
    requestingAccessRef.current = requestingAccess;
  }, [requestingAccess]);
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
  const [showUsersPanel, setShowUsersPanel] = useState(false);

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

  // Update user location in database
  const updateUserLocation = useCallback(async () => {
    if (!user || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;

        const userRef = ref(db, 'users/' + user.uid);
        const snapshot = await get(userRef);
        const userData = snapshot.val();

        let moveCount = userData?.moveCount || 0;

        if (userData?.lat && userData?.lng) {
          const latChanged = userData.lat !== latitude;
          const lngChanged = userData.lng !== longitude;

          if (latChanged || lngChanged) {
            moveCount += 1;
            console.log(`Location changed. Move count: ${moveCount}`);
          }
        } else {
          moveCount = 0;
        }

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

        try {
          const usersRef = ref(db, 'users');
          const usersSnapshot = await get(usersRef);
          const data = usersSnapshot.val();
          if (data) {
            console.log('Fetched friends locations on manual update');
            setFriends(data);
          }

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
        maximumAge: 600000
      }
    );
  }, [user]);

  // Handle visibility change - update location when app comes back to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && user && !needsProfile) {
        console.log('App became visible - updating location');
        updateUserLocation();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, needsProfile, updateUserLocation]);

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

    const interval = setInterval(checkForUpdates, 60000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'CACHE_PROGRESS') {
        setDownloadProgress(event.data.percentage);
      } else if (event.data.type === 'CACHE_COMPLETE') {
        setDownloadingMaps(false);
        setDownloadProgress(100);
        setTimeout(() => setDownloadProgress(0), 3000);
      }
    });

    navigator.serviceWorker.ready.then((registration) => {
      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdatePrompt(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowUpdatePrompt(true);
          }
        });
      });
    });

    return () => clearInterval(interval);
  }, []);

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

        const emailKey = currentUser.email.replace(/\./g, ',');
        const whitelistRef = ref(db, 'whitelist/' + emailKey);
        console.log('Checking whitelist for:', currentUser.email, '(key:', emailKey + ')');
        const whitelistSnapshot = await get(whitelistRef);
        console.log('Whitelist exists:', whitelistSnapshot.exists(), 'Value:', whitelistSnapshot.val());

        if (!whitelistSnapshot.exists() || whitelistSnapshot.val() !== true) {
          console.log('User not whitelisted:', currentUser.email);

          if (!requestingAccessRef.current) {
            await auth.signOut();
            setError('Access denied. Your email is not whitelisted. Click "Request Access" to get permission.');
            return;
          }

          setAuthLoading(false);
          return;
        }

        console.log('✓ User is whitelisted:', currentUser.email);

        const adminRef = ref(db, 'admins/' + currentUser.email.replace(/\./g, ','));
        const adminSnapshot = await get(adminRef);
        setIsAdmin(adminSnapshot.exists() && adminSnapshot.val() === true);

        const userRef = ref(db, 'users/' + currentUser.uid);
        const snapshot = await get(userRef);

        const data = snapshot.val();
        const hasEmojiAvatar = data?.avatar && !data.avatar.startsWith('http');

        if (!snapshot.exists() || !data?.name || !hasEmojiAvatar) {
          setNeedsProfile(true);
          setUser(currentUser);
        } else {
          setUser(currentUser);
          setNeedsProfile(false);
          startTracking(currentUser);
        }
      } else {
        setUser(null);
        setNeedsProfile(false);
        setIsAdmin(false);
      }

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
      if ('caches' in window) {
        caches.open('egels-map-tiles-v4').then(async cache => {
          const keys = await cache.keys();
          console.log(`📦 Found ${keys.length} cached tiles`);

          if (keys.length === 0) {
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

    const { get } = await import('firebase/database');
    const userRef = ref(db, 'users/' + currentUser.uid);
    const snapshot = await get(userRef);
    const userData = snapshot.val();

    if (userData && userData.lat && userData.lng) {
      console.log('Loading last known location:', userData.lat, userData.lng);
      setPosition([userData.lat, userData.lng]);
      setLoading(false);
    }

    let locationInterval = null;

    const updateLocationInFirebase = async (latitude, longitude) => {
      const userRef = ref(db, 'users/' + currentUser.uid);
      const snapshot = await get(userRef);
      const currentData = snapshot.val();

      let moveCount = currentData?.moveCount || 0;

      if (currentData?.lat && currentData?.lng) {
        const latChanged = currentData.lat !== latitude;
        const lngChanged = currentData.lng !== longitude;

        if (latChanged || lngChanged) {
          moveCount += 1;
          console.log(`Location changed. Move count: ${moveCount}`);
        }
      } else {
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

    fetchFriendsLocations();
    fetchSharedMessage();

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        console.log('Current location received:', latitude, longitude);
        setPosition([latitude, longitude]);
        setLoading(false);
        setError(null);
        setNoSignal(false);

        updateLocationInFirebase(latitude, longitude);

        locationInterval = setInterval(() => {
          console.log('Updating location (1-min interval)');
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
              maximumAge: 60000
            }
          );
          fetchFriendsLocations();
          fetchSharedMessage();
        }, 60000);
      },
      (err) => {
        console.error('Geolocation error:', err);

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
          console.log('Using last known position due to location error');
          setLoading(false);
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 60000
      }
    );

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
    } catch (err) {
      console.error('Login error:', err);

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

      const requestRef = ref(db, 'accessRequests/' + user.email.replace(/\./g, ','));
      console.log('Saving access request to Firebase...');
      await set(requestRef, {
        email: user.email,
        name: user.displayName,
        avatar: user.photoURL,
        requestedAt: serverTimestamp()
      });
      console.log('Access request saved successfully');

      await auth.signOut();
      setRequestingAccess(false);

      setError('Access request submitted! The administrator will review your request. You will be notified via email once approved.');
    } catch (err) {
      console.error('Request access error:', err);
      setRequestingAccess(false);

      if (err.code === 'PERMISSION_DENIED' || err.message?.includes('Permission denied')) {
        setError('Failed to submit request. Database permissions may need updating. Please contact the administrator.');
      } else if (err.code === 'auth/popup-closed-by-user') {
        setError(null);
      } else {
        setError('Failed to submit access request. Please try again.');
      }
    }
  };

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

    setError(null);
    setLoading(true);

    try {
      console.log('Saving profile for user:', user.uid);
      const userRef = ref(db, 'users/' + user.uid);

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

      if (err.code === 'PERMISSION_DENIED' || err.message?.includes('Permission denied')) {
        setError(`Permission denied writing to database. Error code: ${err.code}. Please contact the administrator.`);
      } else if (err.code === 'NETWORK_ERROR' || err.message?.includes('network')) {
        setError(`Network error. Please check your internet connection and try again.`);
      } else {
        setError(`Failed to save profile. Error: ${err.code || err.message || 'Unknown error'}. Please screenshot this and send to admin.`);
      }
    }
  };

  const handleApproveAccess = async (email) => {
    try {
      const whitelistRef = ref(db, 'whitelist/' + email.replace(/\./g, ','));
      await set(whitelistRef, true);

      const requestRef = ref(db, 'accessRequests/' + email.replace(/\./g, ','));
      await set(requestRef, null);

      setError(`✅ Approved ${email}`);
      setTimeout(() => setError(null), 3000);
    } catch (err) {
      console.error('Error approving access:', err);
      setError('Failed to approve access. Please try again.');
    }
  };

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


  const handleRefresh = () => {
    console.log('🔄 Refreshing location and data...');
    updateUserLocation();
  };

  const handleCenter = () => {
    if (!mapRef.current || !position) return;

    updateUserLocation();

    if (mapRef.current) {
      mapRef.current.setView(position, 15);
    }
  };

  const handleFocusUser = (userId, lat, lng) => {
    if (!mapRef.current || !lat || !lng) return;

    mapRef.current.setView([lat, lng], 15);
    setShowUsersPanel(false);
  };

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

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdatePrompt(false);
    }
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  // Show nothing while checking auth state
  if (authLoading) {
    return null;
  }

  // No signal screen
  if (noSignal) {
    return (
      <NoSignalScreen 
        onRetry={() => {
          setNoSignal(false);
          setLoading(true);
          if (user) {
            startTracking(user);
          }
        }} 
      />
    );
  }

  // Login screen
  if (!user) {
    return (
      <LoginScreen 
        error={error}
        onLogin={handleLogin}
        onRequestAccess={handleRequestAccess}
      />
    );
  }

  // Profile setup screen
  if (needsProfile) {
    return (
      <ProfileSetup
        profileName={profileName}
        setProfileName={setProfileName}
        selectedEmoji={selectedEmoji}
        setSelectedEmoji={setSelectedEmoji}
        friends={friends}
        loading={loading}
        error={error}
        onSave={handleSaveProfile}
      />
    );
  }

  return (
    <div className='App'>
      <ErrorMessage error={error} />

      <MessageBox
        messageBoxEnabled={messageBoxEnabled}
        user={user}
        needsProfile={needsProfile}
        sharedMessage={sharedMessage}
        showMessageEditor={showMessageEditor}
        editingMessage={editingMessage}
        setEditingMessage={setEditingMessage}
        onOpenEditor={handleOpenMessageEditor}
        onCloseEditor={() => setShowMessageEditor(false)}
        onSaveMessage={handleSaveMessage}
      />

      <InstallPrompts
        showUpdatePrompt={showUpdatePrompt}
        showInstallPrompt={showInstallPrompt}
        showIOSInstall={showIOSInstall}
        isIOSSafari={isIOSSafari}
        downloadingMaps={downloadingMaps}
        downloadProgress={downloadProgress}
        loading={loading}
        onUpdate={handleUpdate}
        onInstall={handleInstall}
        onDismissUpdate={() => setShowUpdatePrompt(false)}
        onDismissInstall={() => setShowInstallPrompt(false)}
        onDismissIOS={() => setShowIOSInstall(false)}
      />

      {isAdmin && (
        <button
          className='admin-button'
          onClick={() => setShowAdminPanel(!showAdminPanel)}
        >
          {showAdminPanel ? '✕' : Object.keys(accessRequests).length > 0 ? `⚙️ ${Object.keys(accessRequests).length}` : '⚙️'}
        </button>
      )}

      <ControlButtons
        position={position}
        onRefresh={handleRefresh}
        onCenter={handleCenter}
        showUsersPanel={showUsersPanel}
        onToggleUsersPanel={() => setShowUsersPanel(!showUsersPanel)}
      />

      {position && (
        <UsersPanel
          showUsersPanel={showUsersPanel}
          friends={friends}
          user={user}
          isUserOffline={isUserOffline}
          isEmoji={isEmoji}
          onClose={() => setShowUsersPanel(false)}
          onFocusUser={handleFocusUser}
        />
      )}

      {isAdmin && position && (
        <div className='zoom-indicator'>
          Zoom: {zoomLevel}
        </div>
      )}

      <AdminPanel
        showAdminPanel={showAdminPanel}
        clusterRadius={clusterRadius}
        messageBoxEnabled={messageBoxEnabled}
        accessRequests={accessRequests}
        onClusterRadiusChange={handleClusterRadiusChange}
        onToggleMessageBox={handleToggleMessageBox}
        onApproveAccess={handleApproveAccess}
        onRejectAccess={handleRejectAccess}
      />

      <MapView
        position={position}
        friends={friends}
        user={user}
        clusterRadius={clusterRadius}
        mapRef={mapRef}
        onCenterChange={(map) => { mapRef.current = map; }}
        onZoomChange={setZoomLevel}
        loading={loading}
      />
    </div>
  );
}

export default App;
