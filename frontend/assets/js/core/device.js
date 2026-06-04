export function getDeviceInfo() {
  const userAgent = navigator.userAgent;
  let deviceType = 'desktop';
  let os = 'unknown';

  if (/tablet|ipad|playbook|silk/i.test(userAgent)) {
    deviceType = 'tablet';
  } else if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(userAgent)) {
    deviceType = 'mobile';
  }

  if (/windows/i.test(userAgent)) os = 'windows';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'macos';
  else if (/linux/i.test(userAgent)) os = 'linux';
  else if (/android/i.test(userAgent)) os = 'android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'ios';

  return { deviceType, os, userAgent };
}
