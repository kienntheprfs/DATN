import { apiClient } from './auth-api';

export interface AuditLog {
  id: string;
  admin_id: string;
  admin_email: string;
  action: string;
  service: string;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditLogResponse {
  logs: AuditLog[];
  total: number;
}

export interface AuditLogFilters {
  admin_id?: string;
  service?: string;
  action?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

export const auditService = {
  getLogs: async (filters: AuditLogFilters = {}): Promise<AuditLogResponse> => {
    const params = new URLSearchParams();
    
    if (filters.admin_id && filters.admin_id.trim()) params.append('admin_id', filters.admin_id);
    if (filters.service && filters.service.trim()) params.append('service', filters.service);
    if (filters.action && filters.action.trim()) params.append('action', filters.action);
    if (filters.from_date) params.append('from_date', filters.from_date);
    if (filters.to_date) params.append('to_date', filters.to_date);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const response = await apiClient.get<AuditLogResponse>(`/audit?${params.toString()}`);
    return response.data;
  },
};

export default auditService;
