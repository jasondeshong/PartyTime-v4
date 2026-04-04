const API_URL = import.meta.env.VITE_API_URL || "";

export default function api(path, options) {
  return fetch(`${API_URL}${path}`, options);
}
