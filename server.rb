#!/usr/bin/env ruby
# Simple LAN-friendly server for this static site + an "online" presence counter.
# Run: ruby server.rb

require "json"
require "webrick"
require "fileutils"
require "time"
require "net/http"
require "uri"

ROOT = Dir.pwd
BIND = ENV.fetch("BIND", "0.0.0.0")
PORT = Integer(ENV.fetch("PORT", "3000"))

STALE_SECONDS = Integer(ENV.fetch("PRESENCE_STALE_SECONDS", "15"))

def load_dotenv(path)
  return unless File.exist?(path)
  File.read(path).each_line do |line|
    s = line.to_s.strip
    next if s.empty?
    next if s.start_with?("#")
    k, v = s.split("=", 2)
    next unless k && v
    key = k.strip
    val = v.strip
    # Remove surrounding quotes: KEY="value"
    if (val.start_with?('"') && val.end_with?('"')) || (val.start_with?("'") && val.end_with?("'"))
      val = val[1..-2]
    end
    next if key.empty?
    next unless ENV[key].to_s.strip.empty?
    ENV[key] = val
  end
rescue
  # Ignore dotenv parse errors; server should still start.
end

load_dotenv(File.join(ROOT, ".env.local"))
load_dotenv(File.join(ROOT, ".env"))

presence = {}
presence_lock = Mutex.new

likes = {}
likes_lock = Mutex.new

DATA_DIR = File.join(ROOT, "data")
COMMENTS_FILE = File.join(DATA_DIR, "comments.json")
FIXTURES_FILE = File.join(DATA_DIR, "fixtures.json")
FileUtils.mkdir_p(DATA_DIR)

comments_lock = Mutex.new
fixtures_lock = Mutex.new

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

def load_fixtures(path)
  return [] unless File.exist?(path)
  raw = File.read(path)
  parsed = JSON.parse(raw)
  parsed.is_a?(Array) ? parsed : []
rescue
  []
end

def save_fixtures(path, fixtures)
  tmp = "#{path}.tmp"
  File.write(tmp, JSON.pretty_generate(fixtures))
  File.rename(tmp, path)
end

def prune_old_fixtures!(fixtures, now_utc)
  # Keep recent fixtures only (2 days). This keeps the file small.
  cutoff = now_utc - (2 * 24 * 60 * 60)
  fixtures.select! do |f|
    t = Time.parse(f["kickoff_iso"].to_s) rescue nil
    t && t >= cutoff
  end
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

server.mount_proc("/fixtures") do |_req, res|
  items = []
  fixtures_lock.synchronize do
    items = load_fixtures(FIXTURES_FILE)
  end
  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, fixtures: items })
end

server.mount_proc("/fixtures/add") do |req, res|
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
  home = data["home"].to_s.strip
  away = data["away"].to_s.strip
  kickoff_iso = data["kickoff_iso"].to_s.strip
  duration_mins = Integer(data["duration_mins"] || 90) rescue 90
  competition = data["competition"].to_s.strip
  venue = data["venue"].to_s.strip
  home_score = data.key?("home_score") ? data["home_score"] : nil
  away_score = data.key?("away_score") ? data["away_score"] : nil

  if sid.empty? || home.empty? || away.empty? || kickoff_iso.empty?
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "missing fields" })
    next
  end

  begin
    Time.iso8601(kickoff_iso)
  rescue
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "invalid kickoff_iso" })
    next
  end

  if duration_mins < 10 || duration_mins > 240
    res.status = 400
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({ ok: false, error: "invalid duration_mins" })
    next
  end

  now = Time.now.utc
  item = {
    "id" => "fx_#{now.to_i}_#{rand(1_000_000)}",
    "created_at" => now.iso8601,
    "sid" => sid,
    "home" => home[0, 60],
    "away" => away[0, 60],
    "kickoff_iso" => kickoff_iso,
    "duration_mins" => duration_mins,
    "competition" => competition[0, 80],
    "venue" => venue[0, 80],
    "home_score" => home_score,
    "away_score" => away_score,
  }

  items = []
  fixtures_lock.synchronize do
    items = load_fixtures(FIXTURES_FILE)
    items.unshift(item)
    prune_old_fixtures!(items, now)
    items = items.take(500)
    save_fixtures(FIXTURES_FILE, items)
  end

  res["Cache-Control"] = "no-store"
  res["Content-Type"] = "application/json"
  res.body = JSON.dump({ ok: true, fixtures: items.take(200) })
end

rapidapi_cache = { at: 0, body: nil, error: nil }
rapidapi_lock = Mutex.new

def fetch_api_football_live(rapid_key:, rapid_host:, timezone:)
  base = "https://#{rapid_host}/v3/fixtures"
  uri = URI(base)
  uri.query = URI.encode_www_form({ live: "all", timezone: timezone })

  req = Net::HTTP::Get.new(uri)
  req["x-rapidapi-key"] = rapid_key
  req["x-rapidapi-host"] = rapid_host

  Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: 8, read_timeout: 12) do |http|
    http.request(req)
  end
end

server.mount_proc("/world/live") do |_req, res|
  rapid_key = ENV["RAPIDAPI_KEY"].to_s.strip
  rapid_host = ENV.fetch("RAPIDAPI_HOST", "api-football-v1.p.rapidapi.com").to_s.strip
  timezone = ENV.fetch("API_FOOTBALL_TIMEZONE", "Europe/London").to_s.strip

  if rapid_key.empty?
    res.status = 501
    res["Cache-Control"] = "no-store"
    res["Content-Type"] = "application/json"
    res.body = JSON.dump({
      ok: false,
      error: "missing RAPIDAPI_KEY",
      hint: "Set RAPIDAPI_KEY in your terminal, then run: RAPIDAPI_KEY=YOUR_KEY ruby server.rb",
    })
    next
  end

  ttl = Integer(ENV.fetch("API_FOOTBALL_CACHE_SECONDS", "12")) rescue 12
  now = Time.now.to_i

  cached = nil
  rapidapi_lock.synchronize do
    if rapidapi_cache[:body] && (now - rapidapi_cache[:at]) < ttl
      cached = rapidapi_cache[:body]
    end
  end

  if cached
    res["Cache-Control"] = "no-store"
    res["Content-Type"] = "application/json"
    res.body = cached
    next
  end

  begin
    api_res = fetch_api_football_live(rapid_key: rapid_key, rapid_host: rapid_host, timezone: timezone)
    body = api_res.body.to_s
    parsed = JSON.parse(body) rescue nil

    if api_res.code.to_i >= 400 || !parsed.is_a?(Hash)
      raise "bad response"
    end

    items = []
    (parsed["response"] || []).each do |row|
      fx = row["fixture"] || {}
      st = fx["status"] || {}
      league = row["league"] || {}
      teams = row["teams"] || {}
      goals = row["goals"] || {}

      items << {
        "id" => fx["id"],
        "league" => [league["name"], league["country"]].compact.join(" · "),
        "home" => (teams.dig("home", "name") || ""),
        "away" => (teams.dig("away", "name") || ""),
        "home_score" => goals["home"],
        "away_score" => goals["away"],
        "elapsed" => st["elapsed"],
        "status_short" => st["short"],
      }
    end

    payload = JSON.dump({
      ok: true,
      source: "api-football",
      updated_at: Time.now.utc.iso8601,
      count: items.length,
      fixtures: items.take(500),
    })

    rapidapi_lock.synchronize do
      rapidapi_cache[:at] = now
      rapidapi_cache[:body] = payload
      rapidapi_cache[:error] = nil
    end

    res["Cache-Control"] = "no-store"
    res["Content-Type"] = "application/json"
    res.body = payload
  rescue
    err_payload = JSON.dump({
      ok: false,
      error: "api_football_failed",
      hint: "Check your RAPIDAPI_KEY plan/limits and internet connection.",
    })
    rapidapi_lock.synchronize do
      rapidapi_cache[:at] = now
      rapidapi_cache[:body] = nil
      rapidapi_cache[:error] = err_payload
    end
    res.status = 502
    res["Cache-Control"] = "no-store"
    res["Content-Type"] = "application/json"
    res.body = err_payload
  end
end

server.mount_proc("/health") do |_req, res|
  res["Content-Type"] = "text/plain"
  res.body = "ok\n"
end

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

server.start
