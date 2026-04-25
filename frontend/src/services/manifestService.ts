import { apiClient } from "@/lib/apiClient";

export async function listManifests() {
  return apiClient.get<unknown[]>("/manifests");
}
