import { isTauri } from '@tauri-apps/api/core'
import { appLogger } from '../utils/logger'

/** Sends an OS notification, asking for permission on first use. Never throws; returns whether it was sent. */
export async function sendSystemNotification(title: string, body: string): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
    if (!await isPermissionGranted() && await requestPermission() !== 'granted') return false
    sendNotification({ title, body })
    return true
  } catch (error) {
    await appLogger.error({
      source: 'frontend.notifications',
      event: 'send_system_notification',
      message: 'Failed to send a system notification',
      error,
    })
    return false
  }
}
