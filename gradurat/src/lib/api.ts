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
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
  return result as T;
};

export type Student = { id: string; full_name: string; email: string; skills?: string[]; qualification?: string; location?: string; profile_picture_url?: string | null };
export type Employer = { id: string; company_name: string; email: string; industry?: string; location?: string; profile_picture_url?: string | null };
export type Opportunity = { id: string; title: string; description?: string; type?: string; required_skills?: string[]; match_score?: number; reasoning?: string; employers?: { company_name?: string } };

export const createStudent = (payload: Record<string, unknown>) => apiRequest<{ student: Student }>('/api/students', { method: 'POST', body: JSON.stringify(payload) });
export const createEmployer = (payload: Record<string, unknown>) => apiRequest<{ employer: Employer }>('/api/employers', { method: 'POST', body: JSON.stringify(payload) });
export const loadStudentDashboard = (id: string) => apiRequest<{ student: Student; opportunities: Opportunity[]; stats: { matches: number; opportunities: number } }>(`/api/students/${encodeURIComponent(id)}/dashboard`);
export const loadEmployerDashboard = (id: string) => apiRequest<{ employer: Employer; opportunities: Opportunity[]; candidates: Student[]; stats: { active_jobs: number; candidates: number } }>(`/api/employers/${encodeURIComponent(id)}/dashboard`);
export const createOpportunity = (payload: Record<string, unknown>) => apiRequest<{ opportunity: Opportunity }>('/api/opportunities', { method: 'POST', body: JSON.stringify(payload) });

type ProfileType = 'students' | 'employers';
type AvatarUpload = { upload_url: string; avatar_path: string; content_type: string };
type ProfileWithPicture = { profile_picture_url?: string | null };

export const createAvatarUpload = (profileType: ProfileType, profileId: string, contentType: string) => apiRequest<AvatarUpload>(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar/upload-url`, { method: 'POST', body: JSON.stringify({ content_type: contentType }) });
export const commitAvatarUpload = async (profileType: ProfileType, profileId: string, avatarPath: string) => {
  const result = await apiRequest<Record<string, ProfileWithPicture>>(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar`, { method: 'POST', body: JSON.stringify({ avatar_path: avatarPath }) });
  return result[profileType === 'students' ? 'student' : 'employer'];
};
export const removeAvatar = (profileType: ProfileType, profileId: string) => apiRequest(`/api/${profileType}/${encodeURIComponent(profileId)}/avatar`, { method: 'DELETE' });