import type { StoreRow } from "../../db/schema/stores";

export interface StoreDto {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toStoreDto(store: StoreRow): StoreDto {
  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    ownerUserId: store.ownerUserId,
    isActive: store.isActive,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt,
  };
}
