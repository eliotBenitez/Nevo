import { findMatchesInRuns, type FindMatchesResult, type FindQuery, type TextRun } from './findMatches'

/** Runs regex Find & Replace matching off the UI thread. Deliberately does
 *  not import `prosemirror-model` — it only ever sees plain strings/offsets
 *  (`TextRun[]`), collected on the main thread by `collectTextRuns`. A
 *  pathological pattern can still hang this worker's own thread forever;
 *  `findMatchesClient.ts` is what protects the UI by terminating it on a
 *  timeout, since nothing here can interrupt a stuck `RegExp.exec`. */
export interface FindMatchesWorkerRequest {
  id: number
  runs: TextRun[]
  query: FindQuery
  limit: number
}

export type FindMatchesWorkerResponse = { id: number } & FindMatchesResult

self.onmessage = (event: MessageEvent<FindMatchesWorkerRequest>) => {
  const { id, runs, query, limit } = event.data
  const result = findMatchesInRuns(runs, query, limit)
  self.postMessage({ id, ...result } satisfies FindMatchesWorkerResponse)
}
