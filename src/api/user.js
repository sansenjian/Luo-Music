import request from './request'

export function getQRKey() {
  return request.get('/login/qr/key', {
    params: { timestamp: Date.now() }
  })
}

export function getQRCode(key) {
  return request.get('/login/qr/create', {
    params: {
      key,
      qrimg: true,
      timestamp: Date.now()
    }
  })
}

export function checkQRStatus(key) {
  return request.get('/login/qr/check', {
    params: {
      key,
      timestamp: Date.now()
    }
  })
}

export function getUserAccount() {
  return request.get('/user/account', {
    params: { timestamp: Date.now() }
  })
}

export function logout() {
  return request.get('/logout', {
    params: { timestamp: Date.now() }
  })
}

export function getUserDetail(uid) {
  return request.get('/user/detail', {
    params: { uid, timestamp: Date.now() }
  })
}

export function getUserSubcount() {
  return request.get('/user/subcount', {
    params: { timestamp: Date.now() }
  })
}

export function getUserLevel() {
  return request.get('/user/level', {
    params: { timestamp: Date.now() }
  })
}

export function getUserEvent(uid, limit = 10, lasttime = -1) {
  return request.get('/user/event', {
    params: { uid, limit, lasttime, timestamp: Date.now() }
  })
}
