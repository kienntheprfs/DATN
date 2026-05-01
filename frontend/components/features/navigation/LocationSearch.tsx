'use client';

import { useState, useEffect, useRef } from 'react';
import { locationApi } from '@/services/location-api';
import { LocationSuggestion } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

interface LocationSearchProps {
  value: string;
  onChange: (value: string, nodeId?: number) => void;
  placeholder?: string;
  icon?: 'origin' | 'destination';
  mapIds?: number[];
}

export function LocationSearch({
  value,
  onChange,
  placeholder = 'Search location...',
  icon = 'origin',
  mapIds,
}: LocationSearchProps) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [allLocations, setAllLocations] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadLocations = async () => {
      setLoading(true);
      try {
        const locations = await locationApi.getAll();
        setAllLocations(locations);
        setSuggestions(locations);
      } catch (error) {
        console.error('Error loading locations:', error);
      } finally {
        setLoading(false);
      }
    };
    loadLocations();
  }, []);

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

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions(allLocations.filter(loc => loc.name !== 'New Node'));
    } else {
      const q = query.toLowerCase().trim();
      const filtered = allLocations.filter(loc => 
        loc.name !== 'New Node' && (
          loc.name.toLowerCase().includes(q) ||
          (loc.node_type && loc.node_type.toLowerCase().includes(q))
        )
      );
      setSuggestions(filtered.slice(0, 10));
    }
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
    inputRef.current?.focus();
  };

  const getIcon = (nodeType?: string) => {
    switch (nodeType) {
      case 'entrance': return '🚪';
      case 'stairs': return '🪜';
      case 'elevator': return '🛗';
      case 'room': return '🚪';
      default: return icon === 'origin' ? '📍' : '🏁';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-2">
        <span className={`shrink-0 ${icon === 'origin' ? 'text-muted-foreground' : 'text-blue-600'}`}>
          {icon === 'origin' ? '📍' : '🏁'}
        </span>
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="flex-1"
        />
        {(query || value) && (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 size-7"
            onClick={handleClear}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((loc, index) => (
            <div
              key={`${loc.map_id}-${loc.node_id}-${index}`}
              className="px-3 py-2 cursor-pointer hover:bg-muted"
              onClick={() => handleSelect(loc)}
            >
              <div className="flex items-center gap-2">
                <span>{getIcon(loc.node_type)}</span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{loc.name}</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {loc.building_name && (
                      <>
                        <span>{loc.building_name}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{loc.floor !== null && loc.floor !== undefined ? `Tầng ${loc.floor}` : 'Campus'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
