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

  interface ToyVideoRef {
    aid?: number
    bvid?: string
  }

  interface ToyAuthorVideo {
    aid?: number
    bvid?: string
    title?: string
    cover?: string
    pic?: string
    [key: string]: unknown
  }

  interface ToyAuthorVideosResp {
    status: 'ok' | string
    data?: ToyAuthorVideo[]
    message?: string
  }

  interface ToySDK {
    isSupport(ability: string): Promise<boolean>
    getAuthorProfile(): Promise<ToyAuthorProfileResp>
    getAuthorVideos(params: { videos: ToyVideoRef[] }): Promise<ToyAuthorVideosResp>
    navigate(params: ToyNavigateParams): Promise<void>
  }

  interface Window {
    toy?: ToySDK
  }
}
