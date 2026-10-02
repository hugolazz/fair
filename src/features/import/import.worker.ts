import { handleRequest, type WorkerRequest, type WorkerResponse } from './lib/runner'

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const res: WorkerResponse = await handleRequest(e.data)
  self.postMessage(res)
}
