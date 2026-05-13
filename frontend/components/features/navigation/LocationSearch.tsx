'use client';

import { useState, useEffect, useRef } from 'react';
import { locationApi } from '@/services/location-api';
import { LocationSuggestion } from '@/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, X, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LocationSearchProps {
  value?: string;
  onChange: (value: string, nodeId?: number) => void;
  placeholder?: string;
  icon?: 'origin' | 'destination' | 'none';
  mapIds?: number[];
  className?: string;
  selectedNodeId?: number;
}

export function LocationSearch({
  value,
  onChange,
  placeholder = 'Tìm kiếm địa điểm...',
  icon = 'origin',
  mapIds,
  className,
  selectedNodeId,
}: LocationSearchProps) {
  const [query, setQuery] = useState(value || '');
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
    if (!isOpen) {
      setQuery(value || '');
    }
  }, [value, isOpen]);

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
    const isExcluded = (loc: LocationSuggestion) => {
      return loc.name === 'New Node' || 
             loc.node_type === 'stairs' || 
             loc.node_type === 'elevator';
    };

    if (!query.trim()) {
      setSuggestions(allLocations.filter(loc => !isExcluded(loc)));
    } else {
      const q = query.toLowerCase().trim();
      const filtered = allLocations.filter(loc => 
        !isExcluded(loc) && (
          loc.name.toLowerCase().includes(q) ||
          (loc.node_type && loc.node_type.toLowerCase().includes(q)) ||
          (loc.building_name && loc.building_name.toLowerCase().includes(q))
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
    onChange('', undefined);
    inputRef.current?.focus();
  };

  const getIcon = (nodeType?: string) => {
    switch (nodeType) {
      case 'entrance': return '🚪';
      case 'stairs': return '🪜';
      case 'elevator': return '🛗';
      case 'room': return '🚪';
      default: return icon === 'origin' ? '📍' : icon === 'destination' ? '🏁' : '📍';
    }
  };

  const selectedLocation = selectedNodeId 
    ? allLocations.find(l => l.node_id === selectedNodeId)
    : null;

  const getDisplayName = (loc: LocationSuggestion) => {
    const parts = [loc.name];
    if (loc.building_name) parts.push(loc.building_name);
    if (loc.floor !== undefined && loc.floor !== null) parts.push(`Tầng ${loc.floor}`);
    return parts.join(' - ');
  };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      <div className="relative">
        {selectedLocation ? (
          <div className="flex items-center gap-2 px-3 h-9 rounded-md border bg-muted/50 text-sm text-left">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="flex-1 truncate font-medium text-left">{getDisplayName(selectedLocation)}</span>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={handleClear} 
              className="h-6 w-6 hover:bg-muted-foreground/10 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <div className="relative flex items-center gap-2">
            {icon !== 'none' && (
              <span className={cn(
                "shrink-0",
                icon === 'origin' ? 'text-muted-foreground' : 'text-primary font-bold'
              )}>
                {icon === 'origin' ? '📍' : '🏁'}
              </span>
            )}
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                className="pr-9 text-left"
                data-testid={icon === 'origin' ? 'start-location-input' : 'end-location-input'}
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-y-auto py-1">
          {suggestions.map((loc, index) => (
            <Button
              key={`${loc.map_id}-${loc.node_id}-${index}`}
              variant="ghost"
              className="w-full justify-start h-auto py-2 px-3 font-normal text-left"
              onClick={() => handleSelect(loc)}
              data-testid="location-suggestion"
            >
              <div className="flex items-center gap-3 w-full text-left">
                <span className="text-base shrink-0">{getIcon(loc.node_type)}</span>
                <div className="flex flex-col items-start min-w-0 text-left">
                  <span className="text-sm font-medium truncate w-full text-left">{loc.name}</span>
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground text-left">
                    {loc.building_name && (
                      <>
                        <span className="shrink-0">{loc.building_name}</span>
                        <span className="shrink-0">•</span>
                      </>
                    )}
                    <span className="shrink-0">{loc.floor !== null && loc.floor !== undefined ? `Tầng ${loc.floor}` : 'Campus'}</span>
                    {loc.node_type && (
                      <>
                        <span className="shrink-0">•</span>
                        <span className="capitalize truncate">{loc.node_type}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
