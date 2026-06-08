import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  SharedStorage, StorageMember, StorageInvite, CloudDocument, StorageRole,
} from '../types/cloud'
import { useApiClient } from '../app/composables/useApiClient'
import { useAuthStore } from './auth'
import { wrapDEK, unwrapDEK, importDEK, generateRawDEK } from '../core/crypto/keypair'

// Manages the user's shared storages: listing, creation, membership, invites,
// and the per-storage Data Encryption Key (DEK). Raw DEK bytes are cached in
// memory only and never persisted or sent to the server in plaintext.

export const useSharedStorageStore = defineStore('sharedStorage', () => {
  const storages = ref<SharedStorage[]>([])
  const activeStorageId = ref<string | null>(null)
  const members = ref<StorageMember[]>([])
  const invites = ref<StorageInvite[]>([])
  const documents = ref<CloudDocument[]>([])

  // storageId -> raw DEK bytes (in-memory only).
  const dekCache = new Map<string, Uint8Array>()

  const activeStorage = computed(() =>
    storages.value.find(s => s.id === activeStorageId.value) ?? null)

  // Resolve dependent stores/clients synchronously while Pinia is active.
  const api = useApiClient()
  const auth = useAuthStore()

  async function loadStorages(): Promise<void> {
    storages.value = await api.get<SharedStorage[]>('/api/v1/storages') ?? []
  }

  async function createStorage(name: string, glyph: string, gradient: string): Promise<SharedStorage> {
    if (!auth.publicKey) throw new Error('missing public key')
    const rawDek = generateRawDEK()
    const wrappedDek = await wrapDEK(auth.publicKey, rawDek)
    const created = await api.post<SharedStorage>('/api/v1/storages', { name, glyph, gradient, wrappedDek })
    dekCache.set(created.id, rawDek)
    storages.value.push(created)
    return created
  }

  async function deleteStorage(storageId: string): Promise<void> {
    await api.del(`/api/v1/storages/${storageId}`)
    storages.value = storages.value.filter(storage => storage.id !== storageId)
    dekCache.delete(storageId)
    if (activeStorageId.value === storageId) {
      activeStorageId.value = null
      members.value = []
      invites.value = []
      documents.value = []
    }
  }

  /** Open a storage: unwrap its DEK and load members, invites, documents. */
  async function openStorage(id: string): Promise<void> {
    activeStorageId.value = id
    await ensureRawDek(id)
    await Promise.all([loadMembers(id), loadInvites(id), loadDocuments(id)])
  }

  /** Unwrap and cache the raw DEK for a storage from the caller's wrapped copy. */
  async function ensureRawDek(storageId: string): Promise<Uint8Array> {
    const cached = dekCache.get(storageId)
    if (cached) return cached
    const storage = storages.value.find(s => s.id === storageId)
    if (!storage?.wrappedDek) throw new Error('no key for this storage yet (pending approval)')
    if (!auth.privateKey) throw new Error('device private key unavailable')
    const raw = await unwrapDEK(auth.privateKey, storage.wrappedDek)
    dekCache.set(storageId, raw)
    return raw
  }

  /** AES-GCM key for the storage, used by the collaboration provider. */
  async function getDekKey(storageId: string): Promise<CryptoKey> {
    return importDEK(await ensureRawDek(storageId))
  }

  async function loadMembers(storageId: string): Promise<void> {
    members.value = await api.get<StorageMember[]>(`/api/v1/storages/${storageId}/members`) ?? []
  }

  async function loadInvites(storageId: string): Promise<void> {
    invites.value = await api.get<StorageInvite[]>(`/api/v1/storages/${storageId}/invites`) ?? []
  }

  async function loadDocuments(storageId: string): Promise<void> {
    documents.value = await api.get<CloudDocument[]>(`/api/v1/storages/${storageId}/documents`) ?? []
  }

  async function createDocument(storageId: string): Promise<CloudDocument> {
    const doc = await api.post<CloudDocument>(`/api/v1/storages/${storageId}/documents`)
    documents.value.push(doc)
    return doc
  }

  async function inviteMember(storageId: string, email: string, role: StorageRole): Promise<void> {
    await api.post(`/api/v1/storages/${storageId}/invites`, { email, role })
    await loadInvites(storageId)
  }

  async function acceptInvite(token: string): Promise<string> {
    const res = await api.post<{ storageId: string }>(`/api/v1/invites/${token}/accept`)
    await loadStorages()
    return res.storageId
  }

  /**
   * Finalize a pending member: wrap this storage's DEK with their public key and
   * deliver it. Requires the caller to already hold the DEK (owner/admin).
   */
  async function approveMember(storageId: string, member: StorageMember): Promise<void> {
    if (!member.publicKey) throw new Error('member has no public key yet')
    const rawDek = await ensureRawDek(storageId)
    const wrapped = await wrapDEK(member.publicKey, rawDek)
    await api.post(`/api/v1/storages/${storageId}/members/${member.userId}/wrapped-dek`, { wrappedDek: wrapped })
    await loadMembers(storageId)
  }

  async function setMemberRole(storageId: string, userId: string, role: StorageRole): Promise<void> {
    await api.patch(`/api/v1/storages/${storageId}/members/${userId}`, { role })
    await loadMembers(storageId)
  }

  async function removeMember(storageId: string, userId: string): Promise<void> {
    await api.del(`/api/v1/storages/${storageId}/members/${userId}`)
    await loadMembers(storageId)
  }

  function reset(): void {
    storages.value = []
    activeStorageId.value = null
    members.value = []
    invites.value = []
    documents.value = []
    dekCache.clear()
  }

  return {
    storages, activeStorageId, activeStorage, members, invites, documents,
    loadStorages, createStorage, deleteStorage, openStorage, getDekKey,
    loadMembers, loadInvites, loadDocuments, createDocument,
    inviteMember, acceptInvite, approveMember, setMemberRole, removeMember,
    reset,
  }
})
