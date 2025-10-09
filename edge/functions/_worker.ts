import handleApi from './_router'

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext) {
    const url = new URL(request.url)
    // 只拦截 /api/* 到 Edge 路由，其它静态资源/前端由 Pages 处理
    if (url.pathname.startsWith('/api/')) {
      // 将 env 暴露给运行时，便于 _db 读取
      ;(globalThis as any).ENV = env
      return handleApi(request)
    }
    return fetch(request)
  }
}


