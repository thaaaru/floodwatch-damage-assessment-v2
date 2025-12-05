'use client';

import { useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import MobileHeader, { AlertBanner } from '@/components/mobile/MobileHeader';
import BottomSheet, { SheetState } from '@/components/mobile/BottomSheet';
import FloatingControls, { PrimaryCTA } from '@/components/mobile/FloatingControls';

// Lazy load map to reduce initial bundle
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-slate-100 animate-pulse" />
});

const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });

// Mock data structures
interface HelpRequest {
  id: number;
  type: 'food' | 'shelter' | 'medical' | 'rescue';
  status: 'open' | 'in_progress' | 'fulfilled';
  location: string;
  district: string;
  urgency: 'critical' | 'high' | 'medium';
  description: string;
  contact: string;
  lat: number;
  lng: number;
  timestamp: string;
}

// Mock data
const mockRequests: HelpRequest[] = [
  {
    id: 1,
    type: 'rescue',
    status: 'open',
    location: 'Kaduwela, Colombo',
    district: 'Colombo',
    urgency: 'critical',
    description: 'Family of 5 trapped on 2nd floor. Water level rising.',
    contact: '+94 77 123 4567',
    lat: 6.9341,
    lng: 79.9838,
    timestamp: '15 mins ago'
  },
  {
    id: 2,
    type: 'food',
    status: 'open',
    location: 'Kelaniya',
    district: 'Gampaha',
    urgency: 'high',
    description: '30 families need food and drinking water. Isolated for 2 days.',
    contact: '+94 71 234 5678',
    lat: 6.9553,
    lng: 79.9209,
    timestamp: '1 hour ago'
  },
  {
    id: 3,
    type: 'medical',
    status: 'in_progress',
    location: 'Hanwella',
    district: 'Colombo',
    urgency: 'critical',
    description: 'Elderly patient needs insulin. Volunteers on the way.',
    contact: '+94 76 345 6789',
    lat: 6.9019,
    lng: 80.0850,
    timestamp: '2 hours ago'
  },
  {
    id: 4,
    type: 'shelter',
    status: 'open',
    location: 'Kolonnawa',
    district: 'Colombo',
    urgency: 'high',
    description: 'School shelter needs blankets and dry clothes for 50 people.',
    contact: '+94 75 456 7890',
    lat: 6.9330,
    lng: 79.8947,
    timestamp: '3 hours ago'
  },
];

export default function ReliefMapDemo() {
  const [sheetState, setSheetState] = useState<SheetState>('collapsed');
  const [selectedRequest, setSelectedRequest] = useState<HelpRequest | null>(null);
  const [showAlert, setShowAlert] = useState(true);
  const [filterType, setFilterType] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return mockRequests.filter(req => {
      if (filterType.length > 0 && !filterType.includes(req.type)) return false;
      if (filterStatus.length > 0 && !filterStatus.includes(req.status)) return false;
      return true;
    });
  }, [filterType, filterStatus]);

  // Count by urgency for summary
  const urgencyCounts = useMemo(() => {
    return filteredRequests.reduce((acc, req) => {
      acc[req.urgency] = (acc[req.urgency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [filteredRequests]);

  // Handle marker click
  const handleMarkerClick = useCallback((request: HelpRequest) => {
    setSelectedRequest(request);
    setSheetState('full');
  }, []);

  // Handle request help action
  const handleRequestHelp = useCallback(() => {
    alert('Request Help Form would open here');
  }, []);

  // Get marker color by urgency
  const getMarkerColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return '#DC2626'; // Red
      case 'high': return '#EA580C'; // Orange
      case 'medium': return '#EAB308'; // Yellow
      default: return '#10B981'; // Green
    }
  };

  // Get type icon
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'rescue': return '🚨';
      case 'food': return '🍲';
      case 'medical': return '💊';
      case 'shelter': return '🏠';
      default: return '❓';
    }
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    const styles = {
      open: 'bg-red-100 text-red-700 border-red-300',
      in_progress: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      fulfilled: 'bg-green-100 text-green-700 border-green-300',
    };
    return styles[status as keyof typeof styles] || styles.open;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      {/* Mobile Header */}
      <MobileHeader
        title="Flood Relief Map"
        subtitle="Sri Lanka"
        onMenuClick={() => alert('Menu')}
        onNotificationClick={() => alert('Notifications')}
        onProfileClick={() => alert('Profile')}
        notificationCount={3}
      />

      {/* Alert Banner */}
      {showAlert && (
        <AlertBanner
          type="warning"
          message="Heavy rainfall expected in Colombo & Gampaha districts"
          action={{ label: 'View Alert', onClick: () => alert('Alert details') }}
          onDismiss={() => setShowAlert(false)}
        />
      )}

      {/* Map Container */}
      <div className="flex-1 relative">
        <MapContainer
          center={[6.9271, 79.9612]}
          zoom={11}
          className="w-full h-full"
          scrollWheelZoom={true}
          style={{ zIndex: 10 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Markers */}
          {filteredRequests.map((request) => (
            <Marker
              key={request.id}
              position={[request.lat, request.lng]}
              eventHandlers={{
                click: () => handleMarkerClick(request)
              }}
            >
              <Popup>
                <div className="p-2">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="text-2xl">{getTypeIcon(request.type)}</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm">{request.location}</h3>
                      <p className="text-xs text-gray-600">{request.district}</p>
                    </div>
                  </div>
                  <p className="text-xs mb-2">{request.description}</p>
                  <button
                    onClick={() => handleMarkerClick(request)}
                    className="text-xs font-bold text-blue-600"
                  >
                    View Details →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Floating Controls */}
        <FloatingControls
          onLocate={() => alert('Locating...')}
          onLayers={() => alert('Layers')}
          showLocate={true}
          showLayers={true}
        />
      </div>

      {/* Bottom Sheet */}
      <BottomSheet
        state={sheetState}
        onStateChange={setSheetState}
        collapsedHeight={72}
        halfHeight="60vh"
        fullHeight="90vh"
        handleContent={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-bold text-sm text-slate-900">
                {urgencyCounts.critical || 0} Critical · {filteredRequests.length} Total Requests
              </span>
            </div>
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </div>
        }
      >
        {/* Sheet Content */}
        {sheetState === 'collapsed' && (
          <div className="p-4">
            <p className="text-sm text-slate-600">Swipe up to view requests</p>
          </div>
        )}

        {sheetState === 'half' && (
          <div className="px-4 pb-20">
            {/* Filters */}
            <div className="mb-4">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {['rescue', 'food', 'medical', 'shelter'].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(prev =>
                      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
                    )}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      filterType.includes(type)
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {getTypeIcon(type)} {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Request List */}
            <div className="space-y-3">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  onClick={() => handleMarkerClick(request)}
                  className="bg-white rounded-lg p-4 border border-slate-200 active:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-3 mb-2">
                    <span className="text-2xl flex-shrink-0">{getTypeIcon(request.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-sm truncate">{request.location}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getStatusBadge(request.status)}`}>
                          {request.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2">{request.description}</p>
                      <p className="text-xs text-slate-500 mt-1">{request.timestamp}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {sheetState === 'full' && selectedRequest && (
          <div className="px-4 pb-24">
            {/* Back Button */}
            <button
              onClick={() => setSheetState('half')}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to List
            </button>

            {/* Request Details */}
            <div className="bg-white rounded-xl p-6 border border-slate-200">
              <div className="flex items-start gap-4 mb-4">
                <span className="text-4xl">{getTypeIcon(selectedRequest.type)}</span>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-slate-900 mb-1">{selectedRequest.location}</h2>
                  <p className="text-sm text-slate-600">{selectedRequest.district} District</p>
                </div>
              </div>

              {/* Status & Urgency */}
              <div className="flex gap-2 mb-4">
                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold border ${getStatusBadge(selectedRequest.status)}`}>
                  {selectedRequest.status.replace('_', ' ').toUpperCase()}
                </span>
                <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                  selectedRequest.urgency === 'critical' ? 'bg-red-100 text-red-700' :
                  selectedRequest.urgency === 'high' ? 'bg-orange-100 text-orange-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {selectedRequest.urgency.toUpperCase()}
                </span>
              </div>

              {/* Description */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">Description</h3>
                <p className="text-sm text-slate-600">{selectedRequest.description}</p>
              </div>

              {/* Contact */}
              <div className="mb-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">Contact</h3>
                <a href={`tel:${selectedRequest.contact}`} className="text-sm text-brand-600 font-medium">
                  {selectedRequest.contact}
                </a>
              </div>

              {/* Timestamp */}
              <p className="text-xs text-slate-500">Reported {selectedRequest.timestamp}</p>
            </div>

            {/* Primary Action */}
            <div className="mt-6">
              <button
                onClick={() => alert('Offer Support')}
                className="w-full h-14 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Offer Support
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Primary CTA - Only show when sheet is collapsed */}
      {sheetState === 'collapsed' && (
        <PrimaryCTA
          label="Request Help"
          onClick={handleRequestHelp}
          variant="danger"
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      )}
    </div>
  );
}
