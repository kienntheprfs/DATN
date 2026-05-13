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
import { Event, EventCreate } from '@/types';
import { useConfirmStore } from '@/stores/confirm.store';
import { toast } from 'sonner';
import { LocationSearch } from '@/components/features/navigation/LocationSearch';

const CATEGORIES = [
  { value: '', label: 'Tất cả' },
  { value: 'seminar', label: 'Hội thảo' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'conference', label: 'Hội nghị' },
  { value: 'meeting', label: 'Họp' },
  { value: 'other', label: 'Khác' },
];

export default function EventsPage() {
  const confirm = useConfirmStore((state) => state.confirm);
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
      toast.success(editingEvent ? 'Cập nhật sự kiện thành công!' : 'Tạo sự kiện thành công!');
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
    const confirmed = await confirm({
      title: "Xác nhận xóa sự kiện",
      description: "Bạn có chắc muốn xóa sự kiện này?",
      variant: 'destructive'
    });

    if (!confirmed) return;
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
            <SelectTrigger className="h-9 w-auto min-w-35 text-xs">
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
                value={formData.description || ''}
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
                  value={formData.start_time || ''}
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
                  value={formData.end_date || ''}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_time">Giờ kết thúc</Label>
                <Input
                  id="end_time"
                  type="time"
                  value={formData.end_time || ''}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Vị trí trên bản đồ</Label>
              <LocationSearch
                value={formData.location_name}
                selectedNodeId={formData.node_id}
                onChange={(name, nodeId) => setFormData({ 
                  ...formData, 
                  location_name: name || formData.location_name, 
                  node_id: nodeId 
                })}
                placeholder="Tìm vị trí (Phòng, Tòa nhà...)"
                icon="none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location_name">Tên địa điểm hiển thị</Label>
              <Input
                id="location_name"
                value={formData.location_name || ''}
                onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                placeholder="VD: Sảnh A1, Căn tin B..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="organizer">Người tổ chức</Label>
                <Input
                  id="organizer"
                  value={formData.organizer || ''}
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
