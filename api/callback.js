// api/callback.js
import oauthCb from './oauth/callback.js'
export default async function handler(req, res) {
  return oauthCb(req, res)
}
