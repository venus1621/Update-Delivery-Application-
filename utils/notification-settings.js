import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_SOUND_KEY = '@notification_sound_enabled';

export const isNotificationSoundEnabled = async () => {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_SOUND_KEY);
    if (value === null) {
      return true;
    }
    return value === 'true';
  } catch (error) {
    console.error('Error reading notification sound setting:', error);
    return true;
  }
};

export const setNotificationSoundEnabled = async (enabled) => {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SOUND_KEY, enabled.toString());
    return true;
  } catch (error) {
    console.error('Error saving notification sound setting:', error);
    return false;
  }
};

export const getNotificationSettings = async () => {
  try {
    const soundEnabled = await isNotificationSoundEnabled();
    return {
      soundEnabled,
    };
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return {
      soundEnabled: true,
    };
  }
};
