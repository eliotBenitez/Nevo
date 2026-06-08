// Types mirroring the nevo-relay REST API for accounts and shared storages.

export type StorageRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface CloudUser {
  id: string
  email: string
  displayName: string
  avatarUrl: string
  publicKey: string | null
}

export interface SharedStorage {
  id: string
  name: string
  glyph: string
  gradient: string
  ownerUserId: string
  createdAt: string
  role: StorageRole
  wrappedDek: string | null
  manifestRoom: string
}

export interface StorageMember {
  userId: string
  email: string
  displayName: string
  avatarUrl: string
  role: StorageRole
  hasKey: boolean // wrapped DEK delivered (active) vs pending
  publicKey: string | null
  joinedAt: string
}

export interface StorageInvite {
  id: string
  storageId: string
  email: string
  role: StorageRole
  token: string
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface CloudDocument {
  id: string
  storageId: string
  kind: 'note' | 'manifest'
  roomCode: string
  createdAt: string
  updatedAt: string
}

export interface AuthTokens {
  access: string
  refresh: string
}
