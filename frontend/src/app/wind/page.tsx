'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.hackandbuild.dev';

// Wind visualization configuration
const PARTICLE_COUNT = 6000;
const PARTICLE_LINE_WIDTH = 2.5;
const SPEED_FACTOR = 0.00012;
const PARTICLE_MAX_AGE = 80;
const FADE_OPACITY = 0.92; // Higher = longer trails

// Color scale for wind speed (m/s)
const WIND_COLORS = [
  { speed: 0, color: [98, 182, 239] },
  { speed: 3, color: [127, 205, 187] },
  { speed: 6, color: [161, 217, 155] },
  { speed: 9, color: [255, 255, 153] },
  { speed: 12, color: [255, 204, 102] },
  { speed: 15, color: [255, 153, 51] },
  { speed: 18, color: [255, 102, 51] },
  { speed: 21, color: [255, 51, 51] },
  { speed: 25, color: [204, 0, 102] },
];

function getWindColor(speed: number): string {
  for (let i = WIND_COLORS.length - 1; i >= 0; i--) {
    if (speed >= WIND_COLORS[i].speed) {
      const [r, g, b] = WIND_COLORS[i].color;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return 'rgb(98, 182, 239)';
}

interface WindData {
  lon: number[];
  lat: number[];
  u: number[][];
  v: number[][];
  speed: number[][];
  meta: {
    min_speed: number;
    max_speed: number;
    mean_speed: number;
  };
  run_date: string;
  run_hour: string;
  forecast_hour: number;
  valid_time: string;
}

interface WindMeta {
  available_runs: Array<{
    run_date: string;
    run_hour: string;
    forecast_hours: number[];
  }>;
  latest_run: {
    run_date: string;
    run_hour: string;
    forecast_hours: number[];
  } | null;
}

export default function WindPage() {
  const mapRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Array<{ x: number; y: number; age: number; maxAge: number }>>([]);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const windDataRef = useRef<WindData | null>(null);

  const [windData, setWindData] = useState<WindData | null>(null);
  const [windMeta, setWindMeta] = useState<WindMeta | null>(null);
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch metadata
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch(`${API_URL}/api/wind/meta`);
        const data = await res.json();
        setWindMeta(data);
        if (data.latest_run?.forecast_hours?.length > 0) {
          setSelectedHour(data.latest_run.forecast_hours[0]);
        }
      } catch (err) {
        console.error('Failed to fetch wind metadata:', err);
      }
    };
    fetchMeta();
  }, []);

  // Fetch wind data when hour changes
  useEffect(() => {
    const fetchWind = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/wind/latest?forecast_hour=${selectedHour}`);
        const data = await res.json();
        setWindData(data);
        windDataRef.current = data;
      } catch (err) {
        console.error('Failed to fetch wind data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchWind();
  }, [selectedHour]);

  // Auto-play
  useEffect(() => {
    if (isPlaying && windMeta?.latest_run?.forecast_hours) {
      const hours = windMeta.latest_run.forecast_hours;
      playIntervalRef.current = setInterval(() => {
        setSelectedHour(prev => {
          const idx = hours.indexOf(prev);
          return hours[(idx + 1) % hours.length];
        });
      }, 3000);
    } else if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [isPlaying, windMeta]);

  // Initialize map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapRef.current) return;

    const initMap = async () => {
      const L = (await import('leaflet')).default;
      // CSS is imported globally in layout or via link tag

      // Center on Sri Lanka with zoom that shows the full wind data area (4-12°N, 78-84°E)
      const map = L.map(mapContainerRef.current!, {
        center: [8.0, 81.0],
        zoom: 6,
        zoomControl: false,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(map);

      L.control.zoom({ position: 'topright' }).addTo(map);

      mapRef.current = map;

      // Create canvas overlay - full screen
      const canvas = document.createElement('canvas');
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '400';
      mapContainerRef.current!.appendChild(canvas);
      canvasRef.current = canvas;

      const resizeCanvas = () => {
        if (canvas && mapContainerRef.current) {
          const rect = mapContainerRef.current.getBoundingClientRect();
          canvas.width = rect.width;
          canvas.height = rect.height;
        }
      };
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      map.on('resize', resizeCanvas);
      map.on('move', resizeCanvas);
      map.on('zoom', resizeCanvas);

      setMapLoaded(true);

      return () => {
        window.removeEventListener('resize', resizeCanvas);
      };
    };

    initMap();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Interpolate wind at a point
  const interpolateWind = useCallback((lon: number, lat: number): { u: number; v: number; speed: number } | null => {
    const data = windDataRef.current;
    if (!data) return null;

    const { lon: lons, lat: lats, u, v, speed } = data;

    let i0 = -1, j0 = -1;
    for (let i = 0; i < lons.length - 1; i++) {
      if (lon >= lons[i] && lon <= lons[i + 1]) { i0 = i; break; }
    }
    for (let j = 0; j < lats.length - 1; j++) {
      if (lat >= lats[j] && lat <= lats[j + 1]) { j0 = j; break; }
    }

    if (i0 < 0 || j0 < 0) return null;

    const tx = (lon - lons[i0]) / (lons[i0 + 1] - lons[i0]);
    const ty = (lat - lats[j0]) / (lats[j0 + 1] - lats[j0]);

    const interp = (arr: number[][]) => {
      const v00 = arr[j0][i0], v10 = arr[j0][i0 + 1];
      const v01 = arr[j0 + 1][i0], v11 = arr[j0 + 1][i0 + 1];
      return (1 - tx) * (1 - ty) * v00 + tx * (1 - ty) * v10 +
             (1 - tx) * ty * v01 + tx * ty * v11;
    };

    return { u: interp(u), v: interp(v), speed: interp(speed) };
  }, []);

  // Animation loop
  useEffect(() => {
    if (!mapRef.current || !canvasRef.current || !windData || !mapLoaded) return;

    const map = mapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Wind data bounds from API
    const dataBounds = {
      lonMin: Math.min(...windData.lon),
      lonMax: Math.max(...windData.lon),
      latMin: Math.min(...windData.lat),
      latMax: Math.max(...windData.lat),
    };

    // Get current visible map bounds and expand particle area
    const getVisibleBounds = () => {
      const mapBounds = map.getBounds();
      return {
        lonMin: Math.max(dataBounds.lonMin, mapBounds.getWest()),
        lonMax: Math.min(dataBounds.lonMax, mapBounds.getEast()),
        latMin: Math.max(dataBounds.latMin, mapBounds.getSouth()),
        latMax: Math.min(dataBounds.latMax, mapBounds.getNorth()),
      };
    };

    // Initialize particles across the visible map area (within data bounds)
    const initParticles = () => {
      particlesRef.current = [];
      const visibleBounds = getVisibleBounds();

      // If visible area doesn't overlap with data, use data bounds
      const bounds = (visibleBounds.lonMax > visibleBounds.lonMin && visibleBounds.latMax > visibleBounds.latMin)
        ? visibleBounds
        : dataBounds;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particlesRef.current.push({
          x: bounds.lonMin + Math.random() * (bounds.lonMax - bounds.lonMin),
          y: bounds.latMin + Math.random() * (bounds.latMax - bounds.latMin),
          age: Math.floor(Math.random() * PARTICLE_MAX_AGE),
          maxAge: PARTICLE_MAX_AGE + Math.floor(Math.random() * 40),
        });
      }
    };
    initParticles();

    // Re-init particles when map moves
    map.on('moveend', initParticles);

    const project = (lon: number, lat: number) => {
      const point = map.latLngToContainerPoint([lat, lon]);
      return { x: point.x, y: point.y };
    };

    const animate = () => {
      const { width, height } = canvas;

      // Fade trails - use destination-out for smooth fading
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${1 - FADE_OPACITY})`;
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';

      const particles = particlesRef.current;
      const currentBounds = getVisibleBounds();
      const resetBounds = (currentBounds.lonMax > currentBounds.lonMin && currentBounds.latMax > currentBounds.latMin)
        ? currentBounds
        : dataBounds;

      for (const p of particles) {
        // Reset particles that go out of data bounds or age out
        if (p.x < dataBounds.lonMin || p.x > dataBounds.lonMax ||
            p.y < dataBounds.latMin || p.y > dataBounds.latMax || p.age > p.maxAge) {
          p.x = resetBounds.lonMin + Math.random() * (resetBounds.lonMax - resetBounds.lonMin);
          p.y = resetBounds.latMin + Math.random() * (resetBounds.latMax - resetBounds.latMin);
          p.age = 0;
          continue;
        }

        const wind = interpolateWind(p.x, p.y);
        if (!wind) { p.age++; continue; }

        const pos = project(p.x, p.y);

        // Skip if outside visible canvas
        if (pos.x < -50 || pos.x > width + 50 || pos.y < -50 || pos.y > height + 50) {
          p.age++;
          continue;
        }

        const newX = p.x + wind.u * SPEED_FACTOR;
        const newY = p.y + wind.v * SPEED_FACTOR;
        const newPos = project(newX, newY);

        // Calculate alpha based on age - particles are brighter when young
        const ageRatio = p.age / p.maxAge;
        const alpha = Math.max(0.3, 1 - ageRatio * 0.7);
        const color = getWindColor(wind.speed);

        // Draw particle trail
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(newPos.x, newPos.y);

        // Thicker lines for stronger winds
        const lineWidth = PARTICLE_LINE_WIDTH + (wind.speed / 10);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
        ctx.lineCap = 'round';
        ctx.stroke();

        p.x = newX;
        p.y = newY;
        p.age++;
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleMoveStart = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    map.on('movestart', handleMoveStart);

    return () => {
      map.off('movestart', handleMoveStart);
      map.off('moveend', initParticles);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [windData, interpolateWind, mapLoaded]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  };

  return (
    <div className="h-[calc(100vh-64px)] relative bg-slate-900">
      {/* Map Container */}
      <div ref={mapContainerRef} className="absolute inset-0" style={{ zIndex: 1 }} />

      {/* Controls Panel */}
      <div className="absolute top-4 left-4 z-[1000]">
        <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl shadow-lg p-4 border border-slate-700/50 w-72">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-semibold text-sm">Wind Visualization</h1>
              <p className="text-slate-400 text-xs">GFS 10m Wind - Sri Lanka</p>
            </div>
          </div>

          {/* Time Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Forecast Hour</span>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  isPlaying ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'
                }`}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
            </div>

            <select
              value={selectedHour}
              onChange={(e) => setSelectedHour(Number(e.target.value))}
              className="w-full bg-slate-700 text-white text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              {windMeta?.latest_run?.forecast_hours?.map((h) => (
                <option key={h} value={h}>+{h}h {h === 0 ? '(Analysis)' : 'Forecast'}</option>
              ))}
            </select>

            {windMeta?.latest_run?.forecast_hours && (
              <input
                type="range"
                min={0}
                max={windMeta.latest_run.forecast_hours.length - 1}
                value={windMeta.latest_run.forecast_hours.indexOf(selectedHour)}
                onChange={(e) => setSelectedHour(windMeta.latest_run!.forecast_hours[Number(e.target.value)])}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            )}

            {windData?.valid_time && (
              <div className="text-center">
                <span className="text-xs text-cyan-400 font-medium">
                  {formatTime(windData.valid_time)}
                </span>
              </div>
            )}
          </div>

          {/* Stats */}
          {windData?.meta && (
            <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-cyan-400 font-bold text-sm">{windData.meta.min_speed.toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">Min m/s</div>
              </div>
              <div>
                <div className="text-yellow-400 font-bold text-sm">{windData.meta.mean_speed.toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">Avg m/s</div>
              </div>
              <div>
                <div className="text-red-400 font-bold text-sm">{windData.meta.max_speed.toFixed(1)}</div>
                <div className="text-[10px] text-slate-500">Max m/s</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-8 left-4 z-[1000]">
        <div className="bg-slate-800/95 backdrop-blur-sm rounded-xl p-3 border border-slate-700/50">
          <div className="text-xs text-slate-400 font-medium mb-2">Wind Speed (m/s)</div>
          <div className="flex gap-1">
            {WIND_COLORS.map((item, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="w-5 h-5 rounded"
                  style={{ backgroundColor: `rgb(${item.color.join(',')})` }}
                />
                <span className="text-[9px] text-slate-500 mt-1">{item.speed}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Model Info */}
      {windMeta?.latest_run && (
        <div className="absolute bottom-8 right-4 z-[1000]">
          <div className="bg-slate-800/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-slate-700/50">
            <span className="text-[10px] text-slate-400">
              GFS {windMeta.latest_run.run_date} {windMeta.latest_run.run_hour}Z
            </span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center z-[2000]">
          <div className="bg-slate-800 rounded-xl p-6 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-cyan-200 border-t-cyan-500 rounded-full animate-spin" />
            <span className="text-sm text-slate-300">Loading wind data...</span>
          </div>
        </div>
      )}
    </div>
  );
}
