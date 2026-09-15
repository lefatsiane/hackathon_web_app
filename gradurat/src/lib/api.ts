import { getAccessToken } from '@/lib/auth';

const apiUrl = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const apiRequest = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const accessToken = await getAccessToken();
  const response = await fetch(`${apiUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options?.headers || {}),
    },
    ...options,
  });
  const contentType = response.headers.get('content-type') || '';
  const result = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    throw new Error(result?.error || `Request failed with status ${response.status}.`);
  }
  return result as T;
};

export type Student = { id: string; full_name: string; email: string; skills?: string[]; qualification?: string; location?: string; profile_picture_url?: string | null; cv_path?: string | null; [key: string]: unknown };
export type Employer = { id: string; company_name: string; email: string; industry?: string; location?: string; profile_picture_url?: string | null; [key: string]: unknown };
export type Opportunity = { id: string; title: string; description?: string; type?: string; required_skills?: string[]; match_score?: number | null; reasoning?: string | null; employers?: { company_name?: string }; [key: string]: unknown };
export type Application = { id: string; status: string; student_id: string; opportunity_id: string; created_at?: string; opportunities?: Opportunity & { employers?: { company_name?: string } }; students?: Student };
export type Match = { id: string; opportunity_id?: string; student_id?: string; match_score?: number | null; reasoning?: string | null; counterpart?: Record<string, unknown>; connection_advice?: Record<string, unknown> | null };
export type Account = { user: Record<string, unknown>; student: Student | null; employer: Employer | null };

export const loadAccount = () => apiRequest<Account>('/api/me');

export const createStudent = (payload: Record<string, unknown>) => apiRequest<{ student: Student }>('/api/students', { method: 'POST', body: JSON.stringify(payload) });
export const createEmployer = (payload: Record<string, unknown>) => apiRequest<{ employer: Employer }>('/api/employers', { method: 'POST', body: JSON.stringify(payload) });
export const loadStudentDashboard = (id: string) => apiRequest<{ student: Student; opportunities: Opportunity[]; stats: { matches: number; opportunities: number } }>(`/api/students/${encodeURIComponent(id)}/dashboard`);
export const loadEmployerDashboard = (id: string) => apiRequest<{ employer: Employer; opportunities: Opportunity[]; candidates: Student[]; stats: { active_jobs: number; candidates: number } }>(`/api/employers/${encodeURIComponent(id)}/dashboard`);
export const createOpportunity = (payload: Record<string, unknown>) => apiRequest<{ opportunity: Opportunity }>('/api/opportunities', { method: 'POST', body: JSON.stringify(payload) });
export const loadStudentProfile = (id: string) => apiRequest<{ student: Student; profile_completeness: number }>(`/api/students/${encodeURIComponent(id)}`);
export const updateStudentProfile = (id: string, payload: Record<string, unknown>) => apiRequest<{ student: Student; profile_completeness: number }>(`/api/students/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const loadEmployerProfile = (id: string) => apiRequest<{ employer: Employer; profile_completeness: number }>(`/api/employers/${encodeURIComponent(id)}`);
export const updateEmployerProfile = (id: string, payload: Record<string, unknown>) => apiRequest<{ employer: Employer; profile_completeness: number }>(`/api/employers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const listOpportunities = (query = '') => apiRequest<{ opportunities: Opportunity[]; pagination: { page: number; limit: number; total: number; pages: number } }>(`/api/opportunities${query ? `?${query}` : ''}`);
export const loadOpportunity = (id: string) => apiRequest<{ opportunity: Opportunity }>(`/api/opportunities/${encodeURIComponent(id)}`);
export const applyToOpportunity = (opportunityId: string, studentId: string, coverNote?: string) => apiRequest<{ application: Application }>(`/api/opportunities/${encodeURIComponent(opportunityId)}/applications`, { method: 'POST', body: JSON.stringify({ student_id: studentId, cover_note: coverNote }) });
export const loadStudentApplications = (studentId: string) => apiRequest<{ applications: Application[] }>(`/api/students/${encodeURIComponent(studentId)}/applications`);
export const loadEmployerApplications = (employerId: string) => apiRequest<{ applications: Application[] }>(`/api/employers/${encodeURIComponent(employerId)}/applications`);
export const updateApplication = (applicationId: string, status: string) => apiRequest<{ application: Application }>(`/api/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const loadSwipeQueue = (mode: 'student' | 'peer' | 'employer', opportunityId?: string) => apiRequest<{ cards: (Opportunity & Student)[]; has_more: boolean }>(`/api/fyp/queue?mode=${mode}${opportunityId ? `&opportunity_id=${encodeURIComponent(opportunityId)}` : ''}`);
export const submitSwipe = (payload: { mode?: 'opportunity' | 'peer'; decision: 'like' | 'pass'; opportunity_id?: string; student_id?: string; target_student_id?: string }) => apiRequest<{ matched?: boolean; match?: Match }>('/api/fyp/swipes', { method: 'POST', body: JSON.stringify(payload) });
export const loadMatches = () => apiRequest<{ matches: Match[]; totalMatches: number }>('/api/matches');
export const deleteMatch = (matchId: string) => apiRequest<{ deleted: boolean }>(`/api/matches/${encodeURIComponent(matchId)}`, { method: 'DELETE' });
export const requestAiFeedback = (payload: Record<string, unknown>) => apiRequest<{ assessment: Record<string, unknown> }>('/api/ai/feedback', { method: 'POST', body: JSON.stringify(payload) });
export const loadSettings = () => apiRequest<{ theme: string; preferences: Record<string, unknown>; student: Student | null; employer: Employer | null }>('/api/settings');
export const updateSettings = (payload: Record<string, unknown>) => apiRequest<{ theme: string; preferences: Record<string, unknown> }>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
export const deleteAccount = () => apiRequest<{ deleted: boolean }>('/api/account', { method: 'DELETE' });

type ProfileType = 'students' | 'employers';
type AvatarUpload = { upload_url: string; avatar_path: string; content_type: string };
type ProfileWithPicture = { profile_picture_url?: string | null };

export const createAvatarUpload = (profileType: ProfileType, profileId: string, contentType: string) => apiRequest<AvatarUpload>(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar/upload-url`, { method: 'POST', body: JSON.stringify({ content_type: contentType }) });
export const commitAvatarUpload = async (profileType: ProfileType, profileId: string, avatarPath: string) => {
  const result = await apiRequest<Record<string, ProfileWithPicture>>(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar`, { method: 'POST', body: JSON.stringify({ avatar_path: avatarPath }) });
  return result[profileType === 'students' ? 'student' : 'employer'];
};
export const removeAvatar = (profileType: ProfileType, profileId: string) => apiRequest(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar`, { method: 'DELETE' });