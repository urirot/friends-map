import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { createIcon, createClusterCustomIcon, isEmoji, isUserOffline } from '../utils/mapUtils';

// Component to handle map controls
function MapController({ center, onCenterChange, onZoomChange }) {
  const map = useMap();

  React.useEffect(() => {
    if (center && onCenterChange) {
      onCenterChange(map);
    }
  }, [center, map, onCenterChange]);

  React.useEffect(() => {
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

export default function MapView({ 
  position, 
  friends, 
  user, 
  clusterRadius, 
  mapRef, 
  onCenterChange, 
  onZoomChange,
  loading 
}) {
  if (!position) {
    return (
      <div className='loading-overlay' style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        {loading ? 'Getting your location...' : 'Waiting for location...'}
      </div>
    );
  }

  return (
    <MapContainer
      center={position}
      zoom={15}
      scrollWheelZoom={true}
      ref={mapRef}
    >
      <MapController
        center={position}
        onCenterChange={onCenterChange}
        onZoomChange={onZoomChange}
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
  );
}

