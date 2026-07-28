const KEY = 'maestro.device_token'

export function getDeviceToken() {
  return localStorage.getItem(KEY)
}

export function getOrCreateDeviceToken() {
  let token = localStorage.getItem(KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(KEY, token)
  }
  return token
}
