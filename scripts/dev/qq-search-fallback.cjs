const SEARCH_ENDPOINT = 'https://u.y.qq.com/cgi-bin/musicu.fcg'

const SEARCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
  'Content-Type': 'application/json;charset=utf-8',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin'
}

function isSearchPath(pathname) {
  return pathname === '/getSearchByKey' || pathname.startsWith('/getSearchByKey/')
}

function toPositiveInteger(value, fallbackValue) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackValue
}

function extractQQSearchParams(requestUrl) {
  const url = new URL(requestUrl, 'http://127.0.0.1')
  const pathKeyword = decodeURIComponent(url.pathname.replace(/^\/getSearchByKey\/?/, '')).trim()
  const queryKeyword = url.searchParams.get('key')?.trim()
  const keyword = (queryKeyword || pathKeyword || '').trim()

  return {
    keyword,
    limit: toPositiveInteger(url.searchParams.get('limit'), 10),
    page: toPositiveInteger(url.searchParams.get('page'), 1)
  }
}

function buildQQMusicuSearchBody(keyword, limit, page) {
  return {
    comm: {
      ct: '19',
      cv: '1859',
      uin: '0'
    },
    req: {
      method: 'DoSearchForQQMusicDesktop',
      module: 'music.search.SearchCgiService',
      param: {
        grp: 1,
        num_per_page: limit,
        page_num: page,
        query: keyword,
        search_type: 0
      }
    }
  }
}

function normalizeQQMusicuSearchResponse(payload) {
  const requestPayload = payload?.req?.data
  const list = Array.isArray(requestPayload?.body?.song?.list) ? requestPayload.body.song.list : []
  const totalnum = toPositiveInteger(requestPayload?.meta?.sum, list.length)
  const code = toPositiveInteger(requestPayload?.code ?? payload?.req?.code ?? payload?.code, 0)

  return {
    response: {
      code,
      song: {
        list,
        totalnum
      }
    }
  }
}

async function requestQQMusicuSearch(keyword, limit, page) {
  const response = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: SEARCH_HEADERS,
    body: JSON.stringify(buildQQMusicuSearchBody(keyword, limit, page))
  })

  if (!response.ok) {
    const raw = await response.text()
    const error = new Error(
      `QQ fallback search failed with status ${response.status}${raw ? `: ${raw}` : ''}`
    )
    error.status = response.status
    error.raw = raw
    throw error
  }

  const payload = await response.json()
  return normalizeQQMusicuSearchResponse(payload)
}

function writeJson(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

async function handleQQSearchRequest(request, response) {
  const url = request.url || '/'
  const pathname = new URL(url, 'http://127.0.0.1').pathname
  if (request.method !== 'GET' || !isSearchPath(pathname)) {
    return false
  }

  const { keyword, limit, page } = extractQQSearchParams(url)

  if (!keyword) {
    writeJson(response, 400, { response: 'search key is null' })
    return true
  }

  try {
    const result = await requestQQMusicuSearch(keyword, limit, page)
    writeJson(response, 200, result)
  } catch (error) {
    writeJson(response, 500, {
      error: {
        message: error instanceof Error ? error.message : String(error)
      }
    })
  }

  return true
}

module.exports = {
  buildQQMusicuSearchBody,
  extractQQSearchParams,
  handleQQSearchRequest,
  isSearchPath,
  normalizeQQMusicuSearchResponse,
  requestQQMusicuSearch
}
