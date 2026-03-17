#!/usr/bin/env ruby
# Simple LAN-friendly server for this static site + an "online" presence counter.
# Run: ruby server.rb

require "json"
require "webrick"
require "fileutils"
require "time"

ROOT = Dir.pwd
BIND = ENV.fetch("BIND", "0.0.0.0")
PORT = Integer(ENV.fetch("PORT", "3000"))

STALE_SECONDS = Integer(ENV.fetch("PRESENCE_STALE_SECONDS", "15"))

presence = {}
presence_lock = Mutex.new

likes = {}
likes_lock = Mutex.new

DATA_DIR = File.join(ROOT, "data")
COMMENTS_FILE = File.join(DATA_DIR, "comments.json")
FileUtils.mkdir_p(DATA_DIR)

comments_lock = Mutex.new

def load_comments(path)
  return [] unless File.exist?(path)
  raw = File.read(path)
  parsed = JSON.parse(raw)
  parsed.is_a?(Array) ? parsed : []
rescue
  []
end

def save_comments(path, comments)
  tmp = "#{path}.tmp"
  File.write(tmp, JSON.pretty_generate(comments))
  File.rename(tmp, path)
end

def prune_presence!(presence, now, stale_seconds)
  cutoff = now - stale_seconds
  presence.delete_if { |_sid, last_seen| last_seen < cutoff }
end

server = WEBrick::HTTPServer.new(
  BindAddress: BIND,
  Port: PORT,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

server.mount("/", WEBrick::HTTPServlet::FileHandler, ROOT, FancyIndexing: false)

server.mount_proc("/presence/ping") do |req, res|
  sid = req.query["sid"].to_s.strip
  if sid.empty?
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "missing sid" })
    next
  end

  now = Time.now.to_i
  online = 0
  presence_lock.synchronize do
    presence[sid] = now
    prune_presence!(presence, now, STALE_SECONDS)
    online = presence.length
  end

  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, online: online, stale_seconds: STALE_SECONDS })
end

server.mount_proc("/likes") do |_req, res|
  count = 0
  likes_lock.synchronize do
    count = likes.length
  end
  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, likes: count })
end

server.mount_proc("/likes/like") do |req, res|
  sid = req.query["sid"].to_s.strip
  if sid.empty?
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "missing sid" })
    next
  end

  count = 0
  likes_lock.synchronize do
    likes[sid] = true
    count = likes.length
  end

  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, likes: count })
end

server.mount_proc("/comments") do |_req, res|
  items = []
  comments_lock.synchronize do
    items = load_comments(COMMENTS_FILE)
  end
  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, comments: items })
end

server.mount_proc("/comments/add") do |req, res|
  if req.request_method != "POST"
    res.status = 405
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "method not allowed" })
    next
  end

  begin
    data = JSON.parse(req.body.to_s)
  rescue
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "invalid json" })
    next
  end

  sid = data["sid"].to_s.strip
  name = data["name"].to_s.strip
  topic = data["topic"].to_s.strip
  message = data["message"].to_s.strip

  if sid.empty? || name.empty? || message.empty?
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "missing fields" })
    next
  end

  if message.length > 400
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "message too long" })
    next
  end

  now = Time.now.utc.iso8601 rescue Time.now.utc.to_s
  item = {
    "id" => "c_#{Time.now.to_i}_#{rand(1_000_000)}",
    "created_at" => now,
    "sid" => sid,
    "name" => name[0, 60],
    "topic" => topic[0, 80],
    "message" => message,
  }

  items = []
  comments_lock.synchronize do
    items = load_comments(COMMENTS_FILE)
    items.unshift(item)
    items = items.take(200)
    save_comments(COMMENTS_FILE, items)
  end

  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, comments: items.take(60) })
end

server.mount_proc("/comments/add-form") do |req, res|
  if req.request_method != "POST"
    res.status = 405
    res["Content-Type"] = "text/plain"
    res.body = "method not allowed\n"
    next
  end

  name = req.query["name"].to_s.strip
  topic = req.query["topic"].to_s.strip
  message = req.query["message"].to_s.strip
  sid = req.query["sid"].to_s.strip
  sid = req.peeraddr[3].to_s if sid.empty?

  if name.empty? || message.empty?
    res.status = 303
    res["Location"] = "/comments.html#missing"
    next
  end

  if message.length > 400
    res.status = 303
    res["Location"] = "/comments.html#toolong"
    next
  end

  now = Time.now.utc.iso8601
  item = {
    "id" => "c_#{Time.now.to_i}_#{rand(1_000_000)}",
    "created_at" => now,
    "sid" => sid,
    "name" => name[0, 60],
    "topic" => topic[0, 80],
    "message" => message,
  }

  comments_lock.synchronize do
    items = load_comments(COMMENTS_FILE)
    items.unshift(item)
    items = items.take(200)
    save_comments(COMMENTS_FILE, items)
  end

  res.status = 303
  res["Location"] = "/comments.html#posted"
end

server.mount_proc("/health") do |_req, res|
  res["Content-Type"] = "text/plain"
  res.body = "ok\n"
end

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

server.start
