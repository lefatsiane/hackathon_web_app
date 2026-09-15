import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useTheme } from '@/lib/theme';
import { commitAvatarUpload, createAvatarUpload, removeAvatar } from '@/lib/api';

type ProfileType = 'students' | 'employers';

type AvatarProps = {
  name: string;
  profileId: string;
  profileType: ProfileType;
  url?: string | null;
  size?: number;
  editable?: boolean;
  onChange?: (url: string | null) => void;
};

const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GR';

export function Avatar({ name, profileId, profileType, url, size = 64, editable = false, onChange }: AvatarProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const choosePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled) return;
    const asset = result.assets[0];
    const contentType = asset.mimeType || 'image/jpeg';
    if (!supportedTypes.has(contentType)) return setMessage('Choose a JPEG, PNG, or WebP image.');
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) return setMessage('Profile photos must be 5 MB or smaller.');

    setBusy(true);
    setMessage('Uploading photo...');
    try {
      const upload = await createAvatarUpload(profileType, profileId, contentType);
      const uploadResponse = await FileSystem.uploadAsync(upload.upload_url, asset.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': upload.content_type, 'x-upsert': 'true' },
      });
      if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
        throw new Error(`The image could not be uploaded (status ${uploadResponse.status}).`);
      }
      const profile = await commitAvatarUpload(profileType, profileId, upload.avatar_path);
      onChange?.(profile.profile_picture_url || null);
      setMessage('Profile photo saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save profile photo.');
    } finally {
      setBusy(false);
    }
  };

  const deletePhoto = async () => {
    setBusy(true);
    setMessage('Removing photo...');
    try {
      await removeAvatar(profileType, profileId);
      onChange?.(null);
      setMessage('Profile photo removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove profile photo.');
    } finally {
      setBusy(false);
    }
  };

  const avatarSize = { width: size, height: size, borderRadius: size / 2 };
  return <View style={styles.wrap}>{url ? <Image source={{ uri: url }} style={[styles.image, avatarSize]} accessibilityLabel={`${name} profile picture`} /> : <View style={[styles.fallback, avatarSize]}><Text style={styles.initials}>{initials(name)}</Text></View>}{editable ? <View style={styles.actions}><Pressable disabled={busy} onPress={choosePhoto}><Text style={styles.action}>{busy ? 'Working...' : 'Change photo'}</Text></Pressable>{url ? <Pressable disabled={busy} onPress={deletePhoto}><Text style={styles.remove}>Remove</Text></Pressable> : null}</View> : null}{message ? <Text style={styles.message}>{message}</Text> : null}{busy ? <ActivityIndicator color={colors.blue} /> : null}</View>;
}

const makeStyles = (colors: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ wrap: { alignItems: 'center', gap: 6 }, image: { width: 64, height: 64, borderRadius: 32 }, fallback: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, initials: { color: colors.text, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 12 }, action: { color: colors.blue, fontSize: 12, fontWeight: '700' }, remove: { color: colors.danger, fontSize: 12, fontWeight: '700' }, message: { color: colors.muted, fontSize: 11, maxWidth: 170, textAlign: 'center' } });