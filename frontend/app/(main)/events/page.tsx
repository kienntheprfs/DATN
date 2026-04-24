'use client';

import { useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, Users, Plus, Search, Edit, Trash2, ExternalLink, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Item, ItemGroup, ItemContent, ItemTitle, ItemDescription, ItemActions } from '@/components/ui/item';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText} from '@/components/ui/input-group';
import { eventsApi } from '@/services/events-api';
import { locationApi } from '@/services/location-api';
import { Event, EventCreate } from '@/types';
import { LocationSuggestion } from '@/types/wayfinding';
import { toast } from 'sonner';

const CATEGORIES = [
  { value: '', label: 'Tất cả' },
  { value: 'seminar', label: 'Hội thảo' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'conference', label: 'Hội nghị' },
  { value: 'meeting', label: 'Họp' },
  { value: 'other', label: 'Khác' },
];

function NodeSelector({
  value: _value,
  onChange,
}: {
  value: number | undefined;
  onChange: (nodeId: number | undefined) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationSuggestion | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (_value && !selectedLocation) {
      loadLocationById(_value);
    }
  }, [_value]);

  const loadLocationById = async (nodeId: number) => {
    try {
      const data = await locationApi.getAll();
      const found = data.find(loc => loc.node_id === nodeId);
      if (found) {
        setSelectedLocation(found);
      }
    } catch (error) {
      console.error('Failed to load location:', error);
    }
  };

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
    if (isOpen && results.length === 0) {
      loadAllLocations();
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.length >= 1) {
      searchLocations(query);
    } else if (isOpen) {
      loadAllLocations();
    }
  }, [query]);

  const loadAllLocations = async () => {
    setLoading(true);
    try {
      const data = await locationApi.getAll();
      setResults(data);
    } catch (error) {
      console.error('Failed to load locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchLocations = async (q: string) => {
    setLoading(true);
    try {
      const data = await locationApi.search(q, 20);
      setResults(data);
    } catch (error) {
      console.error('Failed to search locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (location: LocationSuggestion) => {
    setSelectedLocation(location);
    onChange(location.node_id);
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedLocation(null);
    onChange(undefined);
    setQuery('');
    setResults([]);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const getDisplayName = (location: LocationSuggestion) => {
    const parts = [location.name];
    if (location.floor !== undefined) parts.push(`Tầng ${location.floor}`);
    return parts.join(' - ');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Label htmlFor="node_selector">Vị trí trên bản đồ</Label>
      <div className="relative mt-1">
        {selectedLocation ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="flex-1 text-sm truncate">{getDisplayName(selectedLocation)}</span>
            <Button type="button" variant="ghost" size="icon" onClick={handleClear} className="h-7 w-7">
              <X className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Input
              ref={inputRef}
              id="node_selector"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder="Gõ để lọc vị trí..."
              className="pr-10"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 py-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Đang tải...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Không tìm thấy vị trí nào
            </div>
          ) : (
            results.map((location) => (
              <Button
                key={`${location.node_id}-${location.alias_id}`}
                type="button"
                variant="ghost"
                className="w-full justify-start h-auto py-2 px-3"
                onClick={() => handleSelect(location)}
              >
                <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0 mr-2" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-medium truncate">{location.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Tầng {location.floor ?? 'G'} {location.node_type && `• ${location.node_type}`}
                  </div>
                </div>
              </Button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<EventCreate>({
    name: '',
    description: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    location_name: '',
    node_id: undefined,
    organizer: '',
    category: '',
  });

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    filterEvents();
  }, [events, searchQuery, selectedCategory]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await eventsApi.listWithLocation(false);
      setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
      toast.error('Không thể tải danh sách sự kiện', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    } finally {
      setLoading(false);
    }
  };

  const filterEvents = () => {
    let filtered = [...events];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.description?.toLowerCase().includes(query) ||
          e.organizer?.toLowerCase().includes(query)
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter((e) => e.category === selectedCategory);
    }

    setFilteredEvents(filtered);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingEvent) {
        await eventsApi.update(editingEvent.id, formData);
      } else {
        await eventsApi.create(formData);
      }
      setIsDialogOpen(false);
      resetForm();
      loadEvents();
    } catch (error) {
      console.error('Failed to save event:', error);
      toast.error('Lỗi khi lưu sự kiện!', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setFormData({
      name: event.name,
      description: event.description || '',
      start_date: event.start_date,
      start_time: event.start_time || '',
      end_date: event.end_date || '',
      end_time: event.end_time || '',
      location_name: event.location_name || '',
      node_id: event.node_id,
      organizer: event.organizer || '',
      category: event.category || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bạn có chắc muốn xóa sự kiện này?')) return;
    try {
      await eventsApi.delete(id);
      loadEvents();
      toast.success('Xóa sự kiện thành công!');
    } catch (error) {
      console.error('Failed to delete event:', error);
      toast.error('Lỗi khi xóa sự kiện!', {
        description: error instanceof Error ? error.message : 'Vui lòng thử lại sau.',
      });
    }
  };

  const resetForm = () => {
    setEditingEvent(null);
    setFormData({
      name: '',
      description: '',
      start_date: '',
      start_time: '',
      end_date: '',
      end_time: '',
      location_name: '',
      node_id: undefined,
      organizer: '',
      category: '',
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (time: string | undefined) => {
    if (!time) return '';
    return time.slice(0, 5);
  };

  const getCategoryLabel = (category: string | undefined) => {
    return CATEGORIES.find((c) => c.value === category)?.label || category || 'Khác';
  };

  const getLocationString = (event: Event) => {
    const parts = [];
    if (event.location_name) parts.push(event.location_name);
    if (event.building_name) parts.push(event.building_name);
    if (event.floor_level !== undefined && event.floor_level !== null) parts.push(`Tầng ${event.floor_level}`);
    return parts.join(' - ') || 'Chưa có địa điểm';
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quản lý Sự kiện</h1>
            <p className="text-sm text-muted-foreground">Tạo và quản lý các sự kiện trong khuôn viên</p>
          </div>
          <Button
            onClick={() => {
              resetForm();
              setIsDialogOpen(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Tạo sự kiện mới
          </Button>
        </div>

        <div className="flex gap-3">
          <InputGroup className="flex-1 h-9">
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <Search className="size-4" />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Tìm kiếm sự kiện..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>
          <Select value={selectedCategory || "all"} onValueChange={(v) => setSelectedCategory(v === "all" ? "" : v)}>
            <SelectTrigger className="h-8 w-auto min-w-35 text-xs">
              <SelectValue placeholder="Tất cả" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {CATEGORIES.slice(1).map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Đang tải...</div>
        ) : filteredEvents.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Không có sự kiện nào</p>
          </div>
        ) : (
          <ItemGroup>
            {filteredEvents.map((event) => (
              <Item key={event.id} variant="outline" className="py-3">
                <ItemContent className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{getCategoryLabel(event.category)}</Badge>
                      {!event.is_active && (
                        <Badge variant="outline">Đã kết thúc</Badge>
                      )}
                    </div>
                    <ItemActions>
                      {event.node_id && (
                        <Button variant="ghost" size="icon" asChild className="h-7 w-7">
                          <a
                            href={`/navigation?event=${event.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(event)} className="h-7 w-7">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(event.id)} className="h-7 w-7 text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </ItemActions>
                  </div>
                  <ItemTitle className="text-base">{event.name}</ItemTitle>
                  {event.description && (
                    <ItemDescription>{event.description}</ItemDescription>
                  )}
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {formatDate(event.start_date)}
                        {event.start_time && ` lúc ${formatTime(event.start_time)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{getLocationString(event)}</span>
                    </div>
                    {event.organizer && (
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>{event.organizer}</span>
                      </div>
                    )}
                  </div>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-125">
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Sửa sự kiện' : 'Tạo sự kiện mới'}</DialogTitle>
            <DialogDescription>
              {editingEvent ? 'Cập nhật thông tin sự kiện.' : 'Điền thông tin để tạo sự kiện mới.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên sự kiện *</Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nhập tên sự kiện"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Mô tả sự kiện..."
                className="min-h-20 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Ngày bắt đầu *</Label>
                <Input
                  id="start_date"
                  required
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="start_time">Giờ bắt đầu</Label>
                <Input
                  id="start_time"
                  type="time"
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="end_date">Ngày kết thúc</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Giờ kết thúc</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>

            <NodeSelector
              value={formData.node_id}
              onChange={(nodeId) => setFormData({ ...formData, node_id: nodeId })}
            />

            <div className="space-y-2">
              <Label htmlFor="location_name">Tên địa điểm</Label>
              <Input
                id="location_name"
                disabled={!!formData.node_id}
                value={formData.location_name}
                onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                placeholder={formData.node_id ? "Đã chọn vị trí từ bản đồ" : "VD: Phòng A1-001"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="organizer">Người tổ chức</Label>
                <Input
                  id="organizer"
                  value={formData.organizer}
                  onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
                  placeholder="Tên đơn vị/Ban tổ chức"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Loại sự kiện</Label>
                <Select value={formData.category || "none"} onValueChange={(value) => setFormData({ ...formData, category: value === "none" ? "" : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn loại" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Chọn loại</SelectItem>
                    {CATEGORIES.slice(1).map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Đang lưu...' : editingEvent ? 'Lưu thay đổi' : 'Tạo sự kiện'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
