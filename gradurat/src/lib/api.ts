const apiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const apiRequest = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result as T;
};

export type Student = { id: string; full_name: string; email: string; skills?: string[]; qualification?: string; location?: string };
export type Employer = { id: string; company_name: string; email: string; industry?: string; location?: string };
export type Opportunity = { id: string; title: string; description?: string; type?: string; required_skills?: string[]; match_score?: number; reasoning?: string; employers?: { company_name?: string } };

export const createStudent = (payload: Record<string, unknown>) => apiRequest<{ student: Student }>('/api/students', { method: 'POST', body: JSON.stringify(payload) });
export const createEmployer = (payload: Record<string, unknown>) => apiRequest<{ employer: Employer }>('/api/employers', { method: 'POST', body: JSON.stringify(payload) });
export const loadStudentDashboard = (id: string) => apiRequest<{ student: Student; opportunities: Opportunity[]; stats: { matches: number; opportunities: number } }>(`/api/students/${encodeURIComponent(id)}/dashboard`);
export const loadEmployerDashboard = (id: string) => apiRequest<{ employer: Employer; opportunities: Opportunity[]; candidates: Student[]; stats: { active_jobs: number; candidates: number } }>(`/api/employers/${encodeURIComponent(id)}/dashboard`);
export const createOpportunity = (payload: Record<string, unknown>) => apiRequest<{ opportunity: Opportunity }>('/api/opportunities', { method: 'POST', body: JSON.stringify(payload) });