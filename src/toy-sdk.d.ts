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

  interface ToySDK {
    isSupport(ability: string): Promise<boolean>
    getAuthorProfile(): Promise<ToyAuthorProfileResp>
  }

  interface Window {
    toy?: ToySDK
  }
}
