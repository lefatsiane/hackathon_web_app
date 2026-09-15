import AsyncStorage from '@react-native-async-storage/async-storage';

export const profileKeys = {
  student: 'graduRatStudentId',
  employer: 'graduRatEmployerId',
} as const;

export const saveProfileId = (role: keyof typeof profileKeys, id: string) =>
  AsyncStorage.setItem(profileKeys[role], id);

export const getProfileId = (role: keyof typeof profileKeys) =>
  AsyncStorage.getItem(profileKeys[role]);

export const clearProfileId = (role: keyof typeof profileKeys) =>
  AsyncStorage.removeItem(profileKeys[role]);

export const getActiveProfileRole = async () => {
  const [studentId, employerId] = await Promise.all([
    AsyncStorage.getItem(profileKeys.student),
    AsyncStorage.getItem(profileKeys.employer),
  ]);
  return studentId ? 'student' : employerId ? 'employer' : null;
};
