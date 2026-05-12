export type WarpRelease = {
  mbid: string;
  title: string;
  artist: string;
  date: string;
  /** Absolute path served by Next.js static files, e.g. /covers/<mbid>.jpg */
  coverUrl: string;
};
