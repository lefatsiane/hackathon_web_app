import AsyncStorage from '@react-native-async-storage/async-storage';

export const profileKeys = { student: 'graduRatStudentId', employer: 'graduRatEmployerId' } as const;
export const saveProfileId = (role: keyof typeof profileKeys, id: string) => AsyncStorage.setItem(profileKeys[role], id);
export const getProfileId = (role: keyof typeof profileKeys) => AsyncStorage.getItem(profileKeys[role]);