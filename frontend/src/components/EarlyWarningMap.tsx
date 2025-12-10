// SPDX-License-Identifier: Apache-2.0

'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { EarlyWarningDistrict } from '@/lib/api';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface EarlyWarningMapProps {
  districts: EarlyWarningDistrict[];
  onDistrictSelect?: (district: string) => void;
  selectedDistrict?: string | null;
  shouldZoom?: boolean;
}

function MapController({ selectedDistrict, districts, shouldZoom }: { selectedDistrict?: string | null; districts: EarlyWarningDistrict[]; shouldZoom?: boolean }) {
  const map = useMap();

  useEffect(() => {
    // Only zoom if explicitly requested (user clicked on a district)
    if (selectedDistrict && shouldZoom) {
      const district = districts.find(d => d.district === selectedDistrict);
      if (district && district.coordinates) {
        map.flyTo([district.coordinates.lat, district.coordinates.lon], 10, {
          duration: 0.5
        });
      }
    }
  }, [map, selectedDistrict, districts, shouldZoom]);

  return null;
}

const getRiskColor = (risk: string) => {
  switch (risk) {
    case 'extreme':
      return '#9333ea'; // purple-600
    case 'high':
      return '#dc2626'; // red-600
    case 'medium':
      return '#f97316'; // orange-500
    case 'low':
      return '#22c55e'; // green-500
    default:
      return '#9ca3af'; // gray-400
  }
};

const getRiskRadius = (risk: string) => {
  switch (risk) {
    case 'extreme':
      return 18;
    case 'high':
      return 16;
    case 'medium':
      return 14;
    case 'low':
      return 12;
    default:
      return 10;
  }
};

const getWeatherIcon = (iconCode: string) => {
  return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
};

export default function EarlyWarningMap({ districts, onDistrictSelect, selectedDistrict, shouldZoom = false }: EarlyWarningMapProps) {
  const sriLankaCenter: [number, number] = [7.8731, 80.7718];

  return (
    <div className="relative h-full w-full rounded-lg overflow-hidden">
      {/* Legend */}
      <div className="absolute top-2 right-2 z-[1000] bg-white/95 backdrop-blur rounded-lg shadow-lg p-3">
        <div className="text-xs font-semibold text-gray-700 mb-2">Risk Level</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#9333ea' }}></div>
            <span className="text-xs text-gray-600">Extreme</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#dc2626' }}></div>
            <span className="text-xs text-gray-600">High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#f97316' }}></div>
            <span className="text-xs text-gray-600">Medium</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#22c55e' }}></div>
            <span className="text-xs text-gray-600">Low</span>
          </div>
        </div>
      </div>

      <MapContainer
        center={sriLankaCenter}
        zoom={8}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <MapController selectedDistrict={selectedDistrict} districts={districts} shouldZoom={shouldZoom} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {districts.map((district) => {
          if (!district.coordinates || district.error) return null;

          const isSelected = selectedDistrict === district.district;

          return (
            <CircleMarker
              key={district.district}
              center={[district.coordinates.lat, district.coordinates.lon]}
              radius={getRiskRadius(district.risk_level)}
              pathOptions={{
                fillColor: getRiskColor(district.risk_level),
                color: isSelected ? '#1e40af' : '#fff',
                weight: isSelected ? 3 : 2,
                opacity: 1,
                fillOpacity: 0.85,
              }}
              eventHandlers={{
                click: () => onDistrictSelect?.(district.district),
              }}
            >
              <Popup maxWidth={350} minWidth={300}>
                <div className="p-1">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <h3 className="font-bold text-base">{district.district}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-bold text-white ${
                      district.risk_level === 'extreme' ? 'bg-purple-600' :
                      district.risk_level === 'high' ? 'bg-red-600' :
                      district.risk_level === 'medium' ? 'bg-orange-500' :
                      'bg-green-500'
                    }`}>
                      {district.risk_level.toUpperCase()}
                    </span>
                  </div>

                  {/* Current Weather */}
                  <div className="flex items-center gap-3 mb-3">
                    {district.current.weather_icon && (
                      <img
                        src={getWeatherIcon(district.current.weather_icon)}
                        alt={district.current.weather}
                        className="w-12 h-12"
                      />
                    )}
                    <div>
                      <div className="text-2xl font-bold">{district.current.temp_c?.toFixed(0)}°C</div>
                      <div className="text-sm text-gray-600 capitalize">{district.current.weather}</div>
                    </div>
                  </div>

                  {/* Precipitation */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-blue-50 p-2 rounded text-center">
                      <div className="text-xs text-gray-500">1h</div>
                      <div className="font-bold text-blue-600">{district.precipitation.next_1h_mm.toFixed(1)}mm</div>
                    </div>
                    <div className="bg-blue-50 p-2 rounded text-center">
                      <div className="text-xs text-gray-500">24h</div>
                      <div className="font-bold text-blue-600">{district.precipitation.next_24h_mm.toFixed(1)}mm</div>
                    </div>
                    <div className="bg-blue-50 p-2 rounded text-center">
                      <div className="text-xs text-gray-500">48h</div>
                      <div className="font-bold text-blue-600">{district.precipitation.next_48h_mm.toFixed(1)}mm</div>
                    </div>
                  </div>

                  {/* Conditions */}
                  <div className="grid grid-cols-4 gap-1 text-xs mb-3">
                    <div className="bg-gray-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">Humidity</div>
                      <div className="font-semibold">{district.current.humidity}%</div>
                    </div>
                    <div className="bg-gray-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">Wind</div>
                      <div className="font-semibold">{district.current.wind_speed_ms ? (district.current.wind_speed_ms * 3.6).toFixed(0) : '-'} km/h</div>
                    </div>
                    <div className="bg-gray-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">Clouds</div>
                      <div className="font-semibold">{district.current.clouds}%</div>
                    </div>
                    <div className="bg-gray-50 p-1.5 rounded text-center">
                      <div className="text-gray-500">UV</div>
                      <div className="font-semibold">{district.current.uvi?.toFixed(0) || '-'}</div>
                    </div>
                  </div>

                  {/* Risk Factors */}
                  {district.risk_factors.length > 0 && (
                    <div className="mb-3">
                      <div className="text-xs font-semibold text-gray-600 mb-1">Risk Factors</div>
                      <div className="flex flex-wrap gap-1">
                        {district.risk_factors.map((factor, idx) => (
                          <span
                            key={idx}
                            className={`text-xs px-2 py-0.5 rounded ${
                              factor.severity === 'high' ? 'bg-red-100 text-red-700' :
                              factor.severity === 'medium' ? 'bg-orange-100 text-orange-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}
                          >
                            {factor.factor}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Alerts */}
                  {district.alerts.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded p-2">
                      <div className="text-xs font-semibold text-red-700 mb-1">
                        {district.alerts.length} Active Alert{district.alerts.length > 1 ? 's' : ''}
                      </div>
                      <div className="text-xs text-red-600">
                        {district.alerts[0].event}
                      </div>
                    </div>
                  )}

                  {/* 5-Day Forecast Preview */}
                  <div className="mt-3 pt-2 border-t">
                    <div className="text-xs font-semibold text-gray-600 mb-2">8-Day Forecast</div>
                    <div className="flex gap-1 overflow-x-auto">
                      {district.daily_forecast.slice(0, 8).map((day, idx) => (
                        <div
                          key={idx}
                          className={`flex-shrink-0 w-10 text-center p-1 rounded text-xs ${
                            day.alert_level === 'red' ? 'bg-red-100' :
                            day.alert_level === 'orange' ? 'bg-orange-100' :
                            day.alert_level === 'yellow' ? 'bg-yellow-100' :
                            'bg-green-100'
                          }`}
                        >
                          <div className="font-medium">{day.day_name.slice(0, 2)}</div>
                          {day.weather_icon && (
                            <img
                              src={getWeatherIcon(day.weather_icon)}
                              alt=""
                              className="w-6 h-6 mx-auto"
                            />
                          )}
                          <div className="text-blue-600 font-semibold">{day.rain_mm.toFixed(0)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
