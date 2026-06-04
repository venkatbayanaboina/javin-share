export function getUrlParameter(name) {
  if (!name) return null;
  return new URLSearchParams(window.location.search).get(name);
}
