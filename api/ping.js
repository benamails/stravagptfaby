export default function handler(req, res) {
  console.log("HIT /api/ping", { method: req.method, ua: req.headers['user-agent'] });
  res.json({ ok: true, ts: Date.now() });
}
