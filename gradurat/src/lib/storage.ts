import AsyncStorage from '@react-native-async-storage/async-storage';

export const profileKeys = {
  student: 'graduRatStudentId',
  employer: 'graduRatEmployerId',
} as const;
const activeRoleKey = 'graduRatActiveRole';

export const saveProfileId = (role: keyof typeof profileKeys, id: string) =>
  AsyncStorage.setItem(profileKeys[role], id);

export const getProfileId = (role: keyof typeof profileKeys) =>
  AsyncStorage.getItem(profileKeys[role]);

export const clearProfileId = (role: keyof typeof profileKeys) =>
  AsyncStorage.removeItem(profileKeys[role]);

export const saveActiveProfileRole = (role: keyof typeof profileKeys) =>
  AsyncStorage.setItem(activeRoleKey, role);

export const clearActiveProfileRole = () => AsyncStorage.removeItem(activeRoleKey);

export const getActiveProfileRole = async () => {
  const activeRole = await AsyncStorage.getItem(activeRoleKey);
  if (activeRole === 'student' || activeRole === 'employer') return activeRole;
  const [studentId, employerId] = await Promise.all([
    AsyncStorage.getItem(profileKeys.student),
    AsyncStorage.getItem(profileKeys.employer),
  ]);
  return employerId ? 'employer' : studentId ? 'student' : null;
};
