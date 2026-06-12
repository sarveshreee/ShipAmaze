import { apiClient } from "@/lib/apiClient";

export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  emoji?: string;
  imageUrl?: string;
  displayOrder: number;
  enabled: boolean;
  defaultHsn?: string;
}

export async function listCategories(all = false) {
  const q = all ? "?all=1" : "";
  return apiClient.get<CategoryRow[]>(`/categories${q}`);
}

export async function createCategory(body: Partial<CategoryRow>) {
  return apiClient.post<CategoryRow>("/admin/categories", body);
}

export async function updateCategory(id: string, body: Partial<CategoryRow>) {
  return apiClient.put<CategoryRow>(`/admin/categories/${id}`, body);
}

export async function deleteCategory(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/admin/categories/${id}`);
}
