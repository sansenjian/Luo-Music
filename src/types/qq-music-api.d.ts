declare module '@sansenjian/qq-music-api' {
  const serveQcmApi: (options: { port: number; host: string }) => Promise<void>
  export { serveQcmApi }
}
