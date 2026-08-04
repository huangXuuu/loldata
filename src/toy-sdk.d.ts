export {}

declare global {
  interface ToyAuthorProfile {
    nickname: string
    avatar?: string
    follower?: number
    [key: string]: unknown
  }

  interface ToyAuthorProfileResp {
    status: 'ok' | string
    data?: ToyAuthorProfile
    message?: string
  }

  interface ToyNavigateParams {
    type: 'video' | 'space' | 'search' | 'opus' | 'tribee' | 'toy'
    id: string
    extra?: Record<string, unknown>
  }

  interface ToySDK {
    isSupport(ability: string): Promise<boolean>
    getAuthorProfile(): Promise<ToyAuthorProfileResp>
    navigate(params: ToyNavigateParams): Promise<void>
  }

  interface Window {
    toy?: ToySDK
  }
}
