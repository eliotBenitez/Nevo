import { ref, onMounted } from 'vue'
import { configCommands } from '../tauri/commands'

export function useSystemFonts() {
  const fonts = ref<string[]>([])
  const loading = ref(true)

  onMounted(async () => {
    try {
      fonts.value = await configCommands.listSystemFonts()
    } catch {
      fonts.value = []
    } finally {
      loading.value = false
    }
  })

  return { fonts, loading }
}
