'use client';

import { useState, useRef, useEffect } from 'react';
import { locationApi, LocationSuggestion } from '../api/locationApi';

interface LocationDropdownProps {
  value: string;
  onChange: (value: string, nodeId?: number) => void;
  placeholder?: string;
  icon?: 'origin' | 'destination';
  onClear?: () => void;
  buildingId?: number;
  mapIds?: number[];
}

export function LocationDropdown({
  value,
  onChange,
  placeholder = 'Search location...',
  icon = 'origin',
  onClear,
  buildingId,
  mapIds,
}: LocationDropdownProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [allLocations, setAllLocations] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load locations based on building or mapIds
  useEffect(() => {
    const loadLocations = async () => {
      setLoading(true);
      try {
        let locations: LocationSuggestion[] = [];
        
        if (mapIds && mapIds.length > 0) {
          // Load from multiple maps
          const allResults = await Promise.all(
            mapIds.map(id => locationApi.getAll(id))
          );
          locations = allResults.flat();
        } else if (buildingId) {
          // Load all locations - backend should handle filtering
          locations = await locationApi.getAll();
        } else {
          locations = await locationApi.getAll();
        }
        
        setAllLocations(locations);
        setSuggestions(locations);
        // if (locations.length > 0) {
        //   setIsOpen(true);
        // }
      } catch (error) {
        console.error('Error loading locations:', error);
      } finally {
        setLoading(false);
      }
    };
    loadLocations();
  }, [buildingId, mapIds?.join(',')]);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter locations based on query
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(allLocations);
    } else {
      const q = query.toLowerCase().trim();
      const filtered = allLocations.filter(loc => 
        loc.name.toLowerCase().includes(q) ||
        (loc.node_type && loc.node_type.toLowerCase().includes(q))
      );
      setSuggestions(filtered.slice(0, 10)); // Limit to 10 results
    }
    setSelectedIndex(-1);
  }, [query, allLocations]);

  const handleSelect = (suggestion: LocationSuggestion) => {
    setQuery(suggestion.name);
    onChange(suggestion.name, suggestion.node_id);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions(allLocations);
    onChange('');
    onClear?.();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const getFloorLabel = (loc: LocationSuggestion) => {
    if (loc.floor !== null && loc.floor !== undefined) {
      return `Tầng ${loc.floor}`;
    }
    if (loc.map_id === 1) {
      return 'Campus';
    }
    return '';
  };

  const getIcon = (loc: LocationSuggestion) => {
    switch (loc.node_type) {
      case 'entrance': return 'door_front';
      case 'stairs': return 'stairs';
      case 'elevator': return 'elevator';
      case 'room': return 'meeting_room';
      default: return icon === 'origin' ? 'trip_origin' : 'place';
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div className="flex w-full flex-1 items-stretch rounded-lg h-12 border border-gray-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200">
        <div
          className={`flex items-center justify-center pl-4 rounded-l-lg ${
            icon === 'origin' ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600'
          }`}
        >
          <span className="material-symbols-outlined">
            {icon === 'origin' ? 'my_location' : 'location_on'}
          </span>
        </div>
        <input
          ref={inputRef}
          type="text"
          className="flex w-full min-w-0 flex-1 resize-none overflow-hidden text-gray-900 focus:outline-0 border-none bg-white h-full placeholder:text-gray-400 px-4 text-base font-normal"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSuggestions(allLocations); // Show all locations when focused
          }}
          onKeyDown={handleKeyDown}
        />
        {(query || value) && (
          <div className="flex items-center justify-center pr-2">
            <button
              onClick={handleClear}
              className="flex items-center justify-center bg-transparent text-gray-400 hover:text-gray-600 p-1"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-[100] w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-3 text-gray-500 text-sm flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin text-sm">sync</span>
              Loading...
            </div>
          ) : suggestions.length > 0 ? (
            <ul>
              {suggestions.map((loc, index) => {
                const floorLabel = getFloorLabel(loc);
                return (
                  <li
                    key={`loc-${loc.map_id}-${loc.node_id}-${index}`}
                    className={`px-4 py-3 cursor-pointer flex items-center justify-between ${
                      index === selectedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelect(loc)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-gray-400">
                        {getIcon(loc)}
                      </span>
                      <div className="flex flex-col">
                        <span className="text-gray-900 text-sm font-medium">{loc.name}</span>
                        {floorLabel && (
                          <span className="text-xs text-gray-500">{floorLabel}</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-3 text-gray-500 text-sm">
              No locations found
            </div>
          )}
        </div>
      )}
    </div>
  );
}
