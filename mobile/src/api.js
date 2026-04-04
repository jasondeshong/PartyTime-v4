import { API_URL } from "./config";

export default function api(path, options) {
  return fetch(`${API_URL}${path}`, options);
}
