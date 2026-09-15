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
  const body = await response.text();
  let result: Record<string, unknown> = {};
  if (body) {
    if (!contentType.includes('application/json')) {
      throw new Error(response.ok ? 'The server returned an unexpected response.' : `Request failed with status ${response.status}.`);
    }
    try {
      result = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new Error('The server returned invalid JSON.');
    }
  }
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'The request could not be completed.');
  return result as T;
};

export type Student = { id: string; full_name: string; email: string; phone?: string | null; skills?: string[]; qualification?: string; location?: string; profile_picture_url?: string | null };
export type Employer = { id: string; company_name: string; email: string; industry?: string; location?: string; profile_picture_url?: string | null };
export type Opportunity = { id: string; title: string; description?: string; type?: string; required_skills?: string[]; match_score?: number; reasoning?: string; employers?: { company_name?: string } };
export type Application = { id: string; status: string; created_at?: string; students?: Student; opportunities?: Opportunity };
export type Match = { id: string; match_score?: number; matched_at?: string; counterpart?: Record<string, unknown>; opportunity?: Opportunity; connection_advice?: { benefits?: string[]; prompts?: string[] } | null };
export type Settings = { theme: 'dark' | 'light' | 'system'; preferences: Record<string, unknown>; student?: Student | null; employer?: Employer | null };

export const createStudent = (payload: Record<string, unknown>) => apiRequest<{ student: Student }>('/api/students', { method: 'POST', body: JSON.stringify(payload) });
export const createEmployer = (payload: Record<string, unknown>) => apiRequest<{ employer: Employer }>('/api/employers', { method: 'POST', body: JSON.stringify(payload) });
export const loadStudentDashboard = (id: string) => apiRequest<{ student: Student; opportunities: Opportunity[]; stats: { matches: number; opportunities: number } }>(`/api/students/${encodeURIComponent(id)}/dashboard`);
export const loadEmployerDashboard = (id: string) => apiRequest<{ employer: Employer; opportunities: Opportunity[]; candidates: Student[]; stats: { active_jobs: number; candidates: number } }>(`/api/employers/${encodeURIComponent(id)}/dashboard`);
export const createOpportunity = (payload: Record<string, unknown>) => apiRequest<{ opportunity: Opportunity }>('/api/opportunities', { method: 'POST', body: JSON.stringify(payload) });
export const loadCurrentUser = () => apiRequest<{ user: Record<string, unknown>; student: Student | null; employer: Employer | null }>('/api/me');
export const loadProfile = (profileType: ProfileType, profileId: string) => apiRequest<Record<string, Student | Employer>>(`/api/${profileType}/${encodeURIComponent(profileId)}`);
export const updateProfile = (profileType: ProfileType, profileId: string, payload: Record<string, unknown>) => apiRequest<Record<string, Student | Employer>>(`/api/${profileType}/${encodeURIComponent(profileId)}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const loadOpportunities = (query = '') => apiRequest<{ opportunities: Opportunity[]; page?: number; limit?: number; has_more?: boolean }>(`/api/opportunities${query}`);
export const loadOpportunity = (id: string) => apiRequest<{ opportunity: Opportunity }>(`/api/opportunities/${encodeURIComponent(id)}`);
export const applyToOpportunity = (opportunityId: string, studentId: string) => apiRequest<{ application: Application }>(`/api/opportunities/${encodeURIComponent(opportunityId)}/applications`, { method: 'POST', body: JSON.stringify({ student_id: studentId }) });
export const loadStudentApplications = (studentId: string) => apiRequest<{ applications: Application[] }>(`/api/students/${encodeURIComponent(studentId)}/applications`);
export const loadEmployerApplications = (employerId: string) => apiRequest<{ applications: Application[] }>(`/api/employers/${encodeURIComponent(employerId)}/applications`);
export const updateApplication = (applicationId: string, status: string) => apiRequest<{ application: Application }>(`/api/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const loadFypQueue = (mode: 'student' | 'peer' | 'employer', options: { page?: number; limit?: number; opportunityId?: string } = {}) => {
  const params = new URLSearchParams({ mode, page: String(options.page || 1), limit: String(options.limit || 10) });
  if (options.opportunityId) params.set('opportunity_id', options.opportunityId);
  return apiRequest<{ cards: Array<Record<string, unknown>>; page: number; limit: number; has_more: boolean }>(`/api/fyp/queue?${params.toString()}`);
};
export const submitFypSwipe = (payload: Record<string, unknown>) => apiRequest<{ matched?: boolean; match?: Match }>('/api/fyp/swipes', { method: 'POST', body: JSON.stringify(payload) });
export const loadMatches = () => apiRequest<{ matches: Match[] }>('/api/matches');
export const deleteMatch = (matchId: string) => apiRequest<{ deleted: boolean }>(`/api/matches/${encodeURIComponent(matchId)}`, { method: 'DELETE' });
export const generateAiFeedback = (payload: Record<string, unknown>) => apiRequest<{ assessment: Record<string, unknown> }>('/api/ai/feedback', { method: 'POST', body: JSON.stringify(payload) });
export const loadSettings = () => apiRequest<Settings>('/api/settings');
export const saveSettings = (payload: Record<string, unknown>) => apiRequest<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
export const exportAccountData = async () => {
  const accessToken = await getAccessToken();
  const response = await fetch(`${apiUrl}/api/account/export`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  const result = await response.text();
  if (!response.ok) throw new Error(result || 'Could not export your data.');
  return result;
};
export const deleteAccount = () => apiRequest<{ success: boolean }>('/api/account', { method: 'DELETE' });

type ProfileType = 'students' | 'employers';
type AvatarUpload = { upload_url: string; avatar_path: string; content_type: string };
type ProfileWithPicture = { profile_picture_url?: string | null };

export const createAvatarUpload = (profileType: ProfileType, profileId: string, contentType: string) => apiRequest<AvatarUpload>(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar/upload-url`, { method: 'POST', body: JSON.stringify({ content_type: contentType }) });
export const commitAvatarUpload = async (profileType: ProfileType, profileId: string, avatarPath: string) => {
  const result = await apiRequest<Record<string, ProfileWithPicture>>(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar`, { method: 'POST', body: JSON.stringify({ avatar_path: avatarPath }) });
  return result[profileType === 'students' ? 'student' : 'employer'];
};
export const removeAvatar = (profileType: ProfileType, profileId: string) => apiRequest(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar`, { method: 'DELETE' });

export const createCvUpload = (profileId: string, contentType: string) => apiRequest<AvatarUpload>(`/api/students/${encodeURIComponent(profileId)}/cv/upload-url`, { method: 'POST', body: JSON.stringify({ content_type: contentType }) });
export const commitCvUpload = (profileId: string, cvPath: string) => apiRequest<{ student: Student }>(`/api/students/${encodeURIComponent(profileId)}/cv`, { method: 'POST', body: JSON.stringify({ cv_path: cvPath }) });
export const removeCv = (profileId: string) => apiRequest<{ student: Student }>(`/api/students/${encodeURIComponent(profileId)}/cv`, { method: 'DELETE' });
export const loadCvUrl = (profileId: string) => apiRequest<{ cv_url: string }>(`/api/students/${encodeURIComponent(profileId)}/cv`);