import { apiClient } from "@/lib/apiClient";

export async function listProducts() {
  return apiClient.get<unknown[]>("/products");
}

export async function listMarketplaceProducts() {
  return apiClient.get<unknown[]>("/products/marketplace");
}

export async function getProductById(id: string) {
  return apiClient.get<unknown>(`/products/detail/${encodeURIComponent(id)}`);
}

export async function getProductVariants(id: string) {
  return apiClient.get<unknown[]>(`/products/${encodeURIComponent(id)}/variants`);
}

export async function createProduct(body: Record<string, unknown>) {
  return apiClient.post<unknown>("/products", body);
}

export async function updateProduct(id: string, body: Record<string, unknown>) {
  return apiClient.put<unknown>(`/products/${encodeURIComponent(id)}`, body);
}

export async function deleteProduct(id: string) {
  return apiClient.delete<{ ok: boolean }>(`/products/${encodeURIComponent(id)}`);
}

export async function listProductRequests() {
  return apiClient.get<unknown[]>("/product-requests");
}

export async function createProductRequest(body: Record<string, unknown>) {
  return apiClient.post<unknown>("/product-requests", body);
}

export async function updateProductRequest(id: string, body: Record<string, unknown>) {
  return apiClient.put<unknown>(`/product-requests/${encodeURIComponent(id)}`, body);
}

export async function deleteProductRequest(id: string) {
  return apiClient.delete(`/product-requests/${encodeURIComponent(id)}`);
}
